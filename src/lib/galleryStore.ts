// 圖片 Roadview（4.10）・圖片備份（4.11）・TRPG 備份（4.3）資料 — localStorage（→ 預計移轉至 Supabase/R2）
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { Comment, FoldType } from './postStore';
import type { CropValue } from '@/components/ui/CropEditor';
import type { Visibility } from './charStore';
import { getRawSetting, setSetting } from './settingStore';

/* ---------- Roadview（4.10） ---------- */
export interface RoadItem {
  /** 所屬區段（v2.0）— 建立多個區段時使用。沒有則使用預設區段 */
  secId?: string;
  id: string;
  title: string;
  author: string;
  authorId: string;
  date: string;              // ISO
  imgUrl?: string;           // （舊）URL — 新上傳使用 imgId
  imgId?: string;            // IndexedDB 檔案 id（blobStore — 重新整理後也會保留）
  ph: string;                // 示範用 placeholder class
  narrow?: boolean;          // 原始圖片寬度較窄（置中對齊）
  ratio: string;             // aspect-ratio 值
  fold: { type: FoldType; label?: string } | null;
  comments: Comment[];
  no?: number;               // 圖片編號（v1.9 — 使用編號而非標題識別，通知也以編號為準）
}

export const ROAD_SEED: RoadItem[] = [];

/* ---------- 圖片備份（4.11） ---------- */
export interface BackupPost {
  /** 所屬區段（v2.0）— 建立多個區段時使用。沒有則使用預設區段 */
  secId?: string;
  id: string;
  title: string;
  type: 'log' | 'single' | 'vlist';    // 日誌型（無間隙直向）/ 單張型（左右翻頁）/ 單張直向排列（有間隙直向，v1.9）
  images: string[];          // 檔案 id 或 URL（為空時使用示範 ph — 參照 blobStore）
  thumbCrop?: CropValue;     // 代表（第一張）圖片的縮圖裁切（6.1）
  phList: string[];          // 示範用 placeholder
  desc: string;
  category: string;          // 分類標籤
  madeDate?: string;         // 製作日期（選填）
  date: string;
  author: string;
  authorId: string;
  visibility: Visibility;
  fold: { type: FoldType; label?: string } | null;
  /** 標籤（v2.0 使用者要求）— 會列在列表・卡片上，也會被搜尋到 */
  tags?: string[];
}

export const BACKUP_SEED: BackupPost[] = [];

export const BACKUP_CATEGORIES = ['合作', '塗鴉', '委託', '設定圖'];

/* ---------- TRPG 備份（4.3） ---------- */
export interface TrpgLog {
  /** 所屬區段（v2.0）— 建立多個區段時使用。沒有則使用預設區段 */
  secId?: string;
  id: string;
  no: number;                // 內部序號（用於排序 — 自動賦予）
  noText?: string;           // № 位置顯示文字（選填 — 留空時自動顯示 № 0XX）
  title: string;             // 劇本標題（必填）
  catchphrase?: string;      // 宣傳標語一句（選填）
  writer: string;            // 作者（必填）
  withText: string;          // 一同參與的人員顯示（必填）
  relId?: string;            // 自設關係連動（篩選）
  date?: string;             // 選填
  ph: string;
  thumbUrl?: string;
  thumbId?: string;          // 上傳縮圖（IndexedDB）
  thumbCrop?: CropValue;     // 縮圖裁切座標（6.1）
  thumbColor?: { c1: string; c2?: string }; // 沒有圖片時的純色／漸層
  serifTitle?: boolean;      // 個別指定標題字體的範例（字體庫為後續功能）
  visibility: Visibility;
  password?: string;         // 閱覽密碼（選填）— 即使沒有權限也可以透過密碼閱覽
  // 是否顯示在列表中（v2.0 使用者要求）— 與存取權限（誰可以開啟）無關，是控制
  // 是否在列表中顯示該項目的開關。即使是僅自己可見（private），關閉後也不會從管理員列表消失 —
  // 反過來，開啟後即使是完全公開，也只會從列表中隱藏，但直接連結仍然可以開啟。管理員在編輯模式中仍會看到隱藏標記
  listHidden?: boolean;
  // （舊版相容，v2.0）— 過去正文直接放在這份文件裡。伺服器模式下列表文件
  // 可以在查詢階段因 listHidden 被公開，因此如果把正文等敏感內容一起放在這裡就會洩漏
  // （Firestore/RLS 的特性：只要擁有列表權限，同一文件的 get 也會一起開放 — 因此
  // 僅自己可見＋顯示在列表中最初無法安全運作）。所以新的日誌會將正文分開儲存為 TrpgLogBody，
  // 這些欄位只在讀取尚未移轉的舊日誌時作為 fallback 保留 — 這類日誌只要修改後儲存一次，
  // 就會自動分離，而這些欄位也會被清空。
  body?: string;
  bodyId?: string;
  bodyHtml?: boolean;
  originalFileId?: string;
  originalName?: string;
}

/** TRPG 日誌正文 — 與列表文件（TrpgLog）分開儲存（v2.0，參見上方註解）。
 *  id 使用與日誌相同的值。visibility 複製日誌實際的閱覽權限，作為此文件本身的
 *  查詢條件 — 與列表顯示（listHidden）完全無關，此文件會獨立受到保護。 */
export interface TrpgLogBody {
  id: string;
  body: string;
  bodyId?: string;
  bodyHtml?: boolean;
  originalFileId?: string;
  originalName?: string;
  visibility: Visibility;
  /** 屬於哪個日誌備份（v2.0）— 因為與列表文件分開儲存，所以這裡也必須另外記錄所屬區段，
   *  才能讓「選單設為非公開時，文章也設為非公開」的判定套用到正文文件。沒有則使用預設區段。 */
  secId?: string;
}

/** 正文文件應使用的閱覽權限 — 如果設定密碼，則像以前的列表篩選一樣設為公開
 *  （密碼原本就無法在 Firestore 規則階段驗證，因此僅供客戶端確認使用） */
export const bodyVisibility = (l: { visibility: Visibility; password?: string }): Visibility =>
  l.password ? 'public' : l.visibility;

export const TRPG_BODY_SEED: TrpgLogBody[] = [];

/** № 位置顯示 — 如果有手動輸入文字就直接使用，否則自動顯示 № 0XX */
export const logNo = (l: TrpgLog) => l.noText || `№ ${String(l.no).padStart(3, '0')}`;

/** 自動判斷正文是否為 HTML 文件（4.3 — 與副檔名無關，以內容為判斷依據）。
 *  如果手寫文章中混入看起來像標籤的字元，可能會誤判，因此如果日誌有指定 bodyHtml，
 *  則優先使用該值（在編輯畫面的「正文顯示」中指定）。 */
export const isHtmlBody = (s: string) => /<\s*(html|body|div|p|span|table|br|style|font)[^>]*>/i.test(s);

/** 判斷是否要將這篇日誌以 HTML 顯示 — 如果有指定值就直接使用，否則根據內容判斷 */
export const showAsHtml = (l: { bodyHtml?: boolean }, body: string) => l.bodyHtml ?? isHtmlBody(body);

/** 自動判斷日誌檔案編碼 — 優先 UTF-8，如果錯誤字元很多則重新以 EUC-KR 嘗試（相容舊版日誌工具） */
export async function decodeLogText(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  const utf8 = new TextDecoder('utf-8').decode(buf);
  const bad = (utf8.match(/�/g) || []).length;
  if (bad > 2) {
    try { return new TextDecoder('euc-kr').decode(buf); } catch { return utf8; }
  }
  return utf8;
}

/**
 * 決定日誌正文的儲存位置。
 *
 * 在伺服器模式下，如果將正文以檔案形式上傳至 Storage，重新讀取時需要 fetch，
 * **必須設定儲存桶 CORS 才能看到正文**（未設定時會看起來像空白正文）。
 * 正文是文字，因此直接放進文件會比較安全 — 但 Firestore 文件上限為 1MB，
 * 所以只有非常大的日誌才會以檔案形式儲存（這種情況需要設定 CORS）。
 */
export async function saveLogBody(text: string): Promise<{ body: string; bodyId?: string }> {
  if (!text) return { body: '' };
  const { isServerMode } = await import('./backend');
  const { putBlob } = await import('./blobStore');
  const bytes = new TextEncoder().encode(text).length;
  if (isServerMode() && bytes < 700_000) return { body: text };
  return { body: '', bodyId: await putBlob(new Blob([text], { type: 'text/plain' })) };
}

/* ---------- TRPG 橡果（4.15）— 劇本願望清單 ---------- */
export type DotoriStatus = 'pledge' | 'undecided' | 'confirmed' | 'done';
export const DOTORI_STATUS_LABEL: Record<DotoriStatus, string> = {
  pledge: '空頭支票', undecided: '日程未定', confirmed: '日程確定', done: '完成',
};

/* ---------- TRPG 設定（環境設定 > TRPG 分頁，v1.9）— 狀態分類標籤＋徽章顏色 ---------- */
export interface DotoriStatusStyle { label: string; bg: string; border: string; fg: string }
export interface TrpgSettings {
  statuses: Record<DotoriStatus, DotoriStatusStyle>;
}
export const DEFAULT_TRPG_SETTINGS: TrpgSettings = {
  statuses: {
    // 繼承原本硬編碼的徽章顏色（pledge：半透明墨色 → hex 近似值 / confirmed：重點紅色）
    pledge: { label: '空頭支票', bg: '#23262b', border: '#b9bdc4', fg: '#ffffff' },
    undecided: { label: '日程未定', bg: '#7a8089', border: '#7a8089', fg: '#ffffff' },
    confirmed: { label: '日程確定', bg: '#a63a45', border: '#a63a45', fg: '#ffffff' },
    done: { label: '完成', bg: '#3c434d', border: '#3c434d', fg: '#ffffff' },
  },
};

// 讓日程未定排在空頭支票之前（v2.0 使用者要求）
export const DOTORI_STATUS_KEYS: DotoriStatus[] = ['undecided', 'pledge', 'confirmed', 'done'];

/** 橡果狀態徽章樣式（卡片右上角 — 僅顯示空頭支票／日程確定） */
export function dotoriBadgeStyle(st: DotoriStatusStyle): CSSProperties {
  return { background: st.bg, border: `1px solid ${st.border}`, color: st.fg };
}

const TRPG_SET_KEY = 'ohome.trpgset.v1';

export function useTrpgSettings(): [TrpgSettings, (patch: Partial<TrpgSettings>) => void, boolean] {
  const [st, setSt] = useState<TrpgSettings>(DEFAULT_TRPG_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(TRPG_SET_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<TrpgSettings>;
        setSt({ statuses: { ...DEFAULT_TRPG_SETTINGS.statuses, ...(p.statuses ?? {}) } });
      }
    } catch { /* 預設值 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<TrpgSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(TRPG_SET_KEY, n); } catch { /* 忽略 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

export interface DotoriItem {
  /** 所屬區段（v2.0）— 建立多個區段時使用。沒有則使用預設區段 */
  secId?: string;
  id: string;
  name: string;              // 劇本名稱（必填）
  writer: string;            // 作者
  rule: string;              // 規則（系統）
  people: string;            // 人數顯示
  tags: string[];            // 標籤（複數）
  link?: string;             // 販售處／介紹頁面
  status: DotoriStatus;      // 可直接在卡片上切換
  imgId?: string;            // 16:9 圖片（IndexedDB）
  thumbCrop?: CropValue;
  ph: string;                // 沒有圖片時的 placeholder
  date: string;              // 登錄日期 ISO（用於排序）
}

export const DOTORI_SEED: DotoriItem[] = [];

/* ---------- TRPG 遊玩紀錄（4.16）— 表格形式 ---------- */
export interface PlayRecord {
  /** 所屬區段（v2.0）— 建立多個區段時使用。沒有則使用預設區段 */
  secId?: string;
  id: string;
  date?: string;             // Date（選填 — 留空時位於表格最下方）
  scenario: string;          // Scenario（必填）
  scenarioLink?: string;     // 劇本連結 — 在表格中點擊名稱時開啟新分頁
  writer: string;
  withText: string;          // With
  role: string;              // PL・GM・HO1 等簡短標示
  playtime: string;          // 4h 30m 等自由格式
  url?: string;              // Url（選填）— 顯示剪輯圖示，開啟新分頁
  logId?: string;            // 連結到我的首頁日誌備份（手機版：在 Playtime 下方加底線）
}

export const PLAYLOG_SEED: PlayRecord[] = [];

export const TRPG_SEED: TrpgLog[] = [];