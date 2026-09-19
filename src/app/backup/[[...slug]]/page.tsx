'use client';
/**
 * 保留舊網址（v2.0 使用者要求 —「為什麼畫廊是 backup？」）。
 *
 * 將畫廊網址從 `/backup` → `/gallery` 更改後，為了讓以前分享過或加入書籤的網址
 * 不會失效，因此直接將它們重新導向。文章網址（`/backup/文章id`）與 query（`?s=`）也會一起移動。
 * **不修改儲存鍵（`ohome.backup.v1`）與資料表名稱（`gallery`）** — 它們與網址無關，
 * 如果修改，現有資料會全部消失。
 */
import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

export default function BackupMoved() {
  const router = useRouter();
  const { slug } = useParams<{ slug?: string[] }>();
  useEffect(() => {
    const rest = Array.isArray(slug) && slug.length ? `/${slug.join('/')}` : '';
    router.replace(`/gallery${rest}${window.location.search}`);
  }, [router, slug]);
  return <section className="page" />;
}