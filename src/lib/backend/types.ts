'use client';
// 後端 Adapter（v2.0）— 讓 Supabase / Firebase 兩個版本使用相同的介面。
//
// 畫面程式碼只需要知道這個檔案中的型別，不需要知道實際連接的是哪個服務。
// 如果要新增其他後端，只需要實作這個介面即可。

export type BackendKind = 'supabase' | 'firebase';

/** 安裝畫面中輸入的連線資訊 — 這些都是可以公開的值（安全性由伺服器規則負責） */
export type BackendConfig =
  | { kind: 'supabase'; url: string; anonKey: string }
  | {
      kind: 'firebase';
      apiKey: string; authDomain: string; projectId: string;
      storageBucket: string; appId: string; messagingSenderId?: string;
      /** Firestore 資料庫 ID — 留空時使用 (default)。只有在主控台中建立其他名稱時才需要 */
      databaseId?: string;
    };

/** 登入使用者 */
export interface BackendUser {
  id: string;
  nickname: string;
  role: 'admin' | 'member';
  email?: string;
  avatarUrl?: string;
  avatarColor?: string;
}

/** 連線・規則檢查結果（安裝畫面的［確認連線］） */
export interface BackendCheck {
  ok: boolean;
  reachable: boolean;   // 可以連線至專案
  schema: boolean;      // 資料表／規則已準備好
  hasAdmin: boolean;    // 已存在管理員帳號
  message: string;
}

export interface ListItem { id: string; [k: string]: unknown }

export interface Backend {
  kind: BackendKind;

  /* ---- 連線檢查 ---- */
  check(): Promise<BackendCheck>;

  /* ---- 驗證 ---- */
  currentUser(): Promise<BackendUser | null>;
  onAuthChange(cb: (u: BackendUser | null) => void): () => void;
  signIn(id: string, password: string): Promise<{ ok: boolean; error?: string }>;
  signUp(id: string, password: string, nickname: string): Promise<{ ok: boolean; error?: string }>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<{ ok: boolean; error?: string }>;
  updateProfile(patch: { nickname?: string; avatarUrl?: string | null; avatarColor?: string | null }): Promise<{ ok: boolean; error?: string }>;
  /** 將第一個帳號登錄為此網站的管理員（只有在尚未有管理員時） */
  claimOwner(): Promise<{ ok: boolean; error?: string }>;
  /** 已註冊會員列表 — 用於選擇角色扮演參與者・會員管理畫面。
   *  也會提供 avatarUrl（v2.0 使用者回報）— 圖片整理過去只掃描內容・設定時，
   *  個人資料圖片因為沒有被任何地方參照，就被當成「沒有人使用的檔案」刪除了。 */
  listMembers(): Promise<{ id: string; nickname: string; role: 'admin' | 'member'; email?: string; avatarUrl?: string }[]>;

  /* ---- 列表（內容） ---- */
  fetchList<T extends ListItem>(coll: string): Promise<T[]>;
  syncList<T extends ListItem>(coll: string, prev: T[], next: T[], uid: string | null): Promise<void>;
  /** 重新計算已儲存資料列的公開範圍並覆寫（v2.0）— 將選單設為私密後，
   *  點擊「套用至文章」時會執行。內容（data）・順序（sort）不會修改。 */
  refreshVis<T extends ListItem>(coll: string, items: T[], uid: string | null): Promise<number>;
  subscribe(coll: string, onChange: () => void): () => void;

  /* ---- 設定（key/value） ---- */
  fetchSetting<T>(key: string): Promise<T | null>;
  saveSetting(key: string, value: unknown): Promise<void>;
  fetchAllSettings(): Promise<Record<string, unknown>>;

  /* ---- 圖片・檔案 ---- */
  uploadFile(blob: Blob, ext: string): Promise<string>;   // → 公開 URL
  /** 儲存庫中的所有檔案 — 用於尋找任何地方都沒有參照的檔案並刪除。
   *  即使刪除文章，圖片仍會留在儲存庫中（因為其他地方可能還有參照，因此自動刪除很危險），
   *  由管理員在環境設定中自行確認並整理。 */
  listFiles(): Promise<{ ref: string; size: number }[]>;
  deleteFile(ref: string): Promise<void>;

  /** 刪除會員個人資料（暱稱・頭像）— 會從網站的會員列表中消失。
   *  **無法刪除登入帳號本身。** Firebase Authentication / Supabase Auth 的帳號刪除
   *  需要管理員金鑰，但如果將該金鑰放在公開網站中，任何人都可以刪除帳號。
   *  帳號刪除請到各服務的主控台執行（安裝指南中有說明）。 */
  deleteMember(id: string): Promise<void>;
}

/** 內容 Collection 名稱（localStorage key → Collection／資料表）— 兩個後端使用相同名稱 */
export const COLLECTION_OF: Record<string, string> = {
  'ohome.board.v1': 'posts',
  'ohome.guest.v1': 'guestbook',
  'ohome.chars.v1': 'characters',
  'ohome.rels.v1': 'relations',
  'ohome.backup.v1': 'gallery',
  'ohome.road.v1': 'roadview',
  'ohome.trpg.v1': 'trpg_logs',
  // TRPG 日誌正文 — 與列表文件分開儲存（v2.0）。由於 Firestore 中列表顯示（listHidden）與
  // 閱覽權限（visibility）使用相同的讀取規則（查詢顯示出來的文件，單筆查詢也都會被讀取），
  // 如果要安全地滿足「即使只有自己可見，也要顯示在列表中」的條件，就必須將正文放在其他文件中
  'ohome.trpgbody.v1': 'trpg_log_bodies',
  'ohome.tchars.v1': 'trpg_chars',
  'ohome.dotori.v1': 'dotori',
  'ohome.playlog.v1': 'playlog',
  'ohome.rp.v1': 'rp_rooms',
  'ohome.threads.v1': 'threads',
  'ohome.diary.v1': 'diary',
  'ohome.memo.v1': 'memos',
  'ohome.comm.v1': 'commissions',
  'ohome.commapply.v1': 'applicants',
  'ohome.moods.v1': 'moods',
  // 留言 — 不放在文章內，而是作為獨立文件（v2.0）。如果放在文章內，每次留言都必須 UPDATE 文章，
  // 因此會受到「文章只能由作者・管理員修改」規則限制，一般會員就無法在管理員的文章下留言
  'ohome.comments.v1': 'comments',
  // 自設關係問答回答 — 不放在自設關係內，而是作為獨立文件（v2.0）。理由與留言相同：
  // 如果放在自設關係內，每次回答都必須 UPDATE 自設關係，因此一般會員無法回答
  'ohome.qaanswers.v1': 'qa_answers',
  // 角色扮演發言 — 不放在房間內，而是作為獨立文件（v2.0）。理由相同，如果放在房間內，
  // 每次發言都必須 UPDATE 房間，因此參與者無法在其他人建立的房間中發言
  'ohome.rpmsgs.v1': 'rp_messages',
  // 通知 — 從裝置儲存改為伺服器儲存（v2.0 分支版本回報「收不到通知」）。
  // 將資料列擁有者（authorId）設定為接收者，接收會員可以在任何裝置上取得通知
  'ohome.notif.v1': 'notifications',
};

export const CONTENT_COLLECTIONS = Object.values(COLLECTION_OF);

/** 比較兩個項目陣列 — 兩個後端共用的 diff（只儲存有變更的項目）。
 *
 *  **內容不變、只有位置改變的項目會分離到 moves**（v2.0 分支版本回報 — 大型日誌正文儲存失敗）。
 *  如果在列表最前方插入新項目，原有項目的位置全部會往後移；如果全部當成 updates 處理，
 *  就會連正文一起重新傳送。TRPG 日誌正文（每份文件最多 700KB）累積後，總大小可能超過
 *  Firestore 單次寫入的最大大小（10MiB），導致**新日誌的正文儲存靜默失敗** —
 *  最後會出現票券建立了，但正文卻顯示「沒有內容」。moves 只需要修改 sort 值即可儲存。 */
export function diffList<T extends ListItem>(prev: T[], next: T[]) {
  const prevMap = new Map(prev.map((it, i) => [it.id, { it, i }]));
  const nextIds = new Set(next.map(it => it.id));
  const inserts: { item: T; sort: number }[] = [];
  const updates: { item: T; sort: number }[] = [];
  const moves: { id: string; sort: number }[] = [];
  next.forEach((it, i) => {
    const before = prevMap.get(it.id);
    if (!before) inserts.push({ item: it, sort: i });
    else if (JSON.stringify(before.it) !== JSON.stringify(it)) updates.push({ item: it, sort: i });
    else if (before.i !== i) moves.push({ id: it.id, sort: i });
  });
  const deletes = prev.filter(it => !nextIds.has(it.id)).map(it => it.id);
  return { inserts, updates, moves, deletes };
}

/** 從項目中取得用於權限判定的值。
 *
 *  有 listHidden 欄位的項目（例如 TRPG 日誌列表文件）中，「是否顯示在列表」就是查詢（list）階段的
 *  公開狀態 — 與實際閱覽權限（item.visibility）分開處理（v2.0 使用者已確認：「即使只有自己可見，
 *  也必須顯示在列表中」）。Firestore・Supabase RLS 都會用相同規則判定 list/get，因此具有此欄位的
 *  文件絕對不能同時放入敏感內容（例如正文）— 一旦透過查詢暴露，單筆讀取權限也會一併開放。
 *  （因此 TRPG 日誌會將正文分開儲存到其他文件。） */
export function metaOf(item: ListItem, uid: string | null, floor = 'public') {
  const rawAuthor = typeof item.authorId === 'string' ? item.authorId : '';
  const authorId = rawAuthor || uid || null;
  const hasListHidden = typeof item.listHidden === 'boolean';
  const own = hasListHidden
    ? (item.listHidden ? 'private' : 'public')
    : (typeof item.visibility === 'string' ? item.visibility : 'public');
  /* 選單設為私密的內容，其文章也會依照該標準縮小公開範圍（v2.0 使用者要求 — 參考 visFloor）。
     **只會縮小，不會放寬** — 如果文章本身已經更嚴格，就維持原狀。像留言板文章這類完全沒有
     visibility 欄位的類型，也會在這裡決定公開範圍，因此不會因畫面顯示與否而影響伺服器端保護。 */
  const rank: Record<string, number> = { public: 0, member: 1, private: 2 };
  const visibility = (rank[floor] ?? 0) > (rank[own] ?? 0) ? floor : own;
  return { authorId, visibility, editorIds: editorIdsOf(item) };
}

/**
 * 可以由非作者會員修改此項目的會員列表（v2.0）。
 *
 * 從角色的 grants 中取得被授予「編輯權限」的會員，並另外儲存成**扁平的字串陣列**。
 * 安全規則無法從包含物件的陣列中查詢「是否有某個元素的 userId 與我相同」（Firestore 規則沒有 some()），
 * 因此需要另外提供一個規則可以直接確認的格式。
 * 如果沒有這個欄位，即使給予編輯權限，伺服器仍會拒絕儲存，因此會出現「編輯畫面可以開啟，但 SAVE 沒有反應」的情況
 * （v2.0 使用者發現 — 與留言問題的根源相同）。
 */
export function editorIdsOf(item: ListItem): string[] {
  const grants = item.grants;
  if (!Array.isArray(grants)) return [];
  return grants
    .filter((g): g is { userId: string; level: string } =>
      !!g && typeof g === 'object'
      && typeof (g as { userId?: unknown }).userId === 'string'
      && (g as { level?: unknown }).level === 'edit')
    .map(g => g.userId);
}