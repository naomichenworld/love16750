'use client';
/**
 * 介紹頁面（v2.0 使用者要求）— **只有一篇文章的頁面**。
 *
 * 沒有列表也沒有留言，只有一篇正文，因此不放進文章資料表，而是放在**設定的一個欄位**中。
 * 這樣就不需要修改 DB 結構（使用 Fork 的人也不需要重新執行 SQL），
 * 並且會和其他設定一樣同步到伺服器。
 */
import { useCallback, useEffect, useState } from 'react';
import { getRawSetting, setSetting } from './settingStore';

const KEY = 'ohome.intro.v1';

export interface IntroDoc {
  /** 正文 HTML — 不論使用編輯器撰寫或直接使用 HTML 撰寫，儲存形式都相同 */
  html: string;
  /** 目前是以哪種方式撰寫（v2.0 使用者要求）— 下次開啟時會以相同模式開啟。
   * 避免用 HTML 編寫的文章被編輯器開啟後，標籤遭到刪除。 */
  mode?: 'editor' | 'html';
}

const EMPTY: IntroDoc = { html: '', mode: 'editor' };

export function useIntro(): [IntroDoc, (next: IntroDoc) => void, boolean] {
  const [doc, setDoc] = useState<IntroDoc>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(KEY);
      if (raw) setDoc({ ...EMPTY, ...JSON.parse(raw) });
    } catch { /* 使用預設值 */ }
    setLoaded(true);
  }, []);
  const save = useCallback((next: IntroDoc) => {
    setDoc(next);
    try { setSetting(KEY, next); } catch { /* 忽略 */ }
  }, []);
  return [doc, save, loaded];
}