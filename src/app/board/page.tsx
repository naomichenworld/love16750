'use client';
// 一般留言板列表（4.2 / 5.2 多留言板）— 分類標籤篩選 · 搜尋 · 私密文章遮罩 · 摺疊顯示 · 分頁
// ?b=<留言板 id> 用來區分留言板（沒有則使用預設留言板）· 列表樣式：基本型／票券型（5.2 v1.9）
import React, { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, Post, fmtDate,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import {
  useBoardSettings, useBoards, badgeFor, boardBadgeStyle, boardHref, MAIN_BOARD_ID, BoardPerm,
} from '@/lib/boardStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { CropImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const PER_PAGE = 10;

/** 從本文中擷取第一張圖片 — 用於票券樣式縮圖（HTML img / MD 圖片） */
function firstImage(body: string): string | null {
  const html = /<img[^>]*src=["']([^"']+)["']/i.exec(body);
  if (html) return html[1];
  const md = /!\[[^\]]*\]\(([^)\s]+)/.exec(body);
  return md ? md[1] : null;
}

function BoardInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const params = useSearchParams();
  const bid = params.get('b') ?? MAIN_BOARD_ID;
  const { boards, loaded: boardsLoaded } = useBoards();
  const board = boards.find(b => b.id === bid) ?? boards[0];
  const [posts] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  // 留言數 — 留言會與文章分開儲存（v2.0）。舊文章中原本保留的留言也會一起計算
  const [cmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const cmtCount = (p: Post) => commentsFor(cmtRows, 'post', p.id, p.comments).length;
  const { st: boardSet } = useBoardSettings();   // 系統標籤顏色（環境設定 > 留言板管理）
  const [cat, setCat] = useState('전체');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);

  // 切換留言板時重設篩選條件與頁面
  const [prevBid, setPrevBid] = useState(bid);
  if (prevBid !== bid) { setPrevBid(bid); setCat('전체'); setQ(''); setPage(1); }

  // 3 階段權限 — mock 階段預設需要登入（與載入紀錄 4.10 相同規則）
  const allow = (p: BoardPerm) => (p === 'admin' ? isAdmin : p === 'member' ? !!user : true);

  const visible = useMemo(() => {
    let list = posts.filter(p => (p.boardId ?? MAIN_BOARD_ID) === board.id);
    if (cat === '공지') list = list.filter(p => p.notice);
    else if (cat !== '전체') list = list.filter(p => p.category === cat);
    if (q) {
      const k = q.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(k) ||
        p.author.toLowerCase().includes(k) ||
        (p.tags ?? []).some(t => t.toLowerCase().includes(k)) ||   // 標籤搜尋（v2.0 使用者要求）
        (!p.secret && p.body.toLowerCase().includes(k)));
    }
    // 公告固定在上方＋依最新時間排序
    return list.sort((a, b) =>
      (b.notice ? 1 : 0) - (a.notice ? 1 : 0) || b.date.localeCompare(a.date));
  }, [posts, board.id, cat, q]);

  const totalPages = Math.max(1, Math.ceil(visible.length / PER_PAGE));
  const pageList = visible.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  /* 私密文章查看權限（v2.0 發現）— 沒有 authorId 的私密文章連未登入訪客也能查看。
     因為兩者都是 undefined，所以 `undefined === undefined` 會成立 */
  const canRead = (p: Post) => !p.secret || isAdmin || (!!p.authorId && p.authorId === user?.id);

  if (!boardsLoaded) return <section className="page" />;

  const postBadge = (p: Post) => (
    <span style={boardBadgeStyle(badgeFor(boardSet, p, board.cats))}>
      {p.notice ? boardSet.system[0].label : p.secret ? boardSet.system[1].label : p.category}
    </span>
  );

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={boardHref(board.id)}>{board.id === MAIN_BOARD_ID ? 'BOARD' : board.name}</PageTitle>
        <EditableDesc k={board.id === MAIN_BOARD_ID ? 'board-desc' : `board-desc-${board.id}`} def={board.desc} />
      </div>
      <div className="toolrow">
        <div className="seg">
          {['전체', '공지', ...board.cats.map(x => x.label)].map(c => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => { setCat(c); setPage(1); }}>{c}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar onSearch={v => { setQ(v); setPage(1); }} />
          {allow(board.permWrite) && !!user && (
            <button className="btn btn-dark" onClick={() => router.push(`/board/write?b=${board.id}`)}>✎ WRITE</button>
          )}
        </div>
      </div>

      {board.skin === 'ticket' ? (
        /* 票券型樣式（5.2 v1.9）— 左側縮圖（本文第一張圖片）＋撕票線＋右側文章資訊 */
        <div style={board.fg ? { color: board.fg } : undefined}>
          {pageList.map(p => {
            // 代表圖片（手動選擇＋裁切）優先，沒有則使用本文第一張圖片（v1.9）
            const thumb = canRead(p) ? (p.thumbSrc ?? firstImage(p.body)) : null;
            return (
              <div className="bticket" key={p.id} onClick={() => { if (canRead(p)) router.push(`/board/${p.id}`); }}>
                <div className="bt-thumb">
                  {thumb
                    ? <CropImg src={thumb} crop={p.thumbSrc ? p.thumbCrop : undefined} />
                    : <div className="bt-ph">{(canRead(p) ? p.title : 'SECRET').slice(0, 1).toUpperCase()}</div>}
                </div>
                <div className="bt-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {postBadge(p)}
                    {p.fold && <span style={boardBadgeStyle(boardSet.system[2])}>{boardSet.system[2].label}</span>}
                  </div>
                  <div className="bt-title">
                    {canRead(p) ? <>{p.secret && '🔒 '}{p.title}</> : '🔒 這是私密文章'}
                    {canRead(p) && cmtCount(p) > 0 && <span className="cmt">{cmtCount(p)}</span>}
                  </div>
                  <div className="bt-meta">{p.author} · {fmtDate(p.date)}</div>
                </div>
              </div>
            );
          })}
          {pageList.length === 0 && (
            <div className="panel" style={{ padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>目前沒有文章</div>
          )}
        </div>
      ) : (
        /* 基本型樣式 — 列表列（文字顏色可在留言板管理中指定，v1.9） */
        <div className="panel board-list flush" style={board.fg ? { color: board.fg } : undefined}>
          {pageList.map(p => (
            <div className="brow" key={p.id} onClick={() => { if (canRead(p)) router.push(`/board/${p.id}`); }}>
              <span className="cat">{postBadge(p)}</span>
              {/* 在標題欄內將標籤對齊至最右側（＝作者正左方）—
                  如果另外建立欄位，每一列的 Grid 都是獨立的，作者欄會因標籤長度不同而產生偏移 */}
              <div className="tcell">
                {canRead(p) ? (
                  <b>
                    {p.secret && '🔒 '}{p.title}
                    {cmtCount(p) > 0 && <span className="cmt">{cmtCount(p)}</span>}
                    {p.fold && <span style={{ ...boardBadgeStyle(boardSet.system[2]), marginLeft: 6 }}>{boardSet.system[2].label}</span>}
                  </b>
                ) : (
                  <b style={{ color: 'var(--faint)' }}>🔒 這是私密文章</b>
                )}
                {canRead(p) && (p.tags ?? []).length > 0 && (
                  <span className="tags">{(p.tags ?? []).map(t => <i key={t}>#{t}</i>)}</span>
                )}
              </div>
              <span className="who">{p.author}</span>
              <span className="dt">{fmtDate(p.date)}</span>
            </div>
          ))}
          {pageList.length === 0 && (
            <div style={{ padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>目前沒有文章</div>
          )}
        </div>
      )}
      <Pager page={page} total={totalPages} onChange={setPage} />
    </section>
  );
}

export default function BoardPage() {
  // useSearchParams 需要 Suspense 邊界（Next App Router）
  return <Suspense fallback={<section className="page" />}><BoardInner /></Suspense>;
}