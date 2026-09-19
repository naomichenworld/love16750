'use client';
// 內容儲存層（v2.0）— 直接交給後端適配器（Supabase/Firebase）。
//
// 整個 App 都採用「將整個列表陣列替換後儲存」的方式（useLocalList）。
// 為了不修改那 86 個呼叫位置，同時讓 DB 維持「1 個項目 = 1 個資料列／文件」的結構，
// 儲存時會比較舊陣列與新陣列，只將有變動的部分傳送出去（適配器的 syncList）。
import { backend, COLLECTION_OF } from './backend';
import type { ListItem } from './backend';

export { COLLECTION_OF as TABLE_OF };

export async function fetchList<T extends ListItem>(coll: string): Promise<T[]> {
  const be = backend();
  return be ? be.fetchList<T>(coll) : [];
}

export async function syncList<T extends ListItem>(
  coll: string, prev: T[], next: T[], uid: string | null,
): Promise<void> {
  const be = backend();
  if (be) await be.syncList(coll, prev, next, uid);
}

export function subscribeTable(coll: string, onChange: () => void): () => void {
  const be = backend();
  return be ? be.subscribe(coll, onChange) : () => { /* 本機模式 */ };
}

/* ---------- 網站設定（主題・選單・字體・主頁小工具等 key/value） ---------- */

export async function fetchSetting<T>(key: string): Promise<T | null> {
  const be = backend();
  return be ? be.fetchSetting<T>(key) : null;
}

export async function saveSetting(key: string, value: unknown): Promise<void> {
  const be = backend();
  if (be) await be.saveSetting(key, value);
}

export async function fetchAllSettings(): Promise<Record<string, unknown>> {
  const be = backend();
  return be ? be.fetchAllSettings() : {};
}