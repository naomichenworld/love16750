'use client';
// 伺服器連線設定 — 不是在建置時讀取 env，而是在**執行期間**讀取。（v2.0）
//
// 因為必須讓拿到部署版（zip）的人不需要重新建置，就能連接自己的專案，
// 所以直接使用安裝畫面中輸入的值。Supabase 的 anon key 和 Firebase 的 apiKey
// 本來就是會公開在瀏覽器端的值（反正最後都會進入 bundle），真正的安全性由伺服器規則負責。
//
// 讀取順序：
//   1) /ohome.config.json  — 放在部署網站上的公開設定。**所有訪客**都會取得這個值。
//   2) localStorage        — 安裝畫面剛輸入的值（管理員瀏覽器可以立即使用）
//   3) NEXT_PUBLIC_* env    — 自己直接建置使用時
// 只要有 1，就永遠優先 — 避免因為管理員在本機留下的值，導致訪客看到不同的 DB。
import type { BackendConfig, BackendKind } from './backend/types';

export type { BackendConfig, BackendKind };

const LS_KEY = 'ohome.server.v1';
const FILE_PATH = '/ohome.config.json';

let cache: BackendConfig | null = null;
let loaded = false;
/** 設定的來源（v2.0）— 'local' 表示只有這個瀏覽器有：訪客會看到安裝畫面 */
export type ConfigSource = 'file' | 'local' | 'env';
let source: ConfigSource | null = null;

function normalize(v: unknown): BackendConfig | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, string>;
  if (o.kind === 'firebase' || (o.apiKey && o.projectId)) {
    if (!o.apiKey || !o.projectId || !o.appId) return null;
    return {
      kind: 'firebase',
      apiKey: o.apiKey,
      authDomain: o.authDomain || `${o.projectId}.firebaseapp.com`,
      projectId: o.projectId,
      storageBucket: o.storageBucket || `${o.projectId}.appspot.com`,
      appId: o.appId,
      messagingSenderId: o.messagingSenderId,
      databaseId: o.databaseId || undefined,
    };
  }
  if (o.url && o.anonKey) return { kind: 'supabase', url: o.url, anonKey: o.anonKey };
  return null;
}

export function localConfig(): BackendConfig | null {
  try { return normalize(JSON.parse(localStorage.getItem(LS_KEY) ?? 'null')); } catch { return null; }
}

export function saveLocalConfig(v: BackendConfig | null) {
  try {
    if (v) localStorage.setItem(LS_KEY, JSON.stringify(v));
    else localStorage.removeItem(LS_KEY);
  } catch { /* 忽略 */ }
  cache = v;
  source = v ? 'local' : null;
  loaded = true;
}

function envConfig(): BackendConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anonKey) return { kind: 'supabase', url, anonKey };
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID;
  if (apiKey && projectId && appId) {
    return normalize({
      kind: 'firebase', apiKey, projectId, appId,
      authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? '',
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? '',
      databaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID ?? '',
    });
  }
  return null;
}

async function fileConfig(): Promise<BackendConfig | null> {
  try {
    const res = await fetch(FILE_PATH, { cache: 'no-store' });
    if (!res.ok) return null;
    return normalize(await res.json());
  } catch { return null; }
}

/** 最終設定 — App 啟動時確認一次，之後使用快取 */
export async function loadServerConfig(): Promise<BackendConfig | null> {
  if (loaded) return cache;
  const file = await fileConfig();
  const local = file ? null : localConfig();
  const env = file || local ? null : envConfig();
  cache = file ?? local ?? env;
  source = file ? 'file' : local ? 'local' : env ? 'env' : null;
  loaded = true;
  return cache;
}

export function serverConfig(): BackendConfig | null { return cache; }
export function serverConfigLoaded(): boolean { return loaded; }
/** 目前使用中的設定來源 — 'local' 表示尚未傳給訪客，因此用於顯示警告（v2.0） */
export function serverConfigSource(): ConfigSource | null { return source; }

/** 從安裝畫面下載的檔案 — 上傳到儲存庫的 public/ 後，也會套用到訪客 */
export function configFileText(v: BackendConfig): string {
  return `${JSON.stringify(v, null, 2)}\n`;
}

/** 輸入值格式檢查 — 可以抓出常見錯誤（控制台網址、service_role key、貼錯的設定） */
export function validateConfig(v: BackendConfig): string | null {
  if (v.kind === 'supabase') {
    if (!v.url.trim() || !v.anonKey.trim()) return '請輸入 Project URL 和 anon key。';
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(v.url.trim())) {
      return 'Project URL 格式不正確 — 必須是 https://xxxx.supabase.co 這種形式。';
    }
    if (v.anonKey.trim().length < 40) return 'anon key 太短 — 請確認是否有完整貼上整個值。';
    if (/service_role/i.test(v.anonKey)) return '絕對不能放入 service_role key — 請放入 anon（公開）key。';
    return null;
  }
  if (!v.apiKey.trim() || !v.projectId.trim() || !v.appId.trim()) {
    return 'apiKey・projectId・appId 都是必要項目 — 請直接貼上 Firebase Console 中 Web App 的設定。';
  }
  if (!/^AIza/.test(v.apiKey.trim())) return 'apiKey 格式不正確 — 必須是以 AIza… 開頭的值。';
  if (/^[A-Za-z0-9_-]+:.+:web:/.test(v.appId.trim()) === false) {
    return 'appId 格式不正確 — 必須是 1:1234567890:web:abcdef 這種形式。';
  }
  return null;
}

/** 將從 Firebase Console 複製的設定程式碼整段貼上後，只擷取其中的值 */
export function parseFirebaseSnippet(text: string): Partial<Record<string, string>> | null {
  const pick = (k: string) => {
    const m = text.match(new RegExp(`${k}\\s*[:=]\\s*["'\`]([^"'\`]+)["'\`]`));
    return m?.[1];
  };
  const apiKey = pick('apiKey');
  const projectId = pick('projectId');
  if (!apiKey && !projectId) return null;
  return {
    apiKey, projectId,
    authDomain: pick('authDomain'),
    storageBucket: pick('storageBucket'),
    appId: pick('appId'),
    messagingSenderId: pick('messagingSenderId'),
  };
}
