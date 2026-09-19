'use client';
// BGM 儲存庫（4.1）——播放清單・設定 localStorage（→ 預計移轉至 Supabase）
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { newId } from './postStore';
import { getRawSetting, setSetting } from './settingStore';

export interface BgmTrack {
  id: string;
  title: string;
  desc: string;
  videoId: string;   // YouTube 影片 ID
}

export interface BgmSettings {
  volume: number;              // 0~100 預設音量
  position: 'br' | 'bl';       // 播放器位置（預設：右下角，v1.4）
  shuffle: boolean;
  repeat: boolean;
  enabled: boolean;            // 是否顯示播放器
  autoplay: boolean;           // 進入後第一次互動時自動播放（4.1——因政策限制，無法完全自動播放）
}

interface BgmState { tracks: BgmTrack[]; settings: BgmSettings }

const DEFAULT_STATE: BgmState = {
  // 移除示範曲目（v1.9 使用者發現——發布版本的虛擬資料清理時漏掉了）
  tracks: [],
  settings: { volume: 60, position: 'br', shuffle: false, repeat: true, enabled: true, autoplay: true },
};

const STORAGE_KEY = 'ohome.bgm.v1';

interface BgmCtx {
  state: BgmState;
  setTracks: (t: BgmTrack[]) => void;
  addTrack: (title: string, desc: string, urlOrId: string) => boolean;
  removeTrack: (id: string) => void;
  setSettings: (patch: Partial<BgmSettings>) => void;
}

const Ctx = createContext<BgmCtx | null>(null);

/** 從 YouTube URL／ID → 提取 videoId */
export function parseVideoId(input: string): string | null {
  const s = input.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|v=|\/shorts\/|\/embed\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function BgmStoreProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BgmState>(DEFAULT_STATE);

  useEffect(() => {
    try {
      const raw = getRawSetting(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as BgmState;
        setState({ tracks: parsed.tracks ?? DEFAULT_STATE.tracks, settings: { ...DEFAULT_STATE.settings, ...parsed.settings } });
      }
    } catch { /* 使用預設值 */ }
  }, []);

  const persist = (s: BgmState) => {
    try { setSetting(STORAGE_KEY, s); } catch { /* 忽略 */ }
  };

  const setTracks = useCallback((tracks: BgmTrack[]) => {
    setState(s => { const n = { ...s, tracks }; persist(n); return n; });
  }, []);

  const addTrack = useCallback((title: string, desc: string, urlOrId: string): boolean => {
    const vid = parseVideoId(urlOrId);
    if (!vid || !title.trim()) return false;
    setState(s => {
      const n = { ...s, tracks: [...s.tracks, { id: newId(), title: title.trim(), desc: desc.trim(), videoId: vid }] };
      persist(n); return n;
    });
    return true;
  }, []);

  const removeTrack = useCallback((id: string) => {
    setState(s => { const n = { ...s, tracks: s.tracks.filter(t => t.id !== id) }; persist(n); return n; });
  }, []);

  const setSettings = useCallback((patch: Partial<BgmSettings>) => {
    setState(s => { const n = { ...s, settings: { ...s.settings, ...patch } }; persist(n); return n; });
  }, []);

  return <Ctx.Provider value={{ state, setTracks, addTrack, removeTrack, setSettings }}>{children}</Ctx.Provider>;
}

export function useBgm(): BgmCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useBgm must be used within BgmStoreProvider');
  return ctx;
}