'use client';
// 資料匯出／載入共用引擎（v2.0）
//
// 備份（zip）・還原・移轉至其他 DB 都做相同的事情：
//   ① 從目前儲存庫讀取所有內容・設定・圖片，建立成快照
//   ② 原樣寫入目標儲存庫。
// 儲存庫改變後圖片網址也會改變，因此會將資料中的參照替換成搬移後檔案的新網址。
// （只有字串完全相同時才會替換，因此不會誤改其他值）
import { backend, COLLECTION_OF, CONTENT_COLLECTIONS } from './backend';
import type { Backend, ListItem } from './backend';
import { allBlobs, getBlob, putBlobAs, putBlob } from './blobStore';
import { getSetting, setSetting, SETTING_KEYS, isLocalOnlySetting } from './settingStore';

export interface Snapshot {
  version: 2;
  createdAt: string;
  collections: Record<string, ListItem[]>;   // Collection → 項目
  settings: Record<string, unknown>;         // 網站設定
  members?: { id: string; nickname: string; role: string; avatarUrl?: string }[];   // 僅供記錄（帳號本身無法搬移）
  /** 無法讀取的 Collection・設定（v2.0）— 必須區分「無法讀取」與「空的」。
   *  只有這個為空時才會進行圖片清理（否則會把無法讀取的文章所使用的圖片刪掉） */
  failed?: string[];
}

export type Progress = (msg: string, done?: number, total?: number) => void;

/* 網站設定 Key 列表（SETTING_KEYS）由 settingStore 管理 — 備份・移轉也使用相同列表 */

/* ---------- 圖片參照 ---------- */

/** 是否為儲存庫產生的圖片網址（Supabase Storage / Firebase Storage） */
export function isFileUrl(s: string): boolean {
  return /\/storage\/v1\/object\/public\//.test(s) || /firebasestorage\.googleapis\.com/.test(s);
}

/**
 * 取出字串**內部嵌入的**所有檔案網址（v2.0 使用者發現 — 申請者文章內圖片遺失）。
 *
 * 使用編輯器上傳的圖片會以 <img src="…"> 的形式存在文章 HTML 中。以前只判斷「這個字串
 * 是否為網址」，因此整個文章內容會被當成參照，**實際的網址卻沒有被抓出來**。結果：
 *   · 圖片清理會把正常使用中的圖片判定為「沒有人使用的檔案」並刪除
 *   · 備份 zip 以及移轉至其他 DB 時，這些圖片也會遺失。
 * HTML 屬性中的 & 會寫成 &amp;，因此要還原回來（Firebase 網址中的 token= 前）。
 */
export function extractFileUrls(s: string): string[] {
  const out: string[] = [];
  for (const m of s.match(/https?:\/\/[^\s"'<>\\)]+/g) ?? []) {
    const url = m.replace(/&amp;/g, '&').replace(/[.,;:!?]+$/, '');
    if (isFileUrl(url)) out.push(url);
  }
  return out;
}

/** 掃描整份資料，收集檔案參照字串（本機檔案 id 會透過 known 告知） */
export function collectRefs(value: unknown, known: Set<string>, out = new Set<string>()): Set<string> {
  if (typeof value === 'string') {
    if (known.has(value)) out.add(value);
    // 不論是直接作為網址，還是嵌在文章 HTML 中，都全部取出（v2.0）
    extractFileUrls(value).forEach(u => out.add(u));
    return out;
  }
  if (Array.isArray(value)) { value.forEach(v => collectRefs(v, known, out)); return out; }
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(v => collectRefs(v, known, out));
  }
  return out;
}

/** 替換參照 — 如果值本身就是網址則整個替換，如果嵌在文章 HTML 中則只替換其中的部分（v2.0） */
export function replaceRefs<T>(value: T, map: Map<string, string>): T {
  if (typeof value === 'string') {
    const exact = map.get(value);
    if (exact) return exact as unknown as T;
    // 文章內容中的網址也必須替換 — 否則搬移後仍然會指向舊儲存庫而無法顯示
    if (!isFileUrl(value)) return value;
    let s: string = value;
    for (const [from, to] of map) {
      if (s.includes(from)) s = s.split(from).join(to);
      const enc = from.replace(/&/g, '&amp;');
      if (enc !== from && s.includes(enc)) s = s.split(enc).join(to.replace(/&/g, '&amp;'));
    }
    return s as unknown as T;
  }
  if (Array.isArray(value)) return value.map(v => replaceRefs(v, map)) as unknown as T;
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    Object.entries(value as Record<string, unknown>).forEach(([k, v]) => { out[k] = replaceRefs(v, map); });
    return out as unknown as T;
  }
  return value;
}

/**
 * 尋找任何地方都沒有參照的儲存庫檔案（環境設定 > 資料備份的圖片清理）。
 *
 * 即使文章被刪除，圖片仍然會留在儲存庫中 — 因為同一張圖片可能被其他文章使用，
 * 所以直接隨著文章刪除圖片是有風險的。因此會掃描全部資料，只找出沒有人使用的檔案，
 * 再由管理員確認後刪除。
 *
 * **只要有一個地方無法讀取就完全不進行**（v2.0）— 無法讀取的 Collection 無法
 * 與「沒有文章」區分，該處使用中的圖片可能會整批被判定為「未使用檔案」而刪除。
 */
export async function findOrphanFiles(be: Backend): Promise<{ ref: string; size: number }[]> {
  const snap = await dumpAll(be);
  if (snap.failed?.length) {
    throw new Error(`${snap.failed.join(', ')}無法讀取，因此已停止清理 — `
      + '可能會連無法讀取位置所使用的圖片也一起刪除。請稍後再試');
  }
  const used = new Set<string>();
  collectRefs(snap.collections, new Set(), used);
  collectRefs(snap.settings, new Set(), used);
  // 會員個人資料照片也是正在使用的檔案（v2.0 使用者回報）— 以前只掃描
  // 內容・設定，因此抓不到這些參照，會被刪除並判定為「未使用檔案」
  collectRefs(snap.members ?? [], new Set(), used);
  const all = await be.listFiles();
  return all.filter(f => !used.has(f.ref));
}

/* ---------- 匯出 ---------- */

/** 從目前儲存庫（伺服器或瀏覽器）完整讀取資料並建立快照 */
export async function dumpAll(be: Backend | null, onProgress?: Progress): Promise<Snapshot> {
  const snap: Snapshot = {
    version: 2, createdAt: new Date().toISOString(), collections: {}, settings: {},
  };

  if (be) {
    let i = 0;
    for (const coll of CONTENT_COLLECTIONS) {
      onProgress?.(`${coll} 讀取中`, i, CONTENT_COLLECTIONS.length);
      try { snap.collections[coll] = await be.fetchList(coll); }
      catch { snap.collections[coll] = []; (snap.failed ??= []).push(coll); }
      i += 1;
    }
    onProgress?.('設定讀取中');
    try { snap.settings = await be.fetchAllSettings(); }
    catch { snap.settings = {}; (snap.failed ??= []).push('設定'); }
    // 如果會員列表也無法讀取，就記錄到 failed（v2.0 使用者回報 — 個人資料照片被清理刪除）。
    // 個人資料照片的參照只有這裡會出現，因此不能在無法讀取時執行清理
    try { snap.members = await be.listMembers(); } catch { (snap.failed ??= []).push('會員個人資料'); }
    return snap;
  }

  // 瀏覽器儲存模式
  Object.entries(COLLECTION_OF).forEach(([key, coll]) => {
    try {
      const raw = localStorage.getItem(key);
      snap.collections[coll] = raw ? JSON.parse(raw) : [];
    } catch { snap.collections[coll] = []; }
  });
  SETTING_KEYS.forEach(k => {
    const v = getSetting<unknown>(k, undefined);
    if (v !== undefined) snap.settings[k] = v;
  });
  return snap;
}

/* ---------- 載入 ---------- */

/**
 * 將快照寫入目標儲存庫。
 * files：取得「參照 → 原始位元組」的函式（如果是備份 zip 還原，就是從 zip 中取得；如果是 DB 移轉，就是從原始儲存庫取得）
 */
export async function loadAll(
  target: Backend | null,
  snap: Snapshot,
  getFile: (ref: string) => Promise<Blob | null>,
  onProgress?: Progress,
): Promise<{ files: number; items: number }> {
  // ① 先搬移圖片並建立新的網址對照表
  const knownLocal = new Set<string>();
  try { (await allBlobs()).forEach((_v, k) => knownLocal.add(k)); } catch { /* 忽略 */ }
  const refs = collectRefs({ c: snap.collections, s: snap.settings }, knownLocal);
  const map = new Map<string, string>();
  let fileCount = 0;
  let idx = 0;
  for (const ref of refs) {
    idx += 1;
    onProgress?.('圖片搬移中', idx, refs.size);
    try {
      const blob = await getFile(ref);
      if (!blob) continue;
      const next = target
        ? await target.uploadFile(blob, extOfRef(ref, blob))
        : await putSameOrNew(ref, blob);
      if (next !== ref) map.set(ref, next);
      fileCount += 1;
    } catch { /* 個別檔案失敗則跳過 */ }
  }

  // ② 將參照替換成新的網址後寫入資料
  const collections = replaceRefs(snap.collections, map);
  const settings = replaceRefs(snap.settings, map);

  let items = 0;
  if (target) {
    let i = 0;
    for (const [coll, list] of Object.entries(collections)) {
      i += 1;
      onProgress?.(`${coll} 儲存中`, i, Object.keys(collections).length);
      const rows = (list ?? []) as ListItem[];
      if (!rows.length) continue;
      await target.syncList(coll, [], rows, null);
      items += rows.length;
    }
    for (const [k, v] of Object.entries(settings)) {
      if (v === undefined || v === null) continue;
      // 僅保存在裝置上的 Key（通知開／關等）不會上傳至伺服器（v2.0 分支回報）—
      // 一旦上傳，之後每次登入都會用該值覆蓋本機設定，導致設定恢復原狀
      if (isLocalOnlySetting(k)) continue;
      await target.saveSetting(k, v);
    }
    return { files: fileCount, items };
  }

  // 瀏覽器儲存模式
  const keyOf = Object.fromEntries(Object.entries(COLLECTION_OF).map(([k, c]) => [c, k]));
  Object.entries(collections).forEach(([coll, list]) => {
    const key = keyOf[coll];
    if (!key) return;
    try { localStorage.setItem(key, JSON.stringify(list ?? [])); } catch { /* 忽略 */ }
    items += (list as ListItem[])?.length ?? 0;
  });
  Object.entries(settings).forEach(([k, v]) => { if (v !== undefined && v !== null) setSetting(k, v); });
  return { files: fileCount, items };
}

/** 本機儲存時 — 使用原本的 id 就不需要進行參照替換 */
async function putSameOrNew(ref: string, blob: Blob): Promise<string> {
  if (isFileUrl(ref)) return putBlob(blob);   // URL → 新的本機 id
  await putBlobAs(ref, blob);
  return ref;
}

function extOfRef(ref: string, blob: Blob): string {
  const m = ref.match(/\.([a-z0-9]{2,5})(?:\?|$)/i);
  if (m) return m[1].toLowerCase();
  const t = blob.type || '';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  return 'bin';
}

/** 依照參照取得原始位元組 — 以目前儲存庫為基準（DB 移轉・建立備份時） */
export async function readFileByRef(ref: string): Promise<Blob | null> {
  if (isFileUrl(ref)) {
    try {
      const res = await fetch(ref);
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  }
  return getBlob(ref);
}

/** 完整移轉至其他 DB — 從目前儲存庫讀取後寫入新的後端 */
export async function migrateTo(target: Backend, onProgress?: Progress): Promise<{ files: number; items: number }> {
  onProgress?.('正在讀取目前資料');
  const snap = await dumpAll(backend(), onProgress);
  return loadAll(target, snap, readFileByRef, onProgress);
}