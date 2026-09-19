'use client';
// 拼字檢查底線（v2.0 使用者要求）— 在環境設定 > 設計中選擇「隱藏」時
// 關閉整個頁面的紅色波浪底線。spellcheck 是會繼承的屬性，因此只要在 body 設定一次，
// 下面的 input・textarea・編輯器都會跟著套用。
import { useEffect } from 'react';
import { useSiteSettings } from '@/lib/siteStore';

export function SpellCheck() {
  const [site] = useSiteSettings();
  const off = !!site.noSpell;
  useEffect(() => {
    document.body.setAttribute('spellcheck', off ? 'false' : 'true');
  }, [off]);
  return null;
}