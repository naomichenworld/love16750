'use client';
// 貼紙備忘錄（4.6）— 便利貼板資料 + 撰寫權限／作者顯示設定
import { useCallback, useEffect, useState } from 'react';
import { getRawSetting, setSetting } from './settingStore';

export interface StickyMemo {
  id: string;
  text: string;
  author: string;            // 撰寫當時的暱稱
  authorId: string;
  color: string;             // 便利貼背景 hex
  x: number; y: number;      // 以看板為基準的 %（0~100）— 位置會被儲存，所有人看到的都相同
  rot: number;               // 傾斜角度 deg
  z: number;                 // 重疊順序
  size: 's' | 'm' | 'l';     // 大小
  date: string;              // ISO
}

export const MEMO_COLORS = ['#f4ecd7', '#dfe7dd', '#e7dfe4', '#dde4ea', '#efe3da'];
export const MEMO_SIZE_W: Record<StickyMemo['size'], number> = { s: 128, m: 158, l: 196 };

export interface MemoSettings {
  allowMember: boolean;      // 允許會員撰寫（關閉後僅管理員）
  showAuthor: boolean;       // 在便利貼上顯示作者
}
export const DEFAULT_MEMO_SETTINGS: MemoSettings = { allowMember: true, showAuthor: true };

const SET_KEY = 'ohome.memoset.v1';

export function useMemoSettings(): [MemoSettings, (patch: Partial<MemoSettings>) => void, boolean] {
  const [st, setSt] = useState<MemoSettings>(DEFAULT_MEMO_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(SET_KEY);
      if (raw) setSt({ ...DEFAULT_MEMO_SETTINGS, ...JSON.parse(raw) });
    } catch { /* 預設值 */ }
    setLoaded(true);
  }, []);
  const patch = useCallback((p: Partial<MemoSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(SET_KEY, n); } catch { /* 忽略 */ }
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/* ---------- 種子資料（原型展示沿用） ---------- */
export const MEMO_SEED: StickyMemo[] = [];
