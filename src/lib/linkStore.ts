'use client';
/**
 * 自訂連結選單（v2.0 使用者要求）。
 *
 * 「原本必須進入自設關係列表後選擇才能前往的頁面（`/rels/latte`），現在可以直接放到選單」—
 * 只要填寫名稱與網址，就可以成為選單中的項目。**這是在網站內部的移動**，
 * 因此不是開啟新視窗，而是和其他選單一樣只切換目前畫面。
 *
 * 和留言板・區段一樣屬於「加入選單的額外項目」，建立後會放在**選單管理的未配置**區域，
 * 再由使用者手動放入想要的上層選單（不自動配置 — 由使用者決定）。
 */
import { useCallback, useEffect, useReducer } from 'react';
import { getRawSetting, setSetting } from './settingStore';
import type { ExtraEntry } from './menuStore';

const KEY = 'ohome.links.v1';
const EVT = 'ohome-links';

export interface CustomLink {
  id: string;
  name: string;
  /** 網站內的路徑 — 儲存時會統一成以 `/` 開頭的形式 */
  href: string;
}

/**
 * 將輸入轉換成可以掛到選單上的網址（v2.0）。
 *
 * **只有自己首頁的網址**才會縮短成路徑（v2.0 使用者發現）— 以前會無條件將完整網址
 * 截成路徑，因此如果貼上**其他首頁**（例如使用相同 Vercel 部署方式的其他人的首頁）網址，
 * 網域就會被移除，最後變成前往自己首頁中不存在的頁面。其他來源的完整網址則保持原樣，
 * 點擊選單時會開啟新視窗（由 TopBar 處理）。
 */
export function toInternalPath(v: string): string {
  const s = v.trim();
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) {
      const u = new URL(s);
      if (typeof window !== 'undefined' && u.origin === window.location.origin) {
        return u.pathname + u.search + u.hash;
      }
      return u.href;   // 其他網站 — 不可以移除網域
    }
  } catch { /* 解析失敗 — 在下面當作路徑處理 */ }
  return s.startsWith('/') ? s : `/${s}`;
}

let cache: CustomLink[] = [];
let loaded = false;

function load() {
  if (loaded) return;
  try {
    const raw = getRawSetting(KEY);
    if (raw) cache = JSON.parse(raw) as CustomLink[];
  } catch { /* 使用預設值 */ }
  loaded = true;
}

function notify() { try { window.dispatchEvent(new Event(EVT)); } catch { /* 忽略 */ } }

export function useCustomLinks(): {
  links: CustomLink[];
  setLinks: (next: CustomLink[]) => void;
  loaded: boolean;
} {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const h = () => force();
    window.addEventListener(EVT, h);
    window.addEventListener('ohome-setting', h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener('ohome-setting', h); };
  }, []);
  load();

  const setLinks = useCallback((next: CustomLink[]) => {
    cache = next;
    try { setSetting(KEY, cache); } catch { /* 忽略 */ }
    notify();
  }, []);

  return { links: cache, setLinks, loaded };
}

/** 轉換成可以加入選單的形式 — 排除網址為空的項目（否則選單點擊後會出現沒有任何作用的項目）。
 *  anchor 原本只用於自動配置，現在雖然沒有實際意義，但仍保留此欄位以符合資料格式 */
export const linkEntries = (links: CustomLink[]): ExtraEntry[] =>
  links.filter(l => l.href.trim() && l.href !== '/')
    .map(l => ({ id: l.id, name: l.name.trim() || l.href, href: l.href, anchor: '/' }));