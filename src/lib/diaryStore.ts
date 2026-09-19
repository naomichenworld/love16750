// 日記（4.14）— 心情日記 + 心情列表（環境設定管理）
import type { Visibility } from './charStore';

/* ---------- 心情（5.2 — 在環境設定中管理名稱・圖示・顏色） ---------- */
export interface Mood {
  id: string;
  name: string;
  icon: string;      // Emoji／特殊字元 1～2 個
  color: string;     // 圖示顏色（背景會自動套用色調）
}

/** 心情一開始是空的（v2.0）— 範例 4 種是原型遺留內容，因此需要在環境設定中自行建立 */
export const MOOD_SEED: Mood[] = [];

/* ---------- 日記 ---------- */
export interface DiaryPost {
  /** 所屬區段（v2.0）— 建立多個區段時使用。沒有的話使用預設區段 */
  secId?: string;
  id: string;
  title: string;
  date: string;              // YYYY-MM-DD
  moodId: string;
  body: string;              // MD
  imgIds: string[];          // 附加圖片（IndexedDB）
  visibility: Visibility;
}

export const DIARY_SEED: DiaryPost[] = [];

/** hex(#rrggbb) → 淡色調背景（用於圖示圓形背景） */
export const moodTint = (hex: string) => /^#[0-9a-fA-F]{6}$/.test(hex) ? `${hex}26` : 'rgba(127,127,127,.15)';