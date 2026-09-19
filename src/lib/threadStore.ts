'use client';
// 感想串（4.17）— 以作品為單位的串文資料 + 分類・預設查看設定（localStorage → 預計移至 Supabase）
import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import type { CropValue } from '@/components/ui/CropEditor';
import type { Visibility } from './charStore';
import { getRawSetting, setSetting } from './settingStore';
import { MAIN_SEC } from './sectionStore';

/* ---------- 串文資料 ---------- */
export interface ThreadPost {
  id: string;
  text: string;
  images: string[];          // IndexedDB 檔案 id — 最多 4 張（1 張=寬幅、2～4 張=網格）
  phList?: string[];         // 展示用 Placeholder（僅供種子資料使用）
  date: string;              // ISO 撰寫時間
  /** 摺疊（v2.0 使用者要求 — 劇透第一層防護）。與留言板文章摺疊（6.2）相同樣式：
   *  spoiler/adult 使用固定文字，custom 則直接顯示 label。沒有設定時直接顯示。 */
  fold?: { type: 'spoiler' | 'adult' | 'custom'; label?: string } | null;
}

export interface ThreadWork {
  /** 所屬區段（v2.0）— 建立多個區段時使用。沒有則為預設區段 */
  secId?: string;
  id: string;
  title: string;             // 作品名稱（必填）
  titleFontId?: string;      // 個別指定作品名稱字體（5.1 字體庫）
  author: string;            // 作者／導演名稱
  authorRole?: string;       // 顯示文字（導演・作者等，可選）
  catId: string;             // 分類（由環境設定管理的列表）
  posterId?: string;         // 代表圖片（3:4 海報形式，IndexedDB）
  posterCrop?: CropValue;
  ph: string;                // 沒有圖片時使用的 Placeholder
  visibility: Visibility;
  created: string;           // 串文開始的 ISO 時間
  posts: ThreadPost[];
}

/* ---------- 分類 + 預設查看設定（4.17 — 由環境設定管理） ---------- */
/* 分類可以依區段（建立多個串文區段）分別設定（v2.0 使用者要求） */
export interface ThreadCat {
  id: string; label: string;
  // 徽章顏色（v1.9 — 在環境設定中指定，未指定時使用預設墨水色徽章）
  bg?: string; border?: string; fg?: string;
}
export interface ThreadSettings {
  /** 預設區段的分類 — 以前儲存的資料會原樣保留在這裡 */
  cats: ThreadCat[];
  /** 各區段的分類（v2.0 使用者要求）— 多個串文區段的用途不同，因此分類也不同。
   *  **如果從未設定過，就直接使用預設區段的分類** — 剛建立區段時如果分類是空的，
   *  就會連文章都無法撰寫。只有進行修改後，該區段才會建立自己的分類列表。 */
  secCats?: Record<string, ThreadCat[]>;
  defaultView: 'thread' | 'list'; // 進入選單時首先顯示的查看方式（v1.8 確定）
}

/** 該區段使用的分類（v2.0）— 沒有另外設定時使用預設區段的分類 */
export const threadCats = (s: ThreadSettings, secId: string): ThreadCat[] =>
  (secId === MAIN_SEC ? s.cats : s.secCats?.[secId] ?? s.cats);

/** 該區段分類的 patch（v2.0）— 預設區段則直接儲存回原本的位置 */
export const threadCatsPatch = (
  s: ThreadSettings, secId: string, cats: ThreadCat[],
): Partial<ThreadSettings> =>
  (secId === MAIN_SEC ? { cats } : { secCats: { ...s.secCats, [secId]: cats } });

export const DEFAULT_THREAD_SETTINGS: ThreadSettings = {
  cats: [
    { id: 'book', label: '書籍' },
    { id: 'movie', label: '電影' },
    { id: 'drama', label: '電視劇' },
    { id: 'ani', label: '動畫' },
    { id: 'manga', label: '漫畫' },
    { id: 'webtoon', label: '網路漫畫' },
    { id: 'webnovel', label: '網路小說' },
  ],
  defaultView: 'thread',
};

const SET_KEY = 'ohome.threadset.v1';

export function useThreadSettings(): [ThreadSettings, (patch: Partial<ThreadSettings>) => void, boolean] {
  const [st, setSt] = useState<ThreadSettings>(DEFAULT_THREAD_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(SET_KEY);
      if (raw) setSt({ ...DEFAULT_THREAD_SETTINGS, ...JSON.parse(raw) });
    } catch { /* 使用預設值 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<ThreadSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(SET_KEY, n); } catch { /* 忽略 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/** 分類標籤 — 已刪除的分類使用中性標示 */
export const catLabel = (cats: ThreadCat[], id: string) => cats.find(c => c.id === id)?.label ?? '其他';

/** 分類徽章顏色樣式 — 未指定項目使用預設墨水色徽章（背景／邊框／文字） */
export function threadBadgeStyle(cat?: ThreadCat): CSSProperties {
  return {
    background: cat?.bg ?? '#1d2025',
    border: `1px solid ${cat?.border ?? cat?.bg ?? '#1d2025'}`,
    color: cat?.fg ?? '#ffffff',
  };
}

/** 最近文章日期（沒有文章時使用串文開始日期）— 用於列表排序・顯示 */
export const lastDate = (w: ThreadWork) =>
  w.posts.length ? w.posts[w.posts.length - 1].date : w.created;

export const fmtMD = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};
export const fmtMDHM = (iso: string) => {
  const d = new Date(iso);
  return `${fmtMD(iso)} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/* ---------- 種子資料（沿用原型展示） ---------- */
export const THREAD_SEED: ThreadWork[] = [];