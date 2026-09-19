'use client';
// 我撰寫的文章／留言全部列表（我的頁面，v1.9）— 留言板式分頁，點擊後前往對應文章
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, GUEST_SEED, Post, GuestEntry, fmtDate,
  CommentRow, COMMENT_KEY, COMMENT_SEED,
} from '@/lib/postStore';
import { RoadItem, ROAD_SEED } from '@/lib/galleryStore';
import { useBoards } from '@/lib/boardStore';
import { collectMyItems } from '@/lib/myActivity';
import { Pager } from '@/components/ui/Kit';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

const PER_PAGE = 15;

export default function MyPostsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [posts] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  const [roads] = useLocalList<RoadItem>('ohome.road.v1', ROAD_SEED);
  const [guestEntries] = useLocalList<GuestEntry>('ohome.guest.v1', GUEST_SEED);
  // 留言會與文章分開儲存 (v2.0)
  const [cmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const { boards } = useBoards();
  const [page, setPage] = useState(1);

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href="/mypage">MY POSTS</PageTitle><p>登入後才能使用</p></div>
      </section>
    );
  }

  const items = collectMyItems(user.id, posts, roads, guestEntries, boards, cmtRows);
  const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
  const pageList = items.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href="/mypage">MY POSTS</PageTitle>
        <EditableDesc k="mypage-posts-desc" def="我撰寫的文章與留言" />
      </div>
      <div className="panel board-list flush" style={{ maxWidth: 760, margin: '0 auto' }}>
        {pageList.map((it, i) => (
          <div className="brow" key={i} style={{ gridTemplateColumns: '96px 1fr 60px' }}
            onClick={() => router.push(it.href)}>
            <span className="cat"><span className="pill">{it.kind}</span></span>
            <b>{it.text}</b>
            <span className="dt">{fmtDate(it.date)}</span>
          </div>
        ))}
        {items.length === 0 && (
          <div style={{ padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>沒有撰寫過的文章</div>
        )}
      </div>
      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
        <Pager page={page} total={totalPages} onChange={setPage} />
      </div>
    </section>
  );
}