'use client';
// 網站設定儲存層（v2.0）
//
// 主題・選單・字體・Logo・首頁 Widget 位置等值，是「由管理員決定、所有訪客都會看到」的值。
// 到目前為止都只存在瀏覽器（localStorage）中，因此在公開首頁上，訪客會看到預設主題。
// → 在伺服器模式下，儲存到 DB（site_settings / settings），並在 App 啟動時一次取得後快取。
//
// 各個 Store 在渲染過程中會同步讀取值，因此 ServerBoot 會在畫面繪製之前
// 透過 primeSettings() 填入快取。之後所有讀取都是同步的（快取），所以可以維持原本的程式碼形式。
// 寫入則依序進行：快取 → localStorage（供首次繪製使用的副本）→ DB。
import { backend, isServerMode } from './backend';

const cache = new Map<string, unknown>();
let primed = false;
const EVT = 'ohome-settings';
/** 伺服器儲存失敗通知 — SettingSync 會接收後顯示在畫面上 */
export const ERR_EVT = 'ohome-setting-error';

/** 只存放在瀏覽器的值 — 例如摺疊狀態・Session・連線設定等每個人不同的值 */
const LOCAL_ONLY = new Set<string>([
  'ohome.bgm.fold', 'ohome.mockuser.v1', 'ohome.server.v1', 'ohome.setup.v1',
  'ohome.themeCss.v1',   // 首次繪製用的衍生快取（原始值是 ohome.theme.v2）
  'ohome.notif.v1',      // 通知列表是每個人不同的
  /* 通知 on/off 也是每個人不同的 — 不是伺服器網站設定（v2.0 分支回報 — 「每次重新整理都會關閉」）。
     之前被錯誤分類為伺服器設定的 key，在備份還原時一旦被上傳到伺服器，
     每次連線時那個舊值就會覆蓋本機 Toggle，不管怎麼修改都會恢復原狀。
     設定寫入只有管理員能執行，一般會員也無法修改伺服器上的設定 — 因此改回與通知列表相同的裝置儲存方式。 */
  'ohome.notifset.v1',
]);

/** 這個 key 是否只使用裝置儲存 — 避免備份還原・遷移時上傳到伺服器（v2.0） */
export const isLocalOnlySetting = (key: string) => LOCAL_ONLY.has(key);

/**
 * 會上傳到伺服器的網站設定 key — **只有這個列表中的內容才會被視為設定。**
 * 如果掃描整個 `ohome.*`，會連文章列表之類的內容 key（ohome.board.v1 等）也誤認為設定，
 * 導致錯誤顯示「尚未上傳到伺服器的設定」，按下上傳後，文章陣列還會被放進設定資料表。
 * 備份（lib/transfer）也使用相同的列表。
 */
export const SETTING_KEYS = [
  'ohome.theme.v2', 'ohome.themePresets.v1', 'ohome.fonts.v2', 'ohome.menuset.v1', 'ohome.site.v1',
  'ohome.pagetext.v1', 'ohome.cursor.v1', 'ohome.bgm.v1', 'ohome.boardset.v1', 'ohome.boards.v1',
  'ohome.commset.v1', 'ohome.memoset.v1', 'ohome.threadset.v1', 'ohome.trpgset.v1',
  'ohome.relqsets.v1', 'ohome.main.v1', 'ohome.sched.v1',
  'ohome.membertags.v1', 'ohome.invite.v1', 'ohome.roadnext.v1', 'ohome.repo.v1',
  'ohome.sections.v1', 'ohome.intro.v1', 'ohome.links.v1',
];

/** App 啟動時執行 1 次 — 將伺服器儲存的所有設定取得後放入快取 */
export async function primeSettings(): Promise<void> {
  primed = true;
  const be = backend();
  if (!be) return;
  try {
    const all = await be.fetchAllSettings();
    Object.entries(all).forEach(([k, v]) => {
      // 只存放在裝置上的 key，即使伺服器還留有值也不接收（v2.0 分支回報）—
      // 舊備份還原上傳到伺服器的通知 on/off 會在每次連線時覆蓋本機 Toggle
      if (LOCAL_ONLY.has(k)) return;
      // null = 已刪除的值（初始化就是這樣儲存的）。如果放進快取，畫面會收到 null 而不是預設值
      // 因此直接視為不存在。
      if (v == null) {
        cache.delete(k);
        try { localStorage.removeItem(k); } catch { /* 忽略 */ }
        return;
      }
      cache.set(k, v);
      // 為了首次繪製，也在本機保留一份副本（減少下次造訪時的閃爍）
      try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 忽略 */ }
    });
  } catch {
    /* 如果是規則・網路問題，就使用本機值運作 */
  }
}

export function settingsPrimed(): boolean { return primed; }

/** 同步讀取 — 伺服器快取 > localStorage > 預設值 */
export function getSetting<T>(key: string, fallback: T): T {
  // null・undefined 視為「已刪除的值」，回到預設值 —
  // 初始化會將設定儲存為 null，如果直接回傳，就會讓畫面收到 null 而不是預設值，造成錯誤。
  // （false・0・'' 都是正常值，因此只使用 != null 來過濾）
  const cached = cache.get(key);
  if (cached != null) return cached as T;
  try {
    const raw = localStorage.getItem(key);
    if (raw == null) return fallback;
    try {
      const parsed = JSON.parse(raw);
      return (parsed == null ? fallback : parsed) as T;   // 防止以前儲存的 "null" 字串
    } catch {
      // 相容以前直接儲存字串的值（例如註冊碼等）
      return (typeof fallback === 'string' ? raw : fallback) as T;
    }
  } catch { /* 忽略 */ }
  return fallback;
}

/** 用原字串儲存的值（舊版本相容）用 — 即使不是 JSON 也可以讀取 */
export function getRawSetting(key: string): string | null {
  const v = cache.get(key);
  if (v != null) return typeof v === 'string' ? v : JSON.stringify(v);
  try {
    const raw = localStorage.getItem(key);
    return raw === 'null' ? null : raw;   // 防止已刪除的值以 "null" 字串形式殘留
  } catch { return null; }
}

/** 儲存 — 快取・本機副本・DB 依序進行。DB 儲存失敗會靜默忽略（本機資料仍會保留） */
export function setSetting(key: string, value: unknown): void {
  cache.set(key, value);
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* 忽略 */ }
  if (isServerMode() && !LOCAL_ONLY.has(key)) {
    // 如果吞掉錯誤，這個瀏覽器會看起來像是已經儲存，下一次連線時卻被伺服器值覆蓋，
    // 出現「明明儲存了卻恢復原狀」的問題 — 因此會將失敗通知顯示在畫面上。
    void backend()?.saveSetting(key, value).catch(err => {
      console.error('[ohome] 設定儲存失敗', key, err);
      try {
        window.dispatchEvent(new CustomEvent(ERR_EVT, {
          detail: { key, message: (err as { message?: string })?.message ?? '' },
        }));
      } catch { /* 忽略 */ }
    });
  }
  try { window.dispatchEvent(new CustomEvent(EVT, { detail: key })); } catch { /* 忽略 */ }
}

export function removeSetting(key: string): void {
  cache.delete(key);
  try { localStorage.removeItem(key); } catch { /* 忽略 */ }
  if (isServerMode() && !LOCAL_ONLY.has(key)) {
    void backend()?.saveSetting(key, null).catch(() => { /* 忽略 */ });
  }
}

/** 其他畫面修改相同設定時的通知 */
export function onSettingChange(cb: (key: string) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent).detail as string);
  window.addEventListener(EVT, h);
  return () => window.removeEventListener(EVT, h);
}

/** 將這個瀏覽器中已設定的值上傳到伺服器（連線後執行 1 次 — 從環境設定呼叫） */
export async function pushLocalSettings(keys: string[]): Promise<number> {
  const be = backend();
  if (!be) return 0;
  let n = 0;
  for (const k of keys) {
    if (LOCAL_ONLY.has(k)) continue;
    try {
      const raw = localStorage.getItem(k);
      if (raw == null) continue;
      await be.saveSetting(k, JSON.parse(raw));
      cache.set(k, JSON.parse(raw));
      n += 1;
    } catch { /* 個別失敗則跳過 */ }
  }
  return n;
}

/**
 * 只有這個瀏覽器有、伺服器沒有的設定 key。
 *
 * 在安裝畫面先連接 DB 的一般情況下，每次修改設定時都會傳到伺服器，因此永遠是空陣列。
 * 只有先使用本機（瀏覽器儲存）設定網站，之後才連接伺服器的情況下，才會留下值，
 * 這時才需要「上傳設定」。
 * 快取是由 primeSettings 從伺服器取得後填入，因此可以作為「伺服器是否有這項設定」的判斷依據。
 */
export function unsyncedSettingKeys(): string[] {
  if (!isServerMode()) return [];
  const out: string[] = [];
  try {
    for (const k of SETTING_KEYS) {
      if (LOCAL_ONLY.has(k) || cache.has(k)) continue;
      if (localStorage.getItem(k) != null) out.push(k);
    }
  } catch { /* 忽略 */ }
  return out;
}