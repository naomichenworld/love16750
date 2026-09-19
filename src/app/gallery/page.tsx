'use client';
// EditableDesc 注入
// 圖片備份留言板（4.11）— 圖庫／列表切換 · 日誌／單一徽章 · 摺疊縮圖模糊
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useLocalList, fmtDate } from '@/lib/postStore';
import { BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { createPortal } from 'react-dom';
import { CroppedBlobImg, CropEditor, CropValue } from '@/components/ui/CropEditor';
import { useBlobUrl } from '@/lib/blobStore';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';
import { useMenuSettings, canGalleryWrite } from '@/lib/menuStore';

const FOLD_LABEL = { spoiler: '스포일러', adult: '수위 주의' };

function BackupPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [postsAll, setPostsAll] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  // 多個區段（v2.0）— 只顯示網址中的 ?s= 所指向的區段
  const sec = useSectionParam('gallery');
  const posts = filterSection(postsAll, sec.id);
  // 儲存時只替換此區段的位置 — 即使直接傳入篩選後的列表，也不會刪除其他區段
  const setPosts = sectionSetter(postsAll, sec.id, setPostsAll);
  // 預設檢視 — 在環境設定 > 選單管理的圖庫項目中指定（5.2）
  const [menuSet, , menuLoaded] = useMenuSettings();
  const [view, setView] = useState<'gal' | 'list'>('gal');
  const [viewInit, setViewInit] = useState(false);
  useEffect(() => {
    if (menuLoaded && !viewInit) { setView(menuSet.backupView); setViewInit(true); }
  }, [menuLoaded, viewInit, menuSet.backupView]);
  const [q, setQ] = useState('');
  const [unveiled, setUnveiled] = useState<Record<string, boolean>>({});
  /* 右鍵 → 修改縮圖（v2.0 使用者要求）— 直接在列表中修改代表圖片裁切。
     不需要進入編輯畫面。僅限管理員與作者，而且文章必須有圖片 */
  const [ctx, setCtx] = useState<{ x: number; y: number; post: BackupPost } | null>(null);
  const [cropPost, setCropPost] = useState<BackupPost | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [ctx]);
  const onCtx = (e: React.MouseEvent, p: BackupPost) => {
    if (!(isAdmin || (!!user && p.authorId === user.id)) || !p.images[0]) return;
    e.preventDefault();
    e.stopPropagation();
    setCtx({ x: e.clientX, y: e.clientY, post: p });
  };

  const visible = posts
    .filter(p => isAdmin || p.visibility === 'public' || (p.visibility === 'member' && user))
    .filter(p => !q || p.title.includes(q) || p.category.includes(q)
      || (p.tags ?? []).some(t => t.toLowerCase().includes(q.toLowerCase())));   // 標籤搜尋（v2.0）

  // 編輯模式下拖曳卡片排序（v1.9 — 圖庫檢視）
  const sort = useCardSort(visible, next => setPosts(mergeOrder(posts, next)), editOn && isAdmin);

  /* 文章累積後分頁（v2.0 使用者要求）— 根據檢視方式，每頁顯示數量不同。
     圖庫檢視一行 3 個，因此 12 個（4 行）；列表檢視則與文章列表相同為 20 個。 */
  const PER = view === 'gal' ? 12 : 20;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(visible.length / PER));
  const cur = Math.min(page, pages);      // 搜尋・切換檢視後數量減少時，拉回最後一頁
  const start = (cur - 1) * PER;
  const paged = visible.slice(start, start + PER);
  useEffect(() => { setPage(1); }, [q, view]);   // 切換搜尋文字・檢視時從第一頁開始

  const count = (p: BackupPost) => Math.max(p.images.length, p.phList.length);
  const meta = (p: BackupPost) =>
    `${count(p)}장 · ${fmtDate(p.madeDate ? p.madeDate + 'T00:00:00' : p.date)}`;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'GALLERY' : sec.name}</PageTitle>
        <EditableDesc k="backup-desc" def="日誌型（漫畫捲動）／單一型（左右切換） · 列表／圖庫檢視切換" />
      </div>
      <div className="toolrow">
        <div className="seg">
          <button className={view === 'gal' ? 'on' : ''} onClick={() => setView('gal')}>圖庫</button>
          <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>列表</button>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar onSearch={setQ} />
          {/* 撰寫權限（v2.0 使用者要求）— 可在選單管理中針對圖庫個別設定 · 也可以縮小至指定會員 */}
          {canGalleryWrite(menuSet, sec.id, { loggedIn: !!user, isAdmin, id: user?.id }) && (
            <button className="btn btn-dark" onClick={() => router.push('/gallery/write' + secQuery('gallery', sec.id))}>✎ WRITE</button>
          )}
        </div>
      </div>

      {/* 圖庫／列表都先進行渲染，再只透過 display 切換（v1.9）—
          避免每次切換時重新掛載，導致圖片重新載入與出現閃爍 */}
      <div className="g3" style={{ display: view === 'gal' && visible.length > 0 ? undefined : 'none' }}>
          {paged.map((p, si) => {
            const i = start + si;   // 排序以完整列表的位置為基準
            const folded = p.fold && !unveiled[p.id];
            return (
              <div key={p.id} className="panel g-item" {...sort(i)}
                onClick={() => { if (!folded && !editOn) router.push(`/gallery/${p.id}`); }}
                onContextMenu={e => onCtx(e, p)}>
                <div className={`thumb ${folded ? 'veil' : ''}`}>
                  <div style={{ position: 'absolute', inset: 0 }}>
                    <CroppedBlobImg fileRef={p.images[0]} crop={p.thumbCrop} ph={p.phList[0] ?? 'cool'} />
                  </div>
                  {/* 類型徽章（日誌／單一 …）從列表中移除（v2.0 使用者要求）— 詳細頁仍保留 */}
                  {folded && (
                    <div className="cover" onClick={e => { e.stopPropagation(); setUnveiled(u => ({ ...u, [p.id]: true })); }}>
                      <div>
                        <b>{p.fold!.type === 'custom' ? (p.fold!.label || '접힘') : FOLD_LABEL[p.fold!.type]}</b><br />
                        <span>點擊後顯示</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className="info">
                  <b>{p.title}</b>
                  <small>
                    {meta(p)}
                    {/* 標籤（v2.0 使用者要求） */}
                    {(p.tags ?? []).map(t => <i key={t} className="tag-in">#{t}</i>)}
                  </small>
                </div>
              </div>
            );
          })}
        </div>
      {/* 沒有文章時隱藏容器本身 — 修復空白面板像卡片一樣留在提示文字上方的問題（v1.9 使用者發現） */}
      <div className="panel flush" style={{ display: view === 'list' && visible.length > 0 ? undefined : 'none' }}>
          {paged.map(p => (
            <div key={p.id} className="list-item" onClick={() => router.push(`/gallery/${p.id}`)}
              onContextMenu={e => onCtx(e, p)}>
              <div className="th" style={{ position: 'relative' }}><CroppedBlobImg fileRef={p.images[0]} crop={p.thumbCrop} ph={p.phList[0] ?? 'cool'} /></div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <b>
                  {p.title}
                  {/* 類型徽章已移除（v2.0 使用者要求）— 只保留摺疊標示 */}
                  {p.fold && <span className="pill red" style={{ marginLeft: 6 }}>접힘</span>}
                </b>
                <small>
                  {meta(p)}
                  {/* 標籤 — 顯示於作者左側的那一行（v2.0 使用者要求） */}
                  {(p.tags ?? []).map(t => <i key={t} className="tag-in">#{t}</i>)}
                </small>
              </div>
              <small>{p.author}</small>
            </div>
          ))}
        </div>
      {visible.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          目前沒有文章
        </div>
      )}
      {visible.length > PER && <Pager page={cur} total={pages} onChange={setPage} />}

      {/* 右鍵選單 — 與其他右鍵操作相同順序：選單 → 選擇項目（v2.0） */}
      {ctx && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed', left: ctx.x, top: ctx.y, zIndex: 130,
          background: 'var(--panel-solid,#fff)', border: '1px solid var(--line)', borderRadius: 9,
          boxShadow: 'var(--sh-dd)', padding: 4, display: 'grid', minWidth: 128,
        }} onMouseDown={e => e.stopPropagation()}>
          <div style={{
            padding: '6px 12px 5px', fontSize: 10.5, color: 'var(--faint)', maxWidth: 200,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            borderBottom: '1px solid var(--line)', marginBottom: 3,
          }}>{ctx.post.title}</div>
          <button style={{ padding: '7px 12px', fontSize: 12, borderRadius: 6, textAlign: 'left' }}
            onClick={() => { setCropPost(ctx.post); setCtx(null); }}>縮圖修改</button>
        </div>,
        document.body,
      )}

      {/* 縮圖裁切 — 與撰寫表單相同的 4:3 裁切，可直接在列表中操作（v2.0 使用者要求） */}
      {cropPost && (
        <ThumbCropModal post={cropPost} onClose={() => setCropPost(null)}
          onApply={crop => {
            setPosts(posts.map(x => (x.id === cropPost.id ? { ...x, thumbCrop: crop } : x)));
            setCropPost(null);
          }} />
      )}
    </section>
  );
}

/** 代表圖片裁切 Modal — 將 blob 轉換為 URL 後交給 CropEditor（因為是 Hook，所以拆成獨立元件） */
function ThumbCropModal({ post, onClose, onApply }: {
  post: BackupPost; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const url = useBlobUrl(post.images[0]);
  if (!url) return null;
  return <CropEditor open src={url} aspect="4:3" initial={post.thumbCrop} onClose={onClose} onApply={onApply} />;
}

/** 讀取 ?s=，因此需要 Suspense 邊界（Next App Router） */
export default function BackupPage() {
  return <Suspense fallback={<section className="page" />}><BackupPageInner /></Suspense>;
}