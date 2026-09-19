'use client';
// 後端進入點（v2.0）— 根據執行期間設定，在 Supabase / Firebase 中選擇並建立其中一個。
// 沒有設定時為 null = 本機模式（瀏覽器儲存，開發・離線用）
import type { Backend, BackendConfig } from './types';

let current: Backend | null = null;
let ready = false;

export async function createBackend(cfg: BackendConfig): Promise<Backend> {
  if (cfg.kind === 'firebase') {
    const { createFirebaseBackend } = await import('./firebaseBackend');
    return createFirebaseBackend(cfg);
  }
  const { createSupabaseBackend } = await import('./supabaseBackend');
  return createSupabaseBackend(cfg);
}

/** App 啟動時執行 1 次 — 使用已確定的設定建立後端 */
export async function initBackend(cfg: BackendConfig | null): Promise<Backend | null> {
  current = cfg ? await createBackend(cfg) : null;
  ready = true;
  return current;
}

export function backend(): Backend | null { return current; }
export function backendReady(): boolean { return ready; }
export function isServerMode(): boolean { return ready && current !== null; }

export * from './types';