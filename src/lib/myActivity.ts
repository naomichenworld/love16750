// 我撰寫的文章／留言收集（我的頁面，v1.9）— 留言板文章・留言 / 載入紀錄圖片・留言 / 訪客留言
import { Post, GuestEntry, CommentRow } from './postStore';
import { RoadItem } from './galleryStore';
import { Board, MAIN_BOARD_ID } from './boardStore';

export interface MyItem { kind: string; text: string; date: string; href: string }

export function collectMyItems(
  userId: string,
  posts: Post[], roads: RoadItem[], guestEntries: GuestEntry[], boards: Board[],
  // 留言會與文章分開儲存（v2.0）— 舊文章中原本存在的留言也會在下面一起計算
  cmtRows: CommentRow[] = [],
): MyItem[] {
  const boardName = (p: Post) => {
    const b = boards.find(x => x.id === (p.boardId ?? MAIN_BOARD_ID));
    return b && b.id !== MAIN_BOARD_ID ? b.name : '留言板';
  };
  return [
    ...posts.filter(p => p.authorId === userId)
      .map(p => ({ kind: `${boardName(p)}文章`, text: p.title, date: p.date, href: `/board/${p.id}` })),
    ...posts.flatMap(p => [
      ...p.comments,
      ...cmtRows.filter(c => c.target === 'post' && c.targetId === p.id),
    ].filter(c => c.authorId === userId)
      .map(c => ({ kind: `${boardName(p)}留言`, text: c.text, date: c.date, href: `/board/${p.id}` }))),
    ...roads.filter(it => it.authorId === userId)
      .map(it => ({ kind: '載入紀錄圖片', text: it.title, date: it.date, href: '/loadb' })),
    ...roads.flatMap(it => [
      ...it.comments,
      ...cmtRows.filter(c => c.target === 'road' && c.targetId === it.id),
    ].filter(c => c.authorId === userId)
      .map(c => ({ kind: '載入紀錄留言', text: c.text, date: c.date, href: '/loadb' }))),
    ...guestEntries.filter(e => e.authorId === userId)
      .map(e => ({ kind: '訪客留言', text: e.body, date: e.date, href: '/guest' })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}