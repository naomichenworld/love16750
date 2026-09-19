'use client';
// 文章詳細頁（4.2）— 本文渲染（隔離清理）· 摺疊 · 留言＋回覆
import React, { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { extraBoardHref } from '@/lib/menuStore';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, Post, Comment, newId, fmtDate,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import { useBoards, boardHref, MAIN_BOARD_ID, BoardPerm } from '@/lib/boardStore';
import { renderBody } from '@/lib/sanitize';
import { KInput } from '@/components/ui/Kit';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { GuestIdBar } from '@/components/ui/GuestId';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';
import { pushNotif } from '@/lib/notifStore';

const FOLD_LABEL = { spoiler: '注意劇透', adult: '注意限制級內容' };

export default function BoardDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [posts, setPosts, loaded] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  // 留言會獨立儲存（v2.0）— 如果放在文章裡，留言時就必須 UPDATE 文章，
  // 導致一般會員無法在管理員的文章下留言（分支使用者回報）
  const [cmtRows, setCmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const { boards } = useBoards();                  // 所屬留言板（5.2 多留言板）
  const [open, setOpen] = useState(false);         // 解除摺疊
  const [cmt, setCmt] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [delAsk, setDelAsk] = useState(false);
  const [gName, setGName] = useState('');                       // 訪客暱稱（允許訪客留言時）

  const post = posts.find(p => p.id === id);
  /* 如果這篇文章所屬的位置是私密的，即使直接透過網址進入也不讓其開啟（v2.0 使用者要求）。
     文章網址沒有區段資訊，因此 MenuGuard 無法阻止 — 在讀取文章並得知所屬位置的這裡進行判定。
     **必須在其他 early return 之前呼叫**（因為是 Hook，每次 render 呼叫數量必須相同） */
  const bid = post?.boardId ?? MAIN_BOARD_ID;
  const blocked = useHrefBlock(post && (bid === MAIN_BOARD_ID ? '/board' : extraBoardHref(bid)));
  // 只有 loaded 之後才渲染本文（避免 SSR／hydration 不一致）
  const html = useMemo(() => (post && loaded ? renderBody(post.mode, post.body) : ''), [post, loaded]);

  // 如果是被封鎖的位置，就在這裡返回 — 必須先呼叫完所有 Hook，才能確保每次 render 的數量相同
  if (blocked) return blocked;
  if (!loaded) return <section className="page" />;
  if (!post) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>BOARD</PageTitle><p>找不到文章</p></div>
      </section>
    );
  }
  /* 在同一處判定是否為作者（v2.0 發現）— 舊文章或訪客撰寫的文章沒有 authorId，
     未登入訪客也沒有 user?.id，因此兩者會被判定為「相同」，
     導致**私密文章直接被開啟。** */
  const isAuthor = !!post.authorId && post.authorId === user?.id;
  if (post.secret && !isAdmin && !isAuthor) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>BOARD</PageTitle><p>私密文章 — 僅作者與管理員可以查看</p></div>
      </section>
    );
  }

  const board = boards.find(b => b.id === (post.boardId ?? MAIN_BOARD_ID)) ?? boards[0];
  const boardTitle = board.id === MAIN_BOARD_ID ? 'BOARD' : board.name;
  // 留言權限（5.2）— 允許訪客時可由訪客撰寫（暱稱＋密碼，訪客留言 4.7 規則）
  const allow = (p: BoardPerm) => (p === 'admin' ? isAdmin : p === 'member' ? !!user : true);
  const guestMode = !user && board.permComment === 'guest';
  const canComment = allow(board.permComment) && (!!user || guestMode);

  const canManage = isAdmin || isAuthor;
  const update = (patch: Partial<Post>) =>
    setPosts(posts.map(p => (p.id === post.id ? { ...p, ...patch } : p)));

  // 這篇文章的留言 — 分離儲存的資料＋舊文章中仍保留的留言（v2.0）
  const comments = commentsFor(cmtRows, 'post', post.id, post.comments);

  const addComment = () => {
    if (!canComment) { toast('登入後才能留言'); return; }
    if (!cmt.trim()) return;
    if (guestMode && !gName.trim()) { toast('請輸入暱稱'); return; }
    const base = { id: newId(), text: cmt.trim(), date: new Date().toISOString(), parentId: replyTo ?? undefined };
    const c: CommentRow = user
      ? { ...base, target: 'post', targetId: post.id, author: user.nickname, authorId: user.id }
      : { ...base, target: 'post', targetId: post.id, author: gName.trim(), authorId: '' };
    setCmtRows([...cmtRows, c]);
    /* 通知（v2.0 分支回報 —「留言了卻沒有收到通知」）：留言板的留言過去甚至
       **完全沒有建立通知**（只有載入紀錄・訪客留言・角色扮演有）。通知作者，若是回覆也通知該留言的作者。 */
    const me = user?.id ?? '';
    if (post.authorId && post.authorId !== me) {
      pushNotif({
        type: 'comment', toUserId: post.authorId, href: `/board/${post.id}`,
        title: `「${post.title}」有新留言`, body: `${c.author} — ${c.text.slice(0, 50)}`,
      });
    }
    if (replyTo) {
      /* 不只是根留言作者，而是**所有曾在該對話中回覆的人**都要收到通知（v2.0 分支回報 —
         管理員回覆自己的根留言時，中間曾回覆的會員什麼都收不到）。
         作者已經在上面收到通知，因此排除。 */
      const rootAuthor = comments.find(x => x.id === replyTo)?.authorId;
      const seen = new Set<string>();
      for (const t of comments.filter(x => x.id === replyTo || x.parentId === replyTo)) {
        const to = t.authorId;
        if (!to || to === me || to === post.authorId || seen.has(to)) continue;
        seen.add(to);
        pushNotif({
          type: 'comment', toUserId: to, href: `/board/${post.id}`,
          title: to === rootAuthor ? '有人回覆了我的留言' : '有人回覆了我參與的留言',
          body: `${c.author} — ${c.text.slice(0, 50)}`,
        });
      }
    }
    setCmt(''); setReplyTo(null);
  };

  // 刪除留言 — 回覆也一起刪除。如果是舊文章裡的留言，就從文章端刪除（v2.0）
  const removeComment = (c: Comment) => {
    const gone = (x: { id: string; parentId?: string }) => x.id === c.id || x.parentId === c.id;
    if (cmtRows.some(gone)) setCmtRows(cmtRows.filter(x => !gone(x)));
    if (post.comments.some(gone)) update({ comments: post.comments.filter(x => !gone(x)) });
  };
  const roots = comments.filter(c => !c.parentId);
  const childrenOf = (pid: string) => comments.filter(c => c.parentId === pid);

  const CmtRow = ({ c, depth }: { c: Comment; depth: number }) => (
    <div className={`cmt ${depth > 0 ? 'reply-depth' : ''}`}>
      <b>{c.author}</b><small>{fmtDate(c.date)}</small>
      {canComment && depth === 0 && (
        <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8 }}
          onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
          {replyTo === c.id ? '取消回覆' : '回覆'}
        </small>
      )}
      {/* 訪客留言只能由管理員刪除（v2.0 使用者確認）— 伺服器只能以這種方式接收 */}
      {(isAdmin || (user && c.authorId === user.id)) && (
        <small style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 8 }}
          onClick={() => removeComment(c)}>
          刪除
        </small>
      )}
      <p>{c.text}</p>
    </div>
  );

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={boardHref(board.id)}>{boardTitle}</PageTitle>
        <p>{post.notice ? '公告 · ' : `${post.category} · `}{post.author} · {fmtDate(post.date)}</p>
        <div className="head-actions">
          {/* 僅作者本人可以編輯 — 管理員也只能刪除其他人的文章（v1.9） */}
          {isAuthor && (
            <button className="btn btn-dark" onClick={() => router.push(`/board/write?edit=${post.id}`)}>EDIT</button>
          )}
          {canManage && (
            <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>
          )}
        </div>
      </div>

      <div className="panel" style={{ padding: '26px 28px' }}>
        <h2 style={{ fontSize: 19, marginBottom: 4 }}>
          {post.secret && '🔒 '}{post.title}
        </h2>
        <p style={{ fontSize: 11, color: 'var(--faint)', marginBottom: 18 }}>
          {post.author} · {fmtDate(post.date)} · {post.mode.toUpperCase()}
          {/* 標籤（v2.0 使用者要求）— 與列表相同的顯示方式 */}
          {(post.tags ?? []).map(t => (
            <span key={t} style={{ marginLeft: 7, color: 'color-mix(in srgb,var(--accent) 65%,var(--faint))' }}>#{t}</span>
          ))}
        </p>

        {/* 摺疊（6.2）— 模糊遮罩，點擊後顯示 */}
        <div className={`veil ${!post.fold || open ? 'open' : ''}`}>
          {post.fold && !open && (
            <div className="cover" onClick={() => setOpen(true)} style={{ position: 'absolute' }}>
              <div>
                <b>{post.fold.type === 'custom' ? (post.fold.label || '已摺疊文章') : FOLD_LABEL[post.fold.type]}</b>
                <span style={{ display: 'block' }}>點擊後顯示內容</span>
              </div>
            </div>
          )}
          <div className="post-body" style={post.fold && !open ? { minHeight: 120, filter: 'blur(6px)' } : undefined}
            dangerouslySetInnerHTML={{ __html: html }} />
        </div>
      </div>

      {/* 留言＋回覆 */}
      <div className="panel" style={{ padding: 0, marginTop: 16 }}>
        <div style={{ padding: '16px 18px' }}>
          <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 13 }}>
            COMMENTS {comments.length > 0 && <span style={{ color: 'var(--accent)' }}>{comments.length}</span>}
          </h4>
          {roots.map(c => (
            <React.Fragment key={c.id}>
              <CmtRow c={c} depth={0} />
              {childrenOf(c.id).map(cc => <CmtRow key={cc.id} c={cc} depth={1} />)}
            </React.Fragment>
          ))}
          {comments.length === 0 && (
            <p style={{ fontSize: 12, color: 'var(--faint)' }}>留下第一則留言吧</p>
          )}
        </div>
        {canComment ? (
          /* 訪客撰寫（允許訪客時）— 分隔線下方垂直排列 GUEST 列＋輸入列 */
          <div className={`cmt-input ${guestMode ? 'guest' : ''}`}>
            {guestMode && <GuestIdBar name={gName} onName={setGName} />}
            <div className="ci-row" style={guestMode ? undefined : { display: 'contents' }}>
              <KInput
                placeholder={replyTo ? '撰寫回覆...' : '留下留言...'}
                value={cmt} onChange={e => setCmt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addComment(); }}
              />
              <button className="btn btn-dark" onClick={addComment}>POST</button>
            </div>
          </div>
        ) : (
          <div style={{ padding: '12px 18px', borderTop: '1px solid var(--line)', fontSize: 11.5, color: 'var(--faint)' }}>
            {user ? '此留言板僅管理員可以留言' : '登入後才能留言'}
          </div>
        )}
      </div>

      <ConfirmModal open={delAsk} title="確定要刪除文章嗎？" body="刪除後的文章無法復原。"
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => {
            setPosts(posts.filter(p => p.id !== post.id));
            // 與文章相關的留言也一起刪除 — 因為是分開儲存的，留下它們會變成沒有所屬文章的留言（v2.0）
            setCmtRows(cmtRows.filter(c => !(c.target === 'post' && c.targetId === post.id)));
            router.push(boardHref(board.id));
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}