'use client';
// 圖片/檔案儲存 (v2.0)
//  · 伺服器模式：上傳到 Supabase Storage 儲存桶(ohome)，保存的值是公開 URL
//  · 本機模式：IndexedDB（資料中只保存檔案 id）
// 畫面程式碼始終只處理「參照字串」，因此兩種模式可以使用相同的程式碼運作。
import React, { useEffect, useState } from 'react';
import { newId } from './postStore';
import { backend, isServerMode } from './backend';

const DB_NAME = 'ohome-blobs';
const STORE = 'files';

/** 推測副檔名 — 上傳到 Storage 時會寫入檔案名稱 */
function extOf(blob: Blob): string {
  const t = blob.type || '';
  if (t.includes('png')) return 'png';
  if (t.includes('gif')) return 'gif';
  if (t.includes('webp')) return 'webp';
  if (t.includes('svg')) return 'svg';
  if (t.includes('jpeg') || t.includes('jpg')) return 'jpg';
  if (t.includes('font') || t.includes('woff')) return 'woff2';
  if (t.startsWith('text/')) return 'txt';
  return 'bin';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- 上傳進度狀態 (v2.0) ----------
   伺服器速度較慢時，看起來會像沒有任何反應，導致使用者再次按下上傳。
   現在可以知道目前有幾個檔案正在上傳，並顯示在畫面上。 */
export const UPLOAD_EVT = 'ohome-upload';
let uploading = 0;
const bump = (n: number) => {
  uploading = Math.max(0, uploading + n);
  window.dispatchEvent(new Event(UPLOAD_EVT));
};

/** 目前正在上傳中的檔案數 */
export function useUploading(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const h = () => setN(uploading);
    h();
    window.addEventListener(UPLOAD_EVT, h);
    return () => window.removeEventListener(UPLOAD_EVT, h);
  }, []);
  return n;
}

/* 避免同一個檔案上傳兩次 (v2.0 使用者發現) — 因為上傳速度較慢而再次按下按鈕時，
   會產生多張相同圖片的問題。內容相同時，直接回傳先前上傳的結果。
   （如果正在上傳，就一起等待該次上傳完成 — 不會重複上傳） */
const sent = new Map<string, Promise<string>>();

async function hashOf(blob: Blob): Promise<string | null> {
  try {
    const buf = await blob.arrayBuffer();
    const d = await crypto.subtle.digest('SHA-256', buf);
    return Array.from(new Uint8Array(d)).map(b => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;   // 如果不是安全內容環境，就無法取得雜湊值 — 此時直接上傳
  }
}

/** 儲存 Blob → 回傳參照字串（伺服器模式：公開 URL · 本機模式：檔案 id） */
export async function putBlob(blob: Blob): Promise<string> {
  const key = await hashOf(blob);
  const hit = key ? sent.get(key) : undefined;
  if (hit) return hit;
  const job = putBlobNew(blob);
  if (key) {
    sent.set(key, job);
    // 上傳失敗的檔案不留在快取中 — 必須能夠再次嘗試
    job.catch(() => sent.delete(key));
  }
  return job;
}

async function putBlobNew(blob: Blob): Promise<string> {
  bump(1);
  try {
    return await putBlobRaw(blob);
  } finally {
    bump(-1);
  }
}

async function putBlobRaw(blob: Blob): Promise<string> {
  const be = isServerMode() ? backend() : null;
  if (be) return be.uploadFile(blob, extOf(blob));   // 伺服器模式 — 回傳公開 URL
  const id = newId();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  return id;
}

/** promoteToStorage 的結果 — 如果沒有成功，也會告訴你**為什麼**沒有成功。
 * 如果靜默失敗，使用者會卡在「明明上傳了，為什麼看不到」的問題上 (v2.0 使用者指出)。 */
export type PromoteResult =
  | { kind: 'already' }                 // 已經是儲存空間地址 — 不需要處理
  | { kind: 'local-mode' }              // 沒有伺服器連線 — 沒有可以上傳的地方
  | { kind: 'no-origin' }               // 此瀏覽器沒有原始檔案（是在其他瀏覽器上傳的）
  | { kind: 'uploaded'; url: string }
  | { kind: 'failed'; error: string };

/**
 * 將只存在瀏覽器中的檔案上傳到伺服器儲存空間 (v2.0 使用者發現)。
 *
 * 在連接後端之前儲存的圖片，其參照是 IndexedDB 檔案 id，因此只有在上傳圖片的那個瀏覽器中
 * 看得到；如果在其他地方登入就看不到。只要原始檔案還存在這個瀏覽器中，就會將它上傳到儲存空間。
 *
 * putBlob 會使用內容雜湊來過濾，因此即使被呼叫多次，同一個檔案也不會被上傳兩次。
 */
export async function promoteToStorage(ref?: string): Promise<PromoteResult> {
  if (!ref || /^(https?:|data:)/.test(ref)) return { kind: 'already' };
  if (!isServerMode()) return { kind: 'local-mode' };
  // blob: 在重新整理後就會失效的參照 — 無法找回原始檔案
  if (ref.startsWith('blob:')) return { kind: 'no-origin' };
  let blob: Blob | null = null;
  try {
    blob = await getBlob(ref);
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
  if (!blob) return { kind: 'no-origin' };
  try {
    const url = await putBlob(blob);
    return url === ref ? { kind: 'already' } : { kind: 'uploaded', url };
  } catch (e) {
    return { kind: 'failed', error: e instanceof Error ? e.message : String(e) };
  }
}

/** 全部檔案列表 (id → Blob) — 用於資料備份匯出 (5.2) */
export async function allBlobs(): Promise<Map<string, Blob>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = new Map<string, Blob>();
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) { resolve(out); return; }
      out.set(String(cur.key), cur.value as Blob);
      cur.continue();
    };
    req.onerror = () => reject(req.error);
  });
}

/** 使用指定 id 儲存 Blob — 用於備份還原（保留原有 id） */
export async function putBlobAs(id: string, blob: Blob): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getBlob(id: string): Promise<Blob | null> {
  // 伺服器模式中儲存的值是公開 URL — 直接取得即可（用於備份 zip 匯出等）
  if (/^https?:/.test(id)) {
    try {
      const res = await fetch(id);
      return res.ok ? await res.blob() : null;
    } catch { return null; }
  }
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => resolve((req.result as Blob) ?? null);
    req.onerror = () => reject(req.error);
  });
}

/* 工作階段內的 objectURL 快取 (id → url) */
const urlCache = new Map<string, string>();

/**
 * 檔案參照 → 可顯示的 URL。
 * - http(s)/data: 直接使用
 * - blob: 重新整理後失效的參照 → undefined（使用預設佔位圖）
 * - 其他則視為 IndexedDB 檔案 id 並載入
 */
export function useBlobUrl(ref?: string): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => {
    if (!ref) return undefined;
    if (/^(https?:|data:)/.test(ref)) return ref;
    if (ref.startsWith('blob:')) return undefined;
    return urlCache.get(ref);
  });

  useEffect(() => {
    if (!ref) { setUrl(undefined); return; }
    if (/^(https?:|data:)/.test(ref)) { setUrl(ref); return; }
    if (ref.startsWith('blob:')) { setUrl(undefined); return; }
    if (urlCache.has(ref)) { setUrl(urlCache.get(ref)); return; }
    let alive = true;
    getBlob(ref).then(b => {
      if (b && alive) {
        const u = URL.createObjectURL(b);
        urlCache.set(ref, u);
        setUrl(u);
      }
    }).catch(() => { /* 找不到時使用佔位圖 */ });
    return () => { alive = false; };
  }, [ref]);

  return url;
}

/** 檔案參照圖片 — 找不到時使用佔位圖(ph) 備用 */
export function BlobImg({ fileRef, ph, alt, style, imgStyle, label }: {
  fileRef?: string; ph?: string; alt?: string;
  style?: React.CSSProperties; imgStyle?: React.CSSProperties; label?: string;
}) {
  const url = useBlobUrl(fileRef);
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={alt ?? ''} style={{ width: '100%', height: '100%', objectFit: 'cover', ...imgStyle }} />;
  }
  return <div className={`ph ${ph ?? ''}`} style={{ width: '100%', height: '100%', ...style }}>{label && <span>{label}</span>}</div>;
}