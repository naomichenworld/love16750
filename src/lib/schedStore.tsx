'use client';
// 行事曆（4.12）— 月曆行程 + 分類（管理員編輯）+ 登錄權限選項
// 待辦事項／D-day 直接共用主頁 Widget 資料（mainStore）
import { useCallback, useEffect, useMemo, useState } from 'react';
import { newId } from './postStore';
import type { Visibility } from './charStore';
import { getRawSetting, setSetting } from './settingStore';
import { MAIN_SEC, inSection, secStamp } from './sectionStore';

export interface SchedCategory { id: string; label: string; color: string }

export const DEFAULT_SCHED_CATS: SchedCategory[] = [
  { id: 'sc-trpg', label: 'TRPG 場次', color: '#b39b6b' },
  { id: 'sc-due', label: '截止日期', color: '#a63a45' },
  { id: 'sc-anniv', label: '紀念日', color: '#4c6a8e' },
];

export interface SchedEvent {
  id: string;
  title: string;
  start: string;             // YYYY-MM-DD
  end?: string;              // 期間行程（可選）
  catId: string;
  color?: string;            // 個別顏色（沒有則使用分類顏色）
  memo?: string;
  visibility: Visibility;
  repeat: 'none' | 'yearly'; // 每年重複
  secId?: string;            // 屬於哪個行事曆（v2.0）— 沒有則使用預設行事曆
}

// 部署預設 — 沒有虛擬行程（v1.9）
const SEED_EVENTS: SchedEvent[] = [];

interface SchedState {
  events: SchedEvent[];
  /** 預設行事曆的分類 — 舊有儲存資料仍然放在這裡 */
  cats: SchedCategory[];
  /** 各行事曆的分類（v2.0 使用者要求）— 如果沒有另外設定，就直接使用預設分類。
   *  新建立後如果分類是空的，就無法先新增行程。 */
  secCats?: Record<string, SchedCategory[]>;
  allowMember: boolean;      // 允許會員登錄行程（4.12 登錄權限選項）— 行事曆共用
}

/** 該行事曆的分類（v2.0）— 沒有另外設定時使用預設行事曆的分類 */
const catsOf = (s: SchedState, sec: string): SchedCategory[] =>
  (sec === MAIN_SEC ? s.cats : s.secCats?.[sec] ?? s.cats);

/** 儲存該行事曆分類的 patch — 預設行事曆則直接儲存在原本的位置 */
const catsPatch = (s: SchedState, sec: string, cats: SchedCategory[]): Partial<SchedState> =>
  (sec === MAIN_SEC ? { cats } : { secCats: { ...s.secCats, [sec]: cats } });

/** 合併所有行事曆的分類（去除重複 ID）— 不區分區段的地方（主頁 Widget）會使用。
 *  因為行程顏色會從分類取得，如果不合併，其他行事曆的行程就會顯示為預設顏色 */
const allCats = (s: SchedState): SchedCategory[] => {
  const seen = new Map<string, SchedCategory>();
  [...s.cats, ...Object.values(s.secCats ?? {}).flat()].forEach(c => { if (!seen.has(c.id)) seen.set(c.id, c); });
  return [...seen.values()];
};

const DEFAULTS: SchedState = { events: SEED_EVENTS, cats: DEFAULT_SCHED_CATS, allowMember: false };
const KEY = 'ohome.sched.v1';

/**
 * 行事曆（v2.0 — 多個行事曆，使用者要求）。
 * 傳入 secId 時，只顯示**該行事曆的內容**，並儲存到該行事曆。
 * 不傳入時則回傳**全部內容** — 主頁 Widget 就是這樣使用的（不論哪個行事曆，近期行程都會顯示）。
 */
export function useSched(secId?: string) {
  const [raw, setSt] = useState<SchedState>(DEFAULTS);
  const sec = secId ?? MAIN_SEC;
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const stored = getRawSetting(KEY);
      if (stored) setSt({ ...DEFAULTS, ...JSON.parse(stored) });
    } catch { /* 使用預設值 */ }
    setLoaded(true);
  }, []);
  const apply = useCallback((fn: (s: SchedState) => SchedState) => {
    setSt(s => {
      const n = fn(s);
      try { setSetting(KEY, n); } catch { /* 忽略 */ }
      return n;
    });
  }, []);
  const addEvent = useCallback((ev: Omit<SchedEvent, 'id'>) =>
    apply(s => ({ ...s, events: [...s.events, { id: newId(), ...ev, ...secStamp(sec) }] })), [apply, sec]);
  const updateEvent = useCallback((id: string, p: Partial<SchedEvent>) =>
    apply(s => ({ ...s, events: s.events.map(e => (e.id === id ? { ...e, ...p } : e)) })), [apply]);
  const removeEvent = useCallback((id: string) =>
    apply(s => ({ ...s, events: s.events.filter(e => e.id !== id) })), [apply]);
  // 分類只會修改目前正在查看的行事曆（v2.0）
  const mutCats = useCallback((fn: (cats: SchedCategory[]) => SchedCategory[]) =>
    apply(s => ({ ...s, ...catsPatch(s, sec, fn(catsOf(s, sec))) })), [apply, sec]);
  const patchCat = useCallback((id: string, p: Partial<SchedCategory>) =>
    mutCats(cs => cs.map(c => (c.id === id ? { ...c, ...p } : c))), [mutCats]);
  const addCat = useCallback(() =>
    mutCats(cs => [...cs, { id: newId(), label: '新分類', color: '#8a8f98' }]), [mutCats]);
  const removeCat = useCallback((id: string) => mutCats(cs => cs.filter(c => c.id !== id)), [mutCats]);
  const setCats = useCallback((cats: SchedCategory[]) => mutCats(() => cats), [mutCats]);
  /** 在特定日期內調整順序（v2.0）— 月曆格子只顯示上方 3 個，因此順序就是優先順序。
   *  將當天涵蓋的行程所佔據的位置，直接插入新的順序。 */
  const reorderOn = useCallback((ids: string[]) => apply(s => {
    const pos = s.events.map((e, i) => (ids.includes(e.id) ? i : -1)).filter(i => i >= 0);
    const byId = new Map(s.events.map(e => [e.id, e]));
    const next = [...s.events];
    ids.forEach((id, k) => { const e = byId.get(id); if (e && pos[k] !== undefined) next[pos[k]] = e; });
    return { ...s, events: next };
  }), [apply]);
  const setAllowMember = useCallback((v: boolean) => apply(s => ({ ...s, allowMember: v })), [apply]);
  /* 畫面目前要查看的狀態 — 指定區段時只顯示該行事曆，否則顯示全部。
     儲存時上述函式都是針對**原始資料**操作，因此不會刪掉其他行事曆的資料 */
  const st: SchedState = useMemo(() => (secId === undefined
    ? { ...raw, cats: allCats(raw) }
    : { ...raw, events: raw.events.filter(e => inSection(e.secId, sec)), cats: catsOf(raw, sec) }
  ), [raw, secId, sec]);
  return {
    st, loaded, addEvent, updateEvent, removeEvent,
    patchCat, addCat, removeCat, setCats, setAllowMember, reorderOn,
  };
}

/** 行程顯示顏色 — 個別顏色優先，沒有則使用分類顏色 */
export const eventColor = (e: SchedEvent, cats: SchedCategory[]) =>
  e.color ?? cats.find(c => c.id === e.catId)?.color ?? '#8a8f98';

/** 是否為該日期（YYYY-MM-DD）涵蓋的行程 — 支援期間行程・每年重複 */
export function eventOnDate(e: SchedEvent, date: string): boolean {
  const end = e.end && e.end >= e.start ? e.end : e.start;
  if (e.repeat === 'yearly') {
    // 只比較月-日（期間重複為開始月-日～結束月-日）
    const md = date.slice(5);
    return e.start.slice(5) <= md && md <= end.slice(5);
  }
  return e.start <= date && date <= end;
}
