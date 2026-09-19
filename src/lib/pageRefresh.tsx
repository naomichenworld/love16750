'use client';
// 再次點擊相同選單 = 將該頁面重新繪製成初始狀態（v1.9 使用者確認）
// 不是重新整理瀏覽器，而是只重新掛載頁面 subtree — BGM・上方列等外層框架會維持不變。
import React, { useEffect, useState } from 'react';

const EVT = 'ohome-page-refresh';

/** 將目前頁面重新渲染成初始狀態（捲動位置也回到最上方） */
export function refreshPage() {
  window.dispatchEvent(new Event(EVT));
}

/** 給 children 加上 key 來重新掛載 — 在 layout 中包住 <main> 內容 */
export function PageFrame({ children }: { children: React.ReactNode }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => {
      setN(v => v + 1);
      // 產生重新進入頁面的感覺 — 捲動回到最上方
      requestAnimationFrame(() => {
        document.getElementById('appMain')?.scrollTo({ top: 0 });
        window.scrollTo({ top: 0 });
      });
    };
    window.addEventListener(EVT, bump);
    return () => window.removeEventListener(EVT, bump);
  }, []);
  return <React.Fragment key={n}>{children}</React.Fragment>;
}