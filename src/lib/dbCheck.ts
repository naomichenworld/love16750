// 連線驗證（v2.0）— 安裝畫面的［確認連線］。實際檢查由各個後端適配器負責。
import { createBackend } from './backend';
import type { BackendConfig, BackendCheck } from './backend/types';

export type { BackendCheck as DbCheck };

export async function checkDb(cfg: BackendConfig): Promise<BackendCheck> {
  try {
    const be = await createBackend(cfg);
    return await be.check();
  } catch (e) {
    return {
      ok: false, reachable: false, schema: false, hasAdmin: false,
      message: `連線失敗 — ${(e as { message?: string })?.message ?? '請重新確認設定值。'}`,
    };
  }
}