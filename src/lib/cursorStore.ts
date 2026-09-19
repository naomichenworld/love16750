'use client';
// 滑鼠游標管理（5.1 v1.1）— 依狀態設定游標圖片（建議 PNG 32px）＋熱點＋全部開啟/關閉。
// 未註冊的狀態會回退使用預設游標。
import { useCallback, useEffect, useState } from 'react';
import { getRawSetting, setSetting } from './settingStore';

// 移動・大小調整游標分開設定（v1.9 使用者要求）— 不將移動/拖曳全部視為同一種
// 而是像 Windows 游標組一樣，移動＋4 個方向的大小調整分別註冊
export type CursorState = 'default' | 'pointer' | 'text' | 'active' | 'grab'
  | 'rsNwse' | 'rsNesw' | 'rsEw' | 'rsNs';

export interface CursorEntry { imgId: string; hx: number; hy: number } // 熱點（px）

export interface CursorSettings {
  enabled: boolean;
  states: Partial<Record<CursorState, CursorEntry>>;
}

export const CURSOR_STATE_LABEL: Record<CursorState, { label: string; desc: string }> = {
  default: { label: '基本', desc: '平常狀態' },
  pointer: { label: '指標（懸停）', desc: '連結・按鈕上方' },
  text: { label: '文字', desc: '輸入框・文字上方（取代 I-beam）' },
  active: { label: '點擊中', desc: '按下期間（可選）' },
  grab: { label: '移動', desc: '拖曳移動小工具・貼紙時（可選）' },
  rsNwse: { label: '大小調整 ↘', desc: '對角線大小調整 1 — 小工具右下角控制點（可選）' },
  rsNesw: { label: '大小調整 ↙', desc: '對角線大小調整 2（可選）' },
  rsEw: { label: '大小調整 ↔', desc: '水平大小調整（可選）' },
  rsNs: { label: '大小調整 ↕', desc: '垂直大小調整（可選）' },
};

export const DEFAULT_CURSOR_SETTINGS: CursorSettings = { enabled: true, states: {} };

const KEY = 'ohome.cursor.v1';
const EVT = 'ohome-cursor';

export function useCursorSettings(): [CursorSettings, (patch: Partial<CursorSettings>) => void, boolean] {
  const [st, setSt] = useState<CursorSettings>(DEFAULT_CURSOR_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const load = () => {
      try {
        const raw = getRawSetting(KEY);
        if (raw) setSt({ ...DEFAULT_CURSOR_SETTINGS, ...JSON.parse(raw) });
      } catch { /* 使用預設值 */ }
    };
    load();
    setLoaded(true);
    window.addEventListener(EVT, load);
    return () => window.removeEventListener(EVT, load);
  }, []);
  const patch = useCallback((p: Partial<CursorSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(KEY, n); } catch { /* 忽略 */ }
      setTimeout(() => window.dispatchEvent(new Event(EVT)), 0);
      return n;
    });
  }, []);
  return [st, patch, loaded];
}