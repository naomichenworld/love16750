// 用於分享連結的標題（v2.0）— 在伺服器端建立的 Metadata。
//
// 瀏覽器分頁標題是在畫面顯示後才修改，因此對於預先讀取連結的一方（LINE・Discord・搜尋）來說，
// 並不會看到這個標題。那些服務只會看到伺服器回傳的 HTML，因此一直都會使用預設標題。
// 所以伺服器端也要讀取一次相同的設定來建立標題。
//
// 連線資訊從部署時放在 public/ohome.config.json 中的檔案讀取（訪客也能看到的值），
// 設定則透過各服務的公開讀取 API 取得 — 反正網站設定本來就必須讓所有人都能讀取，
// 才能讓訪客看到相同的網站樣式（安全規則也是這樣開放的）。
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface SiteMeta { title: string; subtitle?: string; crawlDesc?: string; favicon?: string }

/** 分頁圖示只有在**儲存庫網址**時伺服器才能使用 —
 * 本機模式的檔案 id 只有在該瀏覽器中才有意義，伺服器無法知道（DocIcon 會在畫面上處理） */
const httpOnly = (v?: string) => (v && /^https?:\/\//.test(v) ? v : undefined);

const SETTING_KEY = 'ohome.site.v1';
const FALLBACK: SiteMeta = { title: 'O.HOME' };

type Cfg =
  | { kind: 'firebase'; projectId: string; apiKey: string; databaseId?: string }
  | { kind: 'supabase'; url: string; anonKey: string };

/** 讀取部署時放上的連線設定 — 沒有的話使用 env，再沒有就回傳 null */
async function readConfig(): Promise<Cfg | null> {
  try {
    const raw = await readFile(path.join(process.cwd(), 'public', 'ohome.config.json'), 'utf8');
    const o = JSON.parse(raw) as Record<string, string>;
    if (o.apiKey && o.projectId) {
      return { kind: 'firebase', projectId: o.projectId, apiKey: o.apiKey, databaseId: o.databaseId };
    }
    if (o.url && o.anonKey) return { kind: 'supabase', url: o.url, anonKey: o.anonKey };
  } catch { /* 如果檔案不存在，就使用 env */ }
  const pid = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const key = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (pid && key) {
    return { kind: 'firebase', projectId: pid, apiKey: key, databaseId: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_ID };
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && anon) return { kind: 'supabase', url, anonKey: anon };
  return null;
}

/** 從 Firestore REST 回應中取出字串值（文件回傳時會包上一層型別） */
function fromFirestore(doc: unknown): SiteMeta | null {
  const fields = (doc as { fields?: Record<string, unknown> })?.fields;
  const v = (fields?.value as { stringValue?: string; mapValue?: { fields?: Record<string, { stringValue?: string }> } });
  // 設定是以 Map 儲存，而不是 JSON 字串
  const m = v?.mapValue?.fields;
  const title = m?.title?.stringValue;
  const docTitle = m?.docTitle?.stringValue;
  const subtitle = m?.subtitle?.stringValue;
  const crawlDesc = m?.crawlDesc?.stringValue;
  const favicon = httpOnly(m?.favicon?.stringValue);
  // 即使沒有設定標題，也要保留描述・圖示 — 以前標題為空時會整個丟掉，
  // 因此只設定了爬蟲文字的情況下，那段文字會被靜默忽略（v2.0）
  const t = (docTitle || '').trim() || (title ? `${title} — 個人首頁` : '');
  if (!t && !crawlDesc && !subtitle && !favicon) return null;
  return { title: t || FALLBACK.title, subtitle, crawlDesc, favicon };
}

/**
 * 從伺服器讀取網站標題 — 失敗時會靜默使用預設值。
 * 5 分鐘快取：標題不會經常修改，如果每次請求都呼叫外部服務，首次回應會變慢。
 */
export async function siteMeta(): Promise<SiteMeta> {
  try {
    const cfg = await readConfig();
    if (!cfg) return FALLBACK;
    if (cfg.kind === 'firebase') {
      const db = cfg.databaseId && cfg.databaseId !== '(default)' ? cfg.databaseId : '(default)';
      const url = `https://firestore.googleapis.com/v1/projects/${cfg.projectId}/databases/${encodeURIComponent(db)}`
        + `/documents/settings/${encodeURIComponent(SETTING_KEY)}?key=${cfg.apiKey}`;
      const res = await fetch(url, { next: { revalidate: 300 } });
      if (!res.ok) return FALLBACK;
      return fromFirestore(await res.json()) ?? FALLBACK;
    }
    const url = `${cfg.url.replace(/\/$/, '')}/rest/v1/site_settings?key=eq.${encodeURIComponent(SETTING_KEY)}&select=value`;
    const res = await fetch(url, {
      headers: { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.anonKey}` },
      next: { revalidate: 300 },
    });
    if (!res.ok) return FALLBACK;
    const rows = await res.json() as
      { value?: { title?: string; docTitle?: string; subtitle?: string; crawlDesc?: string; favicon?: string } }[];
    const v = rows?.[0]?.value;
    // 即使沒有設定標題，也要保留描述・圖示（與上面的 Firestore 相同原因）
    const t = (v?.docTitle || '').trim() || (v?.title ? `${v.title} — 個人首頁` : '');
    const favicon = httpOnly(v?.favicon);
    return { title: t || FALLBACK.title, subtitle: v?.subtitle, crawlDesc: v?.crawlDesc, favicon };
  } catch {
    return FALLBACK;   // 網路・權限問題時使用預設標題
  }
}