'use client';
// 圖片備份詳細頁（4.11）— 日誌型：垂直捲動檢視器／單一型：大圖 + 縮圖列 + 左右切換
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useLocalList, fmtDate } from '@/lib/postStore';
import { BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { ConfirmModal } from '@/components/ui/Modal';
import { useBlobUrl } from '@/lib/blobStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { PageTitle } from '@/components/ui/PageText';
import { Lightbox } from '@/components/ui/Lightbox';
import { useBoardSettings, boardBadgeStyle } from '@/lib/boardStore';

export default function BackupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [posts, setPosts, loaded] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  const [cur, setCur] = useState(0);
  const [delAsk, setDelAsk] = useState(false);
  const [lbOpen, setLbOpen] = useState(false); // 單一型 — 點擊放大查看
  const { st: boardSet } = useBoardSettings(); // 類型徽章顏色（環境設定 > 留言板管理）

  const p = posts.find(x => x.id === id);
  /* 如果這篇文章所屬的位置是私密的，即使透過網址進入也不開放（v2.0 使用者要求）。
     文章網址中沒有區段資訊，因此 MenuGuard 無法阻擋 — 這裡讀取文章後確認其所屬位置。
     **必須在其他 early return 之前呼叫**（因為是 Hook，所以每次 render 的數量必須相同） */
  const blocked = useHrefBlock(p && sectionHref('gallery', p.secId ?? MAIN_SEC));
  // 大字標題 — 如果是額外區段就使用該區段名稱，點擊時也回到該列表（v2.0 使用者回報）
  const tt = useSectionTitle('gallery', p?.secId, 'GALLERY');
  if (blocked) return blocked;
  if (!loaded) return <section className="page" />;
  if (!p || (p.visibility === 'private' && !isAdmin) || (p.visibility === 'member' && !user)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>找不到文章，或沒有查看權限</p></div>
      </section>
    );
  }

  const imgs: { url?: string; ph?: string }[] = p.images.length
    ? p.images.map(u => ({ url: u }))
    : p.phList.map(c => ({ ph: c }));
  /* 作者確認（v2.0 發現）— **兩者都不存在時不能視為相同。**
     舊文章或訪客撰寫的文章沒有 authorId，而未登入訪客的 user?.id 也不存在，
     因此會以 `undefined === undefined` 通過判斷 — 任何人都可以修改、刪除他人的文章 */
  const canManage = isAdmin || (!!p.authorId && p.authorId === user?.id);

  // 同時支援檔案 id／URL — 從 blobStore 載入（重新整理後也能維持）
  // natural：在固定影格內不放大，維持原始尺寸置中（單一型 — 超過影格時只縮小）
  const Img = ({ im, ratio, natural }: { im: { url?: string; ph?: string }; ratio?: string; natural?: boolean }) => {
    const u = useBlobUrl(im.url);
    if (u) {
      // eslint-disable-next-line @next/next/no-img-element
      // 不會放大超過原始尺寸 — 只有寬度不足時才縮小，小圖片維持原本大小（v2.0 使用者確認）
      return <img src={u} alt="" style={natural
        ? { maxWidth: '100%', maxHeight: '100%', display: 'block' }
        : { maxWidth: '100%', height: 'auto', display: 'block', margin: '0 auto' }} />;
    }
    return <div className={`ph ${im.ph ?? ''}`}
      style={natural ? { width: '100%', height: '100%' } : { aspectRatio: ratio ?? '16/10' }}><span>IMAGE</span></div>;
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <p>
          {p.category} · {p.author} · {fmtDate(p.date)}{p.madeDate ? ` · 製作 ${p.madeDate}` : ''}
          {/* 標籤（v2.0 使用者要求）— 與列表相同的顯示方式 */}
          {(p.tags ?? []).map(t => <i key={t} className="tag-in">#{t}</i>)}
        </p>
        <div className="head-actions">
          {canManage && <button className="btn btn-dark" onClick={() => router.push(`/gallery/${p.id}/edit`)}>EDIT</button>}
          {canManage && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      {/* 僅限制本文寬度 — 標頭維持全寬位置 */}
      <div className="panel" style={{ padding: 20, maxWidth: 960, margin: '0 auto' }}>
        {/* 標題・徽章垂直置中 + 預留下方間距 */}
        <h2 style={{ fontSize: 18, marginBottom: p.desc ? 8 : 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          {p.title}
          <span style={boardBadgeStyle(boardSet.gallery.find(b => b.id === p.type))}>
            {boardSet.gallery.find(b => b.id === p.type)?.label}
          </span>
        </h2>
        {p.desc && (
          <div className="post-body" style={{ fontSize: 12.5, margin: '0 0 16px' }}
            dangerouslySetInnerHTML={{ __html: sanitizeHtml(p.desc) }} />
        )}

        {p.type === 'log' ? (
          /* 日誌型 — 漫畫式垂直捲動 · 圖片之間沒有間隙地連續拼接（漫畫連接） */
          <div style={{ borderRadius: 10, overflow: 'hidden' }}>
            {imgs.map((im, i) => <Img key={i} im={im} />)}
          </div>
        ) : p.type === 'vlist' ? (
          /* 單一（垂直排列） （v1.9）— 與日誌型不同，圖片之間留有間距並垂直排列，點擊放大 */
          <div style={{ display: 'grid', gap: 14 }}>
            {imgs.map((im, i) => (
              <div key={i} style={{ borderRadius: 10, overflow: 'hidden', cursor: im.url ? 'zoom-in' : undefined }}
                onClick={() => { if (im.url) { setCur(i); setLbOpen(true); } }}>
                <Img im={im} />
              </div>
            ))}
          </div>
        ) : (
          /* 單一型 — 大圖 + 左右切換 + 縮圖列 */
          <>
            <div className="single-viewer">
              {/* 固定 16:10 影格內置中 — 只有實際圖片才能點擊放大。
                  grid 會因內容高度增加隱式 row，使 max-height:100% 失效（長圖被裁切）→ flex（v1.9） */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: imgs[cur].url ? 'zoom-in' : undefined,
              }}
                onClick={() => { if (imgs[cur].url) setLbOpen(true); }}>
                <Img im={imgs[cur]} natural />
              </div>
              {imgs.length > 1 && (
                <>
                  <button className="nav" style={{ left: 10 }}
                    onClick={() => setCur(c => (c - 1 + imgs.length) % imgs.length)}>◁</button>
                  <button className="nav" style={{ right: 10 }}
                    onClick={() => setCur(c => (c + 1) % imgs.length)}>▷</button>
                </>
              )}
            </div>
            {imgs.length > 1 && (
              <div className="thumb-strip">
                {imgs.map((im, i) => (
                  <div key={i} className={`t ${i === cur ? 'on' : ''}`} onClick={() => setCur(i)}>
                    <Img im={im} ratio="4/3" />
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* 單一型・單一（垂直）放大查看 — 從與檢視器相同的順序開始，以 ‹ › 繼續切換 */}
      {lbOpen && (p.type === 'single' || p.type === 'vlist') && p.images.length > 0 && (
        <Lightbox srcs={p.images} index={cur} onClose={() => setLbOpen(false)} />
      )}

      <ConfirmModal open={delAsk} title="確定要刪除文章嗎？" body="刪除後的文章無法復原。"
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setPosts(posts.filter(x => x.id !== p.id)); router.push(tt.href); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}