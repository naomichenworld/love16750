'use client';
// 網站 Logo 設定（5.2 — 標題／副標題／副標題對齊）— 上方列品牌 + TRPG 票券底部文字同步
// v1.9：整合設計分頁 SAVE — 使用草稿（useSiteDraft）立即預覽，必須按下 SAVE 才會儲存。
// 使用者端（useSiteSettings）如果存在草稿，就會讀取草稿的值（與主題預覽相同規則）。
import { useCallback, useEffect, useReducer, useState } from 'react';
import { getRawSetting, setSetting } from './settingStore';

export interface SiteSettings {
  title: string;             // Logo 文字
  subtitle: string;          // Logo 下方文字（副標題）
  align: 'left' | 'center' | 'right'; // 副標題對齊方式（原型對齊圖示）
  docTitle?: string;         // 瀏覽器分頁標題（v1.9 使用者要求 — 留空時使用「Logo 文字 — 個人首頁」）
  noSpell?: boolean;         // 隱藏拼字檢查底線（v2.0 使用者要求 — 整個頁面）
  // 分享連結時由爬蟲讀取的描述文字（v2.0 使用者要求）— LINE・Discord 預覽中的描述文字。
  // 留空時使用副標題；副標題也留空時，直接使用預設文字（generateMetadata）
  crawlDesc?: string;
  // 瀏覽器分頁圖示（v2.0 使用者要求）— 留空時使用預設圖示。
  // 伺服器模式下是儲存庫網址，因此也會直接顯示在伺服器 Metadata 中；本機模式下是檔案 id，因此只會在畫面上使用
  favicon?: string;
}

export const DEFAULT_SITE_SETTINGS: SiteSettings = {
  // 初始標題 = 專案名稱 O.HOME（v1.9 使用者確定 — 初始化後會恢復成這個值）
  title: 'O.HOME', subtitle: 'PERSONAL ARCHIVE', align: 'left',
};

const KEY = 'ohome.site.v1';
const EVT = 'ohome-site';

// 模組單例 — 無論從哪個元件存取，都會看到相同的儲存資料／草稿
let savedCache: SiteSettings = DEFAULT_SITE_SETTINGS;
let cacheLoaded = false;
let draft: SiteSettings | null = null;

function loadSaved() {
  if (cacheLoaded) return;
  try {
    const raw = getRawSetting(KEY);
    if (raw) savedCache = { ...DEFAULT_SITE_SETTINGS, ...JSON.parse(raw) };
  } catch { /* 使用預設值 */ }
  cacheLoaded = true;
}

const notify = () => setTimeout(() => window.dispatchEvent(new Event(EVT)), 0);

export function useSiteSettings(): [SiteSettings, (patch: Partial<SiteSettings>) => void, boolean] {
  const [, force] = useReducer((x: number) => x + 1, 0);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    loadSaved();
    setLoaded(true);
    force();
    window.addEventListener(EVT, force);
    return () => window.removeEventListener(EVT, force);
  }, []);
  // 立即儲存 patch — 設計分頁之外的使用者端使用（如果存在草稿，也同步套用到草稿以維持預覽）
  const patch = useCallback((p: Partial<SiteSettings>) => {
    savedCache = { ...savedCache, ...p };
    if (draft) draft = { ...draft, ...p };
    try { setSetting(KEY, savedCache); } catch { /* 忽略 */ }
    notify();
  }, []);
  return [draft ?? savedCache, patch, loaded];
}

/** 設計分頁專用草稿（v1.9）— 修改只會進入預覽，透過 SAVE 確定 · 取消則捨棄 */
export function useSiteDraft() {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    loadSaved();
    force();
    window.addEventListener(EVT, force);
    return () => window.removeEventListener(EVT, force);
  }, []);
  return {
    site: draft ?? savedCache,
    dirty: draft !== null && JSON.stringify(draft) !== JSON.stringify(savedCache),
    set: (p: Partial<SiteSettings>) => { draft = { ...(draft ?? savedCache), ...p }; notify(); },
    save: () => {
      if (!draft) return;
      savedCache = draft;
      draft = null;
      try { setSetting(KEY, savedCache); } catch { /* 忽略 */ }
      notify();
    },
    discard: () => { draft = null; notify(); },
  };
}