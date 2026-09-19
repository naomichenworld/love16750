'use client';
/**
 * 如果將選單設為非公開，**文章也會以非公開狀態儲存**（v2.0 使用者要求）。
 *
 * 到目前為止，選單的公開範圍只是在畫面上隱藏而已 — 文章仍然以 `visibility: 'public'` 儲存，
 * 因此伺服器（RLS）會將該資料列提供給任何人。也就是說，即使阻擋了網址，只要直接呼叫 API
 * 還是可以看到。
 * 因此在**儲存時**，會以該文章所屬選單的公開範圍作為「最低標準」：
 *
 *   選單完全公開 → 文章維持原樣   ·   僅會員 → 最低 `member`   ·   僅管理員 → 最低 `private`
 *
 * 如果文章本身的公開範圍更嚴格（非公開文章），就維持原樣 — **只會縮小公開範圍，不會放寬。**
 * 對於文章本身根本沒有 `visibility` 欄位的類型（例如留言板文章等），也會在這裡決定，
 * 因此不需要修改類型。
 */
import { currentMenuSettings, hrefAccess } from './menuStore';
import { MAIN_SEC, sectionHref, type SectionKind } from './sectionStore';
import { MAIN_BOARD_ID } from './boardStore';
import type { Visibility } from './charStore';
import type { ListItem } from './backend/types';

/** Collection → 該列表所屬的選單。區段型只提供種類，所屬區段從項目的 `secId` 讀取 */
const AREA: Record<string, { kind?: SectionKind; href?: string; board?: boolean }> = {
  posts: { board: true },              // 留言板不是區段，而是透過 `?b=` 分開
  gallery: { kind: 'gallery' },
  roadview: { kind: 'roadview' },
  trpg_logs: { kind: 'trpg' },
  trpg_log_bodies: { kind: 'trpg' },   // 內文是獨立文件 — 只阻擋列表的話，內文仍然會留下
  dotori: { kind: 'dotori' },
  playlog: { kind: 'playlog' },
  commissions: { kind: 'comm' },
  diary: { kind: 'diary' },
  threads: { kind: 'threads' },
  guestbook: { href: '/guest' },
  memos: { href: '/memo' },
  rp_rooms: { href: '/rp' },
  characters: { kind: 'chars' },
  relations: { href: '/rels' },
  trpg_chars: { href: '/tchars' },
  applicants: { href: '/comm-apply' },
};

/** 該項目所屬的選單網址 — 不屬於任何選單的 Collection（留言・回答等）則為 null */
export function areaHrefOf(coll: string, item: ListItem): string | null {
  const a = AREA[coll];
  if (!a) return null;
  if (a.href) return a.href;
  if (a.board) {
    const b = typeof item.boardId === 'string' ? item.boardId : MAIN_BOARD_ID;
    return b === MAIN_BOARD_ID ? '/board' : `/board?b=${b}`;
  }
  const s = typeof item.secId === 'string' ? item.secId : MAIN_SEC;
  return sectionHref(a.kind!, s);
}

/** 儲存此項目時必須遵守的**最低**公開範圍 */
export function visFloorOf(coll: string, item: ListItem): Visibility {
  const href = areaHrefOf(coll, item);
  if (!href) return 'public';
  const v = hrefAccess(currentMenuSettings(), href);
  return v === 'admin' ? 'private' : v === 'member' ? 'member' : 'public';
}

const RANK: Record<string, number> = { public: 0, member: 1, private: 2 };

/** 兩者之中較嚴格的一方 */
export const strictestVis = (a: string, b: string): string =>
  ((RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b);