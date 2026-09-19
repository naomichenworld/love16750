'use client';
// Firebase 後端 — Firestore（文件＝項目）+ Auth + Storage
// 權限規則：firebase/firestore.rules · firebase/storage.rules
//
// 與 Supabase 版本統一的部分：
//  · Collection 名稱相同（posts, characters, …）
//  · 文件＝一個項目，欄位為 { data, authorId, visibility, sort }
//  · 管理員判定使用 meta/owner 文件 — 第一個登入的帳號會被登記為擁有者（規則只允許執行 1 次）
import {
  Backend, BackendCheck, BackendConfig, BackendUser, ListItem, diffList, metaOf,
} from './types';
import { visFloorOf } from '../visFloor';

type FirebaseCfg = Extract<BackendConfig, { kind: 'firebase' }>;

export async function createFirebaseBackend(cfg: FirebaseCfg): Promise<Backend> {
  const [{ initializeApp, getApps, getApp }, authMod, fsMod, stMod] = await Promise.all([
    import('firebase/app'),
    import('firebase/auth'),
    import('firebase/firestore'),
    import('firebase/storage'),
  ]);

  const app = getApps().length ? getApp() : initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain,
    projectId: cfg.projectId,
    storageBucket: cfg.storageBucket,
    appId: cfg.appId,
    ...(cfg.messagingSenderId ? { messagingSenderId: cfg.messagingSenderId } : {}),
  });

  const auth = authMod.getAuth(app);
  // 為了支援在 Console 中將資料庫建立成非 (default) 的名稱，這裡接收 Database ID
  const dbId = (cfg.databaseId ?? '').trim();
  const named = !!dbId && dbId !== '(default)';
  // ignoreUndefinedProperties — 畫面資料中沒有值的欄位會保留為 undefined（例如 grants），
  // JSON 儲存時會自動省略，但 Firestore 會拒絕。為了讓兩者行為一致，這裡讓它跳過。
  const db = (() => {
    const opts = { ignoreUndefinedProperties: true };
    try {
      return named ? fsMod.initializeFirestore(app, opts, dbId) : fsMod.initializeFirestore(app, opts);
    } catch {
      // 如果已經存在建立好的 instance，就使用它（後端被建立兩次的路徑）
      return named ? fsMod.getFirestore(app, dbId) : fsMod.getFirestore(app);
    }
  })();
  const storage = stMod.getStorage(app);

  const {
    collection, doc, getDoc, getDocs, getDocsFromServer, setDoc, deleteDoc, query, where, onSnapshot, writeBatch, limit,
  } = fsMod;
  type Cons = ReturnType<typeof where>;

  // Firestore 如果無法連接伺服器，SDK 會無限重試 — 防止寫入永遠無法結束
  const TIMEOUT = Symbol('timeout');
  const withLimit = <X,>(p: Promise<X>, ms = 12000) =>
    Promise.race([p, new Promise<typeof TIMEOUT>(r => setTimeout(() => r(TIMEOUT), ms))]);
  const NO_REACH = dbId
    ? `無法儲存至 Firestore — 請確認 Database ID「${dbId}」是否正確。`
    : '無法儲存至 Firestore — 請確認是否已建立資料庫，以及名稱是否為 (default)。';

  /** 管理員判定 — meta/owner 文件的 uid 或 admins 列表 */
  const ownerInfo = async (): Promise<{ uid?: string; admins?: string[] } | null> => {
    try {
      const snap = await getDoc(doc(db, 'meta', 'owner'));
      return snap.exists() ? (snap.data() as { uid?: string; admins?: string[] }) : null;
    } catch { return null; }
  };

  // 避免每次讀取列表都重新讀取 meta/owner（讀取次數也會產生費用）
  let ownerCache: { uid?: string; admins?: string[] } | null | undefined;
  const ownerNow = async () => {
    if (ownerCache === undefined) ownerCache = await ownerInfo();
    return ownerCache;
  };
  const isAdminNow = async () => {
    const u = auth.currentUser;
    if (!u) return false;
    const own = await ownerNow();
    return own?.uid === u.uid || (own?.admins ?? []).includes(u.uid);
  };
  authMod.onAuthStateChanged(auth, () => { ownerCache = undefined; });

  /**
   * 根據登入狀態決定列表查詢條件。
   *
   * Firestore 如果查詢中混有**依規則無法讀取的文件，整個查詢都會被拒絕。**
   * （Supabase 的 RLS 會靜默篩掉資料列，因此不加條件也可以讀取，但這裡不是如此。）
   * 如果不加條件讀取，未登入訪客甚至連完全公開的文章都看不到 — 因為整個列表請求會被拒絕。
   *
   * 特意不加入排序（orderBy）。where + orderBy 的組合需要建立複合索引，
   * 這會要求安裝者在 Console 中另外新增索引 — 因此改為取得資料後再使用 sort 排序。
   */
  const readSets = async (): Promise<Cons[][]> => {
    const u = auth.currentUser;
    if (!u) return [[where('visibility', '==', 'public')]];
    if (await isAdminNow()) return [[]];                    // 管理員：全部
    // 會員：取得完全公開＋會員公開，以及另外取得自己撰寫的文章（包含非公開），最後合併
    return [[where('visibility', 'in', ['public', 'member'])], [where('authorId', '==', u.uid)]];
  };

  const listQuery = (coll: string, cs: Cons[]) =>
    (cs.length ? query(collection(db, coll), ...cs) : query(collection(db, coll)));

  const toUser = async (u: { uid: string; email?: string | null; displayName?: string | null } | null): Promise<BackendUser | null> => {
    if (!u) return null;
    // 不直接使用電子郵件作為名稱 — 否則會員列表・留言中會直接暴露其他人的郵件地址。
    // （儲存個人資料後，displayName 可能還沒更新，因此可能會落到這裡）
    let nickname = u.displayName || (u.email ? u.email.split('@')[0] : 'user');
    let avatarUrl: string | undefined;
    let avatarColor: string | undefined;
    try {
      const p = await getDoc(doc(db, 'profiles', u.uid));
      if (p.exists()) {
        const d = p.data() as { nickname?: string; avatarUrl?: string; avatarColor?: string };
        nickname = d.nickname ?? nickname;
        avatarUrl = d.avatarUrl;
        avatarColor = d.avatarColor;
      }
    } catch { /* 規則阻擋時使用預設值 */ }
    const own = await ownerInfo();
    const isAdmin = !!own && (own.uid === u.uid || (own.admins ?? []).includes(u.uid));
    return {
      id: u.uid, nickname, role: isAdmin ? 'admin' : 'member',
      email: u.email ?? undefined, avatarUrl, avatarColor,
    };
  };

  const humanError = (e: unknown): string => {
    const code = (e as { code?: string })?.code ?? '';
    if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
      return '帳號或密碼不正確。';
    }
    if (code.includes('email-already-in-use')) return '此電子郵件已經有人使用。';
    if (code.includes('weak-password')) return '密碼必須至少 6 個字元。';
    if (code.includes('invalid-email')) return '電子郵件格式不正確。';
    if (code.includes('operation-not-allowed')) return '請在 Firebase Console 開啟電子郵件／密碼登入（Authentication → Sign-in method）。';
    if (code.includes('permission-denied')) return '沒有權限 — 請確認安全規則是否已套用。';
    return (e as { message?: string })?.message ?? '未知錯誤。';
  };

  return {
    kind: 'firebase',

    async check(): Promise<BackendCheck> {
      const fail = (p: Partial<BackendCheck>): BackendCheck =>
        ({ ok: false, reachable: false, schema: false, hasAdmin: false, message: '', ...p });
      // Firestore 不需要預先建立資料表 — 改為確認「是否可以讀取（安全規則是否套用）」。
      // 必須使用 getDocsFromServer — 一般 getDocs 即使無法連接伺服器，也可能透過本機快取成功，
      // 導致資料庫不存在時仍然通過檢查（之後寫入時才卡住）。
      try {
        const r = await withLimit(getDocsFromServer(query(collection(db, 'settings'), limit(1))));
        if (r === TIMEOUT) {
          return fail({ message: '沒有收到回應 — 請確認 projectId 是否正確，以及是否已建立 Firestore 資料庫。' });
        }
      } catch (e) {
        const code = (e as { code?: string })?.code ?? '';
        const msg = (e as { message?: string })?.message ?? '';
        if (code.includes('permission-denied')) {
          return fail({ reachable: true, message: '安全規則尚未套用 — 請將下方規則貼到 Firebase Console 的 Firestore → 規則，並發布。' });
        }
        // 資料庫本身不存在時 — 最常見的第一次安裝錯誤
        if (code.includes('not-found') || /Database .* not found|NOT_FOUND/i.test(msg)) {
          return fail({
            message: dbId
              ? `找不到「${dbId}」資料庫 — 請在 Firebase Console 的 Firestore Database 中確認名稱是否正確。`
              : '沒有 Firestore 資料庫 — 請先到 Firebase Console → Firestore Database 點擊［建立資料庫］。如果已經建立，請確認 Database ID 是否為 (default)。',
          });
        }
        if (code.includes('unavailable') || code.includes('failed-precondition')) {
          return fail({ message: 'Firestore 尚未準備完成 — 請先在 Firebase Console 建立 Firestore 資料庫。' });
        }
        return fail({ message: `連線失敗 — ${humanError(e)}` });
      }
      const own = await ownerInfo();
      const hasAdmin = !!own?.uid;
      return {
        ok: true, reachable: true, schema: true, hasAdmin,
        message: hasAdmin ? '連線完成 — 已經有管理員帳號。請使用該帳號登入。'
          : '連線完成 — 現在可以建立管理員帳號。第一個帳號會成為此網站的管理員。',
      };
    },

    async currentUser() {
      // 等待重新整理後 Auth 恢復登入狀態
      const u = await new Promise<typeof auth.currentUser>(res => {
        const off = authMod.onAuthStateChanged(auth, x => { off(); res(x); });
      });
      return toUser(u);
    },

    onAuthChange(cb) {
      return authMod.onAuthStateChanged(auth, u => { void toUser(u).then(cb); });
    },

    async signIn(id, password) {
      try {
        await authMod.signInWithEmailAndPassword(auth, id, password);
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async signUp(id, password, nickname) {
      try {
        const cred = await authMod.createUserWithEmailAndPassword(auth, id, password);
        await authMod.updateProfile(cred.user, { displayName: nickname });
        const r = await withLimit(
          setDoc(doc(db, 'profiles', cred.user.uid), { nickname, createdAt: Date.now() }, { merge: true }));
        // 帳號（Auth）已經建立，因此要告知這件事 — 如果再次嘗試會出現「已經有人使用」的訊息
        if (r === TIMEOUT) return { ok: false, error: `${NO_REACH} (登入帳號已經建立)` };
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async signOut() { await authMod.signOut(auth); },

    async resetPassword(email) {
      try {
        await authMod.sendPasswordResetEmail(auth, email);
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; }
    },

    async updateProfile(patch) {
      const u = auth.currentUser;
      if (!u) return { ok: false, error: '需要先登入。' };
      try {
        const row: Record<string, unknown> = {};
        if (patch.nickname !== undefined) row.nickname = patch.nickname;
        if (patch.avatarUrl !== undefined) row.avatarUrl = patch.avatarUrl ?? null;
        if (patch.avatarColor !== undefined) row.avatarColor = patch.avatarColor ?? null;
        await setDoc(doc(db, 'profiles', u.uid), row, { merge: true });
        if (patch.nickname) await authMod.updateProfile(u, { displayName: patch.nickname });
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; },
    },

    /** 將第一個帳號登記為擁有者（管理員）— 規則僅允許在「不存在時」執行 1 次 */
    async claimOwner() {
      const u = auth.currentUser;
      if (!u) return { ok: false, error: '需要先登入。' };
      try {
        const own = await ownerInfo();
        if (own?.uid) return { ok: true };   // 已經有擁有者
        const r = await withLimit(setDoc(doc(db, 'meta', 'owner'), { uid: u.uid, admins: [u.uid], at: Date.now() }));
        if (r === TIMEOUT) return { ok: false, error: NO_REACH };
        ownerCache = undefined;   // 剛剛成為管理員，因此重新判定
        return { ok: true };
      } catch (e) { return { ok: false, error: humanError(e) }; },
    },

    async listMembers() {
      const own = await ownerInfo();
      const admins = new Set([own?.uid, ...(own?.admins ?? [])].filter(Boolean) as string[]);
      const snap = await getDocs(collection(db, 'profiles'));
      return snap.docs.map(d => {
        // avatarUrl 也一起取得 — 避免圖片清理將會員頭像當成「未使用檔案」刪除（v2.0 使用者回報）
        const v = d.data() as { nickname?: string; avatarUrl?: string };
        return {
          id: d.id,
          nickname: v.nickname ?? d.id,
          role: (admins.has(d.id) ? 'admin' : 'member') as 'admin' | 'member',
          avatarUrl: v.avatarUrl,
        };
      });
    },

    async fetchList<T extends ListItem>(coll: string): Promise<T[]> {
      const sets = await readSets();
      // 必須使用 getDocsFromServer — 一般 getDocs 如果有本機（離線）快取，可能會靜默成功，
      // 導致實際資料沒有更新。即時訂閱可能會因一次寫入收到兩次反應（本機反映・伺服器確認），
      // 使重新讀取重疊，而舊的快取結果又覆蓋剛剛套用的變更，造成「必須重新整理才能看到」
      // 的問題之一（v2.0 使用者發現 — 修改列表隱藏後看起來沒有套用）
      const snaps = await Promise.all(sets.map(cs => getDocsFromServer(listQuery(coll, cs))));
      // 因為要合併兩個查詢（公開部分・我的文章），所以先依文件 id 去除重複，再用 sort 排序
      const seen = new Map<string, { sort: number; item: T }>();
      snaps.forEach(s => s.docs.forEach(d => {
        if (seen.has(d.id)) return;
        const raw = d.data() as { data?: Record<string, unknown>; sort?: number };
        seen.set(d.id, { sort: raw.sort ?? 0, item: { ...(raw.data ?? {}), id: d.id } as T });
      }));
      return [...seen.values()].sort((a, b) => a.sort - b.sort).map(v => v.item);
    },

    async syncList<T extends ListItem>(coll: string, prev: T[], next: T[], uid: string | null) {
      const { inserts, updates, moves, deletes } = diffList(prev, next);
      const ops = [...inserts, ...updates];
      // Firestore 批次除了 500 個的限制外，還有**請求大小 10MiB 的限制**（v2.0 分支回報 — 大型日誌
      // 內文儲存失敗）。如果只根據數量（400）切開，大約十幾個 700KB 的內文文件就會超過 10MiB，
      // 導致整個批次被拒絕 — 因此會估算大小，在約 8MB 時提前切開。
      const parts: { item: T; sort: number }[][] = [];
      let cur: { item: T; sort: number }[] = [];
      let bytes = 0;
      for (const op of ops) {
        const size = JSON.stringify(op.item).length + 200;
        if (cur.length && (cur.length >= 400 || bytes + size > 8_000_000)) { parts.push(cur); cur = []; bytes = 0; }
        cur.push(op); bytes += size;
      }
      if (cur.length) parts.push(cur);
      for (const part of parts) {
        const batch = writeBatch(db);
        part.forEach(({ item, sort }) => {
          const { authorId, visibility, editorIds } = metaOf(item, uid, visFloorOf(coll, item));
          batch.set(doc(db, coll, item.id), {
            data: item, authorId, visibility, editorIds, sort, updatedAt: Date.now(),
          });
        });
        await batch.commit();
      }
      const chunk = <X,>(arr: X[], n: number) =>
        Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));
      // 只有位置變更的項目 — 只修改 sort（避免連內文都重新傳送，參考上方 diffList 註解）
      for (const part of chunk(moves, 400)) {
        const batch = writeBatch(db);
        part.forEach(({ id, sort }) => batch.update(doc(db, coll, id), { sort, updatedAt: Date.now() }));
        await batch.commit();
      }
      for (const part of chunk(deletes, 400)) {
        const batch = writeBatch(db);
        part.forEach(id => batch.delete(doc(db, coll, id)));
        await batch.commit();
      }
    },

    /* 重新計算並覆蓋公開範圍・編輯權限列表（v2.0）— 不修改 data・sort。
       editorIds 也會一起寫入（分支回報 — 更新前給予的編輯權限沒有以平面列表存在文件中，
       即使加入最新規則，該會員的儲存仍然會被拒絕） */
    async refreshVis<T extends ListItem>(coll: string, items: T[], uid: string | null): Promise<number> {
      let n = 0;
      for (let i = 0; i < items.length; i += 400) {
        const part = items.slice(i, i + 400);
        const batch = writeBatch(db);
        part.forEach(it => {
          const { visibility, editorIds } = metaOf(it, uid, visFloorOf(coll, it));
          batch.update(doc(db, coll, it.id), { visibility, editorIds, updatedAt: Date.now() });
        });
        await batch.commit();
        n += part.length;
      }
      return n;
    },

    subscribe(coll, onChange) {
      // 如果條件分成兩組，訂閱也分成兩個 — 原因與 fetchList 相同（避免整個查詢被拒絕）
      let offs: Array<() => void> = [];
      let stopped = false;
      void readSets().then(sets => {
        if (stopped) return;
        offs = sets.map(cs => onSnapshot(listQuery(coll, cs), () => onChange(), () => { /* 沒有權限等情況則忽略 */ }));
      });
      return () => { stopped = true; offs.forEach(off => off()); offs = []; };
    },

    async fetchSetting<T>(key: string) {
      const snap = await getDoc(doc(db, 'settings', key));
      return snap.exists() ? ((snap.data() as { value: T }).value ?? null) : null;
    },

    async saveSetting(key, value) {
      await setDoc(doc(db, 'settings', key), { value, updatedAt: Date.now() });
    },

    async fetchAllSettings() {
      const snap = await getDocs(collection(db, 'settings'));
      const out: Record<string, unknown> = {};
      snap.docs.forEach(d => { out[d.id] = (d.data() as { value: unknown }).value; });
      return out;
    },

    async uploadFile(blob, ext) {
      const path = `ohome/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const r = stMod.ref(storage, path);
      // 因為每次上傳的路徑都是唯一的，所以內容不會改變 — 使用較長的快取時間，
      // 可以讓再次造訪與 Edge Cache 獲得更好的效果
      // （如果不指定，瀏覽器每次都會重新下載，遠端 Bucket 的延遲就會一直出現）
      await stMod.uploadBytes(r, blob, {
        contentType: blob.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      });
      return await stMod.getDownloadURL(r);
    },

    async listFiles() {
      // 儲存時使用的是下載 URL，因此列表也必須回傳相同形式才能進行比對
      const res = await stMod.listAll(stMod.ref(storage, 'ohome'));
      return Promise.all(res.items.map(async it => {
        const [ref, meta] = await Promise.all([stMod.getDownloadURL(it), stMod.getMetadata(it)]);
        return { ref, size: meta.size ?? 0 };
      }));
    },

    async deleteFile(ref) {
      // Firebase SDK 也可以透過下載 URL 建立參照
      await stMod.deleteObject(stMod.ref(storage, ref));
    },

    async deleteMember(id) {
      // 只刪除 profiles 文件 — Authentication 帳號需要管理員金鑰才能刪除
      await deleteDoc(doc(db, 'profiles', id));
    },
  };

  // （deleteDoc 在刪除批次中沒有直接使用，因此僅保留參照）
  void deleteDoc;
}