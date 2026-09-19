'use client';
// 備份・還原・選擇性初始化（v2.0）
//  · 伺服器模式：將 DB 的內容・設定 + Storage 圖片打包成 zip（即使還原到其他 DB，圖片網址也會自動替換）
//  · 本機模式：localStorage + IndexedDB
//  · 初始化：可以依照選單個別選擇（伺服器模式下也會從 DB 中刪除）
import { allBlobs, putBlobAs } from './blobStore';
import { backend, COLLECTION_OF } from './backend';
import { dumpAll, loadAll, collectRefs, readFileByRef, isFileUrl, type Snapshot } from './transfer';
import { removeSetting } from './settingStore';

/** 會員帳號相關的 Key——在備份／初始化時另外處理 */
export const MEMBER_KEYS = [
  'ohome.mockreg.v1',    // 瀏覽器帳號（本機模式）
  'ohome.mockuser.v1',   // 登入工作階段
  'ohome.membertags.v1', // 會員標籤
  'ohome.invite.v1',     // 加入碼
  'ohome.setup.v1',      // 安裝完成標記
];

const SITE_KEYS = [
  'ohome.theme.v2', 'ohome.theme.v1', 'ohome.themeCss.v1', 'ohome.themePresets.v1', 'ohome.intro.v1', 'ohome.links.v1',
  'ohome.fonts.v2', 'ohome.fonts.v1', 'ohome.menuset.v1', 'ohome.site.v1', 'ohome.pagetext.v1',
  'ohome.cursor.v1', 'ohome.bgm.v1', 'ohome.bgm.fold', 'ohome.boardset.v1', 'ohome.boards.v1',
  'ohome.commset.v1', 'ohome.memoset.v1', 'ohome.threadset.v1', 'ohome.trpgset.v1',
  'ohome.moods.v1', 'ohome.relqsets.v1', 'ohome.notifset.v1',
];

export interface ResetGroup { key: string; label: string; desc?: string; keys: string[] }

/** 內容（依選單分類）——初始化勾選框 */
export const RESET_CONTENT: ResetGroup[] = [
  { key: 'board', label: '留言板文章', keys: ['ohome.board.v1'] },
  { key: 'guest', label: '留言簿', keys: ['ohome.guest.v1'] },
  { key: 'chars', label: '角色', keys: ['ohome.chars.v1'] },
  { key: 'rels', label: '自家角色關係', keys: ['ohome.rels.v1'] },
  { key: 'backup', label: '圖庫（圖片備份）', keys: ['ohome.backup.v1'] },
  { key: 'road', label: '街景', keys: ['ohome.road.v1', 'ohome.roadnext.v1'] },
  // 正文與列表是分開儲存的（v2.0），因此必須一起刪除，否則只刪除紀錄後，正文會像幽靈一樣留下
  { key: 'trpg', label: 'TRPG 紀錄', keys: ['ohome.trpg.v1', 'ohome.trpgbody.v1'] },
  { key: 'tchars', label: 'TRPG 角色', keys: ['ohome.tchars.v1'] },
  { key: 'dotori', label: '橡實', keys: ['ohome.dotori.v1'] },
  { key: 'playlog', label: '遊玩紀錄', keys: ['ohome.playlog.v1'] },
  { key: 'rp', label: '角色扮演', keys: ['ohome.rp.v1'] },
  { key: 'threads', label: '心得串', keys: ['ohome.threads.v1'] },
  { key: 'diary', label: '日記', keys: ['ohome.diary.v1'] },
  { key: 'memo', label: '記事本', keys: ['ohome.memo.v1'] },
  { key: 'comm', label: '委託・申請者', keys: ['ohome.comm.v1', 'ohome.commapply.v1'] },
  { key: 'sched', label: '行事曆行程', keys: ['ohome.sched.v1'] },
  { key: 'notif', label: '通知', keys: ['ohome.notif.v1'] },
];

export const RESET_EXTRA: ResetGroup[] = [
  { key: 'main', label: '主頁 Widget 配置', desc: 'Widget 類型・排列・大小', keys: ['ohome.main.v1'] },
  { key: 'site', label: '網站設定', desc: '主題・字體・選單・Logo・留言板／委託設定', keys: SITE_KEYS },
  { key: 'images', label: '全部上傳圖片', desc: '所有圖片・縮圖儲存空間', keys: [] },
  // 登入帳號本身由服務（Firebase Authentication / Supabase Auth）管理，因此無法從首頁刪除
  {
    key: 'members', label: '會員列表',
    desc: '首頁的會員列表・標籤・加入碼（登入帳號本身必須在服務控制台中刪除）',
    keys: MEMBER_KEYS,
  },
];

/* ---------- 備份 ---------- */

export async function exportBackup(includeMembers: boolean): Promise<{ blob: Blob; dataCount: number; blobCount: number }> {
  const JSZip = (await import('jszip')).default;
  const zip = new JSZip();
  const be = backend();

  // 資料——伺服器模式從 DB 取得，否則從瀏覽器取得
  const snap = await dumpAll(be);
  if (!includeMembers) {
    MEMBER_KEYS.forEach(k => { delete snap.settings[k]; });
    delete snap.members;
  }
  zip.file('data.json', JSON.stringify({ ...snap, includeMembers }, null, 0));

  // 圖片——伺服器模式根據資料中記錄的網址取得，本機模式則取得整個儲存空間
  const types: Record<string, string> = {};
  let blobCount = 0;
  if (be) {
    const refs = collectRefs({ c: snap.collections, s: snap.settings }, new Set());
    for (const ref of refs) {
      if (!isFileUrl(ref)) continue;
      const blob = await readFileByRef(ref);
      if (!blob) continue;
      const name = `f${blobCount}`;
      zip.file(`blobs/${name}`, blob);
      types[name] = blob.type;
      // 記錄原本是哪個網址，方便還原時配對
      types[`${name}:ref`] = ref;
      blobCount += 1;
    }
  } else {
    const blobs = await allBlobs();
    for (const [id, b] of blobs) {
      zip.file(`blobs/${id}`, b);
      types[id] = b.type;
      blobCount += 1;
    }
  }
  zip.file('blobs.json', JSON.stringify(types));

  const dataCount = Object.values(snap.collections).reduce((n, l) => n + (l?.length ?? 0), 0)
    + Object.keys(snap.settings).length;
  return { blob: await zip.generateAsync({ type: 'blob' }), dataCount, blobCount };
}

/* ---------- 還原 ---------- */

export async function importBackup(file: File): Promise<{ dataCount: number; blobCount: number; hasMembers: boolean }> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file('data.json');
  if (!dataFile) throw new Error('這不是備份檔案（沒有 data.json）');
  const parsed = JSON.parse(await dataFile.async('string')) as Partial<Snapshot> & { data?: Record<string, string> };

  const typesFile = zip.file('blobs.json');
  const types: Record<string, string> = typesFile ? JSON.parse(await typesFile.async('string')) : {};

  /* 舊版本（v1）備份——整個 localStorage 儲存內容 */
  if (parsed.data && !parsed.collections) {
    for (const [k, v] of Object.entries(parsed.data)) localStorage.setItem(k, v);
    const files = zip.file(/^blobs\//);
    for (const f of files) {
      const id = f.name.slice(6);
      const buf = await f.async('blob');
      await putBlobAs(id, types[id] ? new Blob([buf], { type: types[id] }) : buf);
    }
    return {
      dataCount: Object.keys(parsed.data).length,
      blobCount: files.length,
      hasMembers: MEMBER_KEYS.some(k => k in (parsed.data ?? {})),
    };
  }

  /* v2 備份 */
  const snap: Snapshot = {
    version: 2,
    createdAt: parsed.createdAt ?? new Date().toISOString(),
    collections: parsed.collections ?? {},
    settings: parsed.settings ?? {},
  };
  // 參照 → zip 裡的檔案名稱對照表（伺服器備份會在 blobs.json 中記錄原始網址）
  const byRef = new Map<string, string>();
  Object.entries(types).forEach(([k, v]) => { if (k.endsWith(':ref')) byRef.set(v, k.slice(0, -4)); });

  const getFile = async (ref: string): Promise<Blob | null> => {
    const name = byRef.get(ref) ?? ref;          // 本機備份的檔案名稱就是 id
    const f = zip.file(`blobs/${name}`);
    if (!f) return null;
    const buf = await f.async('blob');
    const t = types[name];
    return t ? new Blob([buf], { type: t }) : buf;
  };

  const { files, items } = await loadAll(backend(), snap, getFile);
  return {
    dataCount: items,
    blobCount: files,
    hasMembers: MEMBER_KEYS.some(k => k in snap.settings),
  };
}

/* ---------- 初始化 ---------- */

/** 初始化結果——如果悄悄吞掉錯誤，畫面會顯示「已刪除」，但 DB 中實際上仍然存在 */
export interface ResetReport { rows: number; files: number; members: number; failed: string[] }

export async function resetGroups(selected: string[]): Promise<ResetReport> {
  const all = [...RESET_CONTENT, ...RESET_EXTRA];
  const keys = new Set<string>();
  for (const g of all) {
    if (!selected.includes(g.key)) continue;
    g.keys.forEach(k => keys.add(k));
  }

  const report: ResetReport = { rows: 0, files: 0, members: 0, failed: [] };
  const be = backend();
  if (be) {
    // 伺服器模式——清空選取的內容集合，並刪除設定 Key
    for (const key of keys) {
      const coll = COLLECTION_OF[key];
      if (coll) {
        try {
          const rows = await be.fetchList(coll);
          if (rows.length) { await be.syncList(coll, rows, [], null); report.rows += rows.length; }
        } catch { report.failed.push(coll); }
      } else {
        try { await be.saveSetting(key, null); } catch { report.failed.push(key); }
      }
    }
    // 會員帳號——清空首頁的會員列表（profiles）。
    // 登入帳號本身（Firebase Authentication / Supabase Auth）需要管理員金鑰才能刪除，
    // 公開首頁無法執行——必須在控制台中刪除（安裝指南會提供說明）。
    if (selected.includes('members')) {
      try {
        const me = (await be.currentUser())?.id;
        for (const m of await be.listMembers()) {
          if (m.id === me) continue;   // 保留目前登入的管理員
          try { await be.deleteMember(m.id); report.members += 1; } catch { report.failed.push(`profile:${m.id}`); }
        }
      } catch { report.failed.push('profiles'); }
    }
    // 全部上傳圖片——連儲存空間中的檔案也實際刪除（以前只刪除參照，容量仍然保留）
    if (selected.includes('images')) {
      try {
        const files = await be.listFiles();
        for (const f of files) {
          try { await be.deleteFile(f.ref); report.files += 1; } catch { report.failed.push(f.ref); }
        }
      } catch { report.failed.push('storage'); }
    }
  }

  keys.forEach(k => { removeSetting(k); try { localStorage.removeItem(k); } catch { /* 忽略 */ } });
  if (selected.includes('images')) {
    try { indexedDB.deleteDatabase('ohome-blobs'); } catch { /* 忽略 */ }
  }
  return report;
}