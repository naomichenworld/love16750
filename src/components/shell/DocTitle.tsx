'use client';
// 瀏覽器分頁標題（v1.9 使用者要求）— 在設計分頁中指定，留空則使用「Logo 文字 — 個人首頁」
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSiteSettings } from '@/lib/siteStore';

export function DocTitle() {
  const [site, , loaded] = useSiteSettings();
  const pathname = usePathname();
  useEffect(() => {
    if (!loaded) return;
    const want = site.docTitle?.trim() || `${site.title} — 개인홈`;
    const apply = () => { if (document.title !== want) document.title = want; };
    apply();
    // 切換頁面後，Next 會將 layout.tsx 的 metadata 標題重新放回 <title>
    // （重新整理後一開始是正確的，但只要切換頁面就會變回預設值，原因就在這裡）。
    // 持續監看 head，如果標題發生變化，就再次調整為我們設定的值 —
    // 如果已經是我們設定的值，就什麼都不做，因此不會反覆執行。
    const ob = new MutationObserver(apply);
    ob.observe(document.head, { childList: true, subtree: true, characterData: true });
    return () => ob.disconnect();
  }, [loaded, site.docTitle, site.title, pathname]);
  return null;
}