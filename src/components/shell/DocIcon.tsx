'use client';
// 瀏覽器分頁圖示（v2.0 使用者要求）— 在設計分頁中指定，留空則使用預設圖示。
//
// 也可以透過伺服器 metadata（generateMetadata）加入，但那只有在儲存位置是網址時才可以。
// 本機模式下參照的是檔案 id，因此伺服器無法知道檔案位置，所以改由畫面上套用。
// 而且 Next 會自動掛載 src/app/favicon.ico，因此如果直接再加入 <link>，
// 預設圖示仍會存在，最後哪一個生效會因瀏覽器而不同 — 所以先處理既有的，再只留下我們的。
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useSiteSettings } from '@/lib/siteStore';
import { useBlobUrl } from '@/lib/blobStore';

const MARK = 'ohome-favicon';
const ORIG = 'data-ohome-icon-orig';   // 覆寫其他連結之前的原始網址

export function DocIcon() {
  const [site, , loaded] = useSiteSettings();
  const url = useBlobUrl(site.favicon);
  const pathname = usePathname();

  useEffect(() => {
    if (!loaded) return;

    const apply = () => {
      const mine = document.querySelector<HTMLLinkElement>(`link[data-${MARK}]`);
      // 不是我們建立的圖示連結 = Next（React）產生的
      const theirs = [...document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]')]
        .filter(l => !l.hasAttribute(`data-${MARK}`));

      if (!url) {
        // 如果取消指定，就只移除我們建立的圖示（安全），其他的恢復成原本的狀態
        mine?.remove();
        theirs.forEach(l => {
          const o = l.getAttribute(ORIG);
          if (o !== null) { l.href = o; l.removeAttribute(ORIG); }
        });
        return;
      }

      /* **絕對不刪除 React 建立的節點**（v2.0 使用者發現）。
         以前會使用 remove() 刪除預設圖示連結，但這樣一來之後 React 在清理該節點時，
         parentNode 已經不存在，就會觸發 removeChild 錯誤。這個例外發生在渲染 commit 過程中，
         因此會導致**整個畫面更新失敗** — 「點選選單後網址變了，但畫面沒有變，
         重新整理後才變」就是這個問題（而且只有在設定了網站圖示的首頁才會出現，所以很難找到原因）。
         不刪除，而是**只把網址覆寫成我們的圖示** — 節點本身保持不變，因此不會影響 React，
         不論瀏覽器選擇哪一個連結，最後取得的都是相同圖示。 */
      theirs.forEach(l => {
        if (!l.hasAttribute(ORIG)) l.setAttribute(ORIG, l.getAttribute('href') ?? '');
        if (l.href !== url) l.href = url;
      });

      if (mine) {
        if (mine.href !== url) mine.href = url;
        return;
      }
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = url;
      link.setAttribute(`data-${MARK}`, '');
      document.head.appendChild(link);
    };

    apply();
    // 切換頁面後，Next 會重新繪製 head，並把預設圖示放回來（原因與標題相同）。
    // 如果已經是我們的值就什麼都不做，因此不會反覆執行。
    // 連 href 也會監看 — 即使 React 把自己的連結網址恢復原狀，也會再次覆寫。
    // 如果已經是我們的值就什麼都不做，因此不會反覆執行
    const ob = new MutationObserver(apply);
    ob.observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ['href'] });
    return () => ob.disconnect();
  }, [loaded, url, pathname]);

  return null;
}