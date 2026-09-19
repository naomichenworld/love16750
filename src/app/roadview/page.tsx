'use client';
/**
 * 保留舊網址 (v2.0 使用者要求 — 「為什麼叫 roadview？不是 loadb 嗎」).
 *
 * 將載入紀錄的網址改為 `/loadb` 後，為了讓以前分享過或加入書籤的 `/roadview` 網址
 * 不會失效，因此會直接轉過去。查詢參數（`?s=`）也會一起帶過去。
 * **儲存區的資料表名稱仍維持 `roadview`** — 這與網址無關，如果修改的話，既有資料以及
 * 使用 fork 的人的 SQL 都會全部失效。
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RoadviewMoved() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/loadb${window.location.search}`);
  }, [router]);
  return <section className="page" />;
}