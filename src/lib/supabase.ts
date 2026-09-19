'use client';
// （相容入口）以前的程式碼使用的名稱 — 實際運作由後端 Adapter 負責。
// 新程式碼請直接使用 '@/lib/backend'。
import { initBackend, backend, isServerMode as backendIsServerMode } from './backend';
import { loadServerConfig } from './serverConfig';

/** App 啟動時執行 1 次 — 讀取執行期間設定並確定後端 */
export async function initSupabase() {
  return initBackend(await loadServerConfig());
}

export const isServerMode = () => backendIsServerMode();
export const hasBackend = () => backend() !== null;