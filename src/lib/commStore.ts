'use client';
// 委託（4.18）— 委託列表 · 狀態徽章 · 名額 · 申請者列表 · 委託設定
// 儲存：localStorage（→ 預計移轉至 Supabase）
import { useCallback, useEffect, useState } from 'react';
import type { CropValue } from '@/components/ui/CropEditor';
import type { Visibility } from './charStore';

/* ---------- 狀態徽章 ---------- */
export interface CommBadge { id: string; label: string; bg: string; border: string; fg: string }

/** 預設委託徽章 3 種（4.18 — 招募中鋼藍 / 截止炭灰 / 準備中柔和金）· 固定提供 */
export const DEFAULT_COMM_BADGES: CommBadge[] = [
  { id: 'open', label: '모집중', bg: '#4c6a8e', border: '#3d5674', fg: '#ffffff' },
  { id: 'closed', label: '마감', bg: '#3c434d', border: '#30363f', fg: '#c6cad1' },
  { id: 'ready', label: '준비중', bg: '#b39b6b', border: '#9a8459', fg: '#ffffff' },
];

/** 預設申請者列表徽章 3 種（與委託徽章使用不同的顏色變數） */
export const DEFAULT_APPLY_BADGES: CommBadge[] = [
  { id: 'wait', label: '대기', bg: '#8a8f98', border: '#767b84', fg: '#ffffff' },
  { id: 'working', label: '작업중', bg: '#4c6a8e', border: '#3d5674', fg: '#ffffff' },
  { id: 'done', label: '완료', bg: '#3c434d', border: '#30363f', fg: '#c6cad1' },
];

/* ---------- 委託 ---------- */
/* 委託表單（v1.9）— 申請時要填寫的項目：文字 / 單選 / 複選 / 圖片附件 */
export type CommFormFieldType = 'text' | 'single' | 'multi' | 'image';
export interface CommFormField {
  id: string;
  type: CommFormFieldType;
  label: string;         // 問題
  desc?: string;         // 問題補充說明（可選）
  required?: boolean;    // 必填回答
  options?: string[];    // 單選/複選選項
  multiple?: boolean;    // 圖片附件 — 允許多張（預設一張）
}

export type SlotMode = 'shared' | 'included' | 'own'; // 統合 / 個別（包含統合） / 個別（獨立）
export type SlotShape = 'circle' | 'square' | 'diamond';
export const SLOT_CHARS: Record<SlotShape, { filled: string; empty: string }> = {
  circle: { filled: '●', empty: '○' },
  square: { filled: '■', empty: '□' },
  diamond: { filled: '◆', empty: '◇' },
};

export interface CommItem {
  /** 所屬區塊（v2.0）— 建立多個時使用。沒有則使用預設區塊 */
  secId?: string;
  id: string;
  name: string;
  sub: string;                 // 副標題
  badgeId: string;             // 狀態徽章
  priceMin: number; priceMax: number;
  deadlineNote: string;        // 截止日期基準文字
  slotMode: SlotMode;
  slotTotal: number; slotUsed: number;   // 個別名額（shared 模式未使用）
  slotShape: SlotShape;
  slotColor: string;           // 填滿顏色
  contactUrl?: string;         // 聯絡連結（信封圖示）
  images: string[];            // blob id 列表（第一張 = 代表圖/縮圖）
  thumbCrop?: CropValue;
  /** 詳細縮圖列中各圖片要顯示哪個部分（v2.0 使用者要求 — 右鍵「縮圖位置」）。
   *  列中的區域是 4:3，但直向長圖常常會因為裁切中央而看不到臉。
   *  **以圖片參照作為 key** — 即使改變順序，各自設定好的位置也會跟著圖片保留 */
  stripCrops?: Record<string, CropValue>;
  ph: string;
  descHtml: string;            // HTML+MD 雙用編輯器結果（隔離 sanitize 後渲染）
  titleFontId: string; bodyFontId: string;   // 每個委託的字體（4.18 v1.9）
  themeMode: 'site' | 'custom'; themeColor?: string; // 頁面主題色
  themeTone?: 'dark' | 'light';                      // 主題色的深色／淺色風格
  form?: CommFormField[];      // 委託表單（v1.9）— 申請時要填寫的項目
  formEnabled?: boolean;       // 啟用/停用表單 — 啟用時才在詳細頁顯示填寫表單
  date: string;
}

export const COMM_SEED: CommItem[] = [];

/* ---------- 申請者列表 ---------- */
export interface Applicant {
  id: string;
  deadline?: string;           // YYYY-MM-DD — 最前方以較大字體顯示
  badgeId: string;             // 等待/進行中/完成
  name: string;                // 申請者完整名稱（僅管理員顯示完整名稱）
  nameOpen?: number;           // 不遮罩公開的前幾個字（預設 1）— 無權限者其餘以 * 顯示
  source?: string;             // 來源 — 收到委託的平台（OpenChat · Crepe 等，可選）
  appliedDate?: string;        // 申請日期
  commId?: string;             // 申請的委託種類
  content: string;             // 內容
  contentVis?: 'private' | 'self' | 'public'; // 內容公開範圍 — 僅管理員/允許本人查看/全部公開（v1.9）
  selfId?: string;             // 允許本人查看時指定的會員 id（未指定的舊版資料則允許登入會員查看）
  allowSelf?: boolean;         // （舊）允許本人查看 — 用於 contentVis 遷移
  submitFileId?: string;       // 申請者提交的申請表 HTML 檔案（可選，v1.9 — blob 儲存・隔離渲染）
  trashedAt?: string;          // 移入垃圾桶的時間（ISO）— 從列表隱藏，超過保存期限後會消失（v2.0）
}

/** 是否已進入垃圾桶（v2.0） */
export const inTrash = (a: Applicant) => !!a.trashedAt;

/** 已超過保存期限的申請 — 自動刪除的對象（v2.0） */
export function trashExpired(apps: Applicant[], days: number, now = Date.now()): Applicant[] {
  const keep = Math.max(1, days) * 86400000;
  return apps.filter(a => {
    if (!a.trashedAt) return false;
    const t = Date.parse(a.trashedAt);
    return Number.isFinite(t) && now - t > keep;
  });
}

/** 垃圾桶剩餘天數 — 0 表示今天消失（v2.0） */
export function trashLeft(a: Applicant, days: number, now = Date.now()): number {
  const t = Date.parse(a.trashedAt ?? '');
  if (!Number.isFinite(t)) return days;
  return Math.max(0, Math.ceil((t + Math.max(1, days) * 86400000 - now) / 86400000));
}

/** 內容公開範圍 — 自動解析舊版 allowSelf 儲存資料 */
export const applyVis = (a: Applicant): 'private' | 'self' | 'public' =>
  a.contentVis ?? (a.allowSelf ? 'self' : 'private');

export const APPLY_VIS_LABEL: Record<'private' | 'self' | 'public', string> = {
  private: '內容不公開 — 僅管理員', self: '內容不公開 — 允許本人查看', public: '內容全部公開',
};

/** Rich Editor HTML → 工具提示用純文字（移除標籤 + 摘要） */
export function plainPreview(html: string, max = 80): string {
  const t = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

/** 申請者名稱遮罩 — 公開前 open 個字 + 其餘以 * 顯示（供無權限者查看） */
export function maskName(name: string, open = 1): string {
  const t = name.trim();
  const n = Math.max(0, open);
  if (t.length <= n) return t;
  return t.slice(0, n) + '*'.repeat(t.length - n);
}

export const APPLY_SEED: Applicant[] = [];

/* ---------- 委託設定（設定 > 委託分頁） ---------- */
export interface CommSettings {
  ratio: '3:4' | '4:3';        // 圖庫縮圖比例（以圖庫為單位統一）
  badgeShape: 'round' | 'pill';
  totalSlot: number;           // 全部（統合）名額數
  totalUsed: number;           // 統合名額已使用數（手動更新 — 4.18）
  commBadges: CommBadge[];
  applyBadges: CommBadge[];
  applyVisibility: Visibility; // 申請者列表公開範圍
  trashDays: number;           // 申請垃圾桶保存期限（天）— 超過後自動消失（v2.0）
  slotDisplay?: 'used' | 'remain'; // 名額顯示為「已填滿數」還是「剩餘數」（v2.0 — 依營運方式不同）
}

export const DEFAULT_COMM_SETTINGS: CommSettings = {
  ratio: '3:4', badgeShape: 'pill', totalSlot: 5, totalUsed: 2,
  commBadges: DEFAULT_COMM_BADGES, applyBadges: DEFAULT_APPLY_BADGES,
  applyVisibility: 'public', trashDays: 30, slotDisplay: 'used',
};

const SET_KEY = 'ohome.commset.v1';

export function useCommSettings(): [CommSettings, (patch: Partial<CommSettings>) => void, boolean] {
  const [st, setSt] = useState<CommSettings>(DEFAULT_COMM_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(SET_KEY);
      if (raw) setSt({ ...DEFAULT_COMM_SETTINGS, ...JSON.parse(raw) });
    } catch { /* 使用預設值 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<CommSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(SET_KEY, n); } catch { /* 忽略 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/* ---------- 輔助函式 ---------- */
export const fmtPrice = (n: number) => n.toLocaleString('ko-KR');

/** 顯示剩餘名額（4.18 包含型規則：min（個別剩餘、統合剩餘））→ {remain, total} */
export function slotView(c: CommItem, s: CommSettings): { remain: number; total: number; used: number } {
  // 顯示為「已填滿/總數」（v1.9 使用者確認）— remain 用於判斷是否可申請・工具提示
  const sharedRemain = Math.max(0, s.totalSlot - s.totalUsed);
  if (c.slotMode === 'shared') return { remain: sharedRemain, total: s.totalSlot, used: s.totalUsed };
  const ownRemain = Math.max(0, c.slotTotal - c.slotUsed);
  if (c.slotMode === 'included') return { remain: Math.min(ownRemain, sharedRemain), total: c.slotTotal, used: c.slotUsed };
  return { remain: ownRemain, total: c.slotTotal, used: c.slotUsed };
}

/** 名額顯示數字（v2.0）— 以已填滿為基準時為 3/5，以剩餘為基準時為 2/5 */
export function slotCount(sv: { remain: number; total: number; used: number }, s: CommSettings): number {
  return (s.slotDisplay ?? 'used') === 'remain' ? sv.remain : sv.used;
}

/** 名額工具提示文字 — 告知顯示基準的另一側數字（v2.0） */
export function slotTip(sv: { remain: number; total: number; used: number }, s: CommSettings): string {
  return (s.slotDisplay ?? 'used') === 'remain'
    ? `已填滿的名額為 ${sv.used} 個`
    : `目前剩餘名額為 ${sv.remain} 個`;
}

/** 徽章樣式（形狀由設定決定，文字永遠正中央 — 4.18） */
export function badgeStyle(b: CommBadge | undefined, shape: 'round' | 'pill'): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    // 韓文字體垂直微調（v1.9 實測 + 使用者微調）— line-height 11px，下方 padding +1
    padding: '4px 12px', borderRadius: shape === 'pill' ? 999 : 7,
    background: b?.bg ?? '#3c434d', border: `1px solid ${b?.border ?? '#30363f'}`, color: b?.fg ?? '#fff',
    fontSize: 'calc(10.5px*var(--fs,1))', fontWeight: 700, letterSpacing: '.06em', lineHeight: 'calc(11px*var(--fs,1))',
    fontFamily: 'var(--sans)', textAlign: 'center', whiteSpace: 'nowrap',
    boxShadow: '0 2px 8px rgba(0,0,0,.18)',
  };
}
import type React from 'react';
import { getRawSetting, setSetting } from './settingStore';