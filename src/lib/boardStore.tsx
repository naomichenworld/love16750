'use client';
// 討論區設定 (5.2 討論區管理) — 標頭（分類）列表管理 + 徽章（公告/秘密/折疊・各標頭）顏色
import { useCallback, useEffect, useState } from 'react';
import { newId } from './postStore';
import { MAIN_SEC } from './sectionStore';

export interface BoardBadge { id: string; label: string; bg: string; border: string; fg: string }

/** 系統徽章 3 種 — 不可刪除（顏色・文字可以修改） */
export const DEFAULT_BOARD_SYSTEM: BoardBadge[] = [
  { id: 'notice', label: '公告', bg: '#1d2025', border: '#1d2025', fg: '#ffffff' },
  { id: 'secret', label: '秘密', bg: '#a63a45', border: '#8c2f39', fg: '#ffffff' },
  { id: 'fold', label: '折疊', bg: '#f2e6e7', border: '#d9b8bc', fg: '#a63a45' },
];

/** 預設標頭 — 可以直接在設定中新增・刪除・變更列表順序 */
export const DEFAULT_BOARD_CATS: BoardBadge[] = ['閒聊', '設定', '合作', '其他'].map(c => ({
  id: `cat-${c}`, label: c, bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d',
}));

/** 圖庫（圖片備份）類型徽章 2 種 — 日誌/單張（可以修改標籤・顏色，不可刪除） */
export const DEFAULT_GALLERY_BADGES: BoardBadge[] = [
  { id: 'log', label: '日誌', bg: '#1d2025', border: '#1d2025', fg: '#ffffff' },
  { id: 'single', label: '單張', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' },
  // 單張（垂直排列）(v1.9) — 與日誌不同，圖片之間留有間隔，沿垂直方向一路顯示的文章
  { id: 'vlist', label: '單張（垂直）', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' },
];

/** 圖庫標頭 (v2.0) — 以前是直接寫死在程式碼中，無法修改。現在可以像討論區標頭一樣自由管理 */
export const DEFAULT_GALLERY_CATS: BoardBadge[] = ['合作', '塗鴉', '委託', '設定圖'].map(c => ({
  id: `gcat-${c}`, label: c, bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d',
}));

export interface BoardSettings {
  system: BoardBadge[]; cats: BoardBadge[]; gallery: BoardBadge[]; galleryCats: BoardBadge[];
  /** 每個圖庫各自使用的標頭 (v2.0 使用者要求) — 如果沒有特別設定，就直接使用預設圖庫的標頭。
   *  剛建立時如果沒有標頭，就無法先發表文章（與感想串・行程表相同的規則）。 */
  secGalleryCats?: Record<string, BoardBadge[]>;
}
const DEFAULTS: BoardSettings = {
  system: DEFAULT_BOARD_SYSTEM, cats: DEFAULT_BOARD_CATS,
  gallery: DEFAULT_GALLERY_BADGES, galleryCats: DEFAULT_GALLERY_CATS,
};
const KEY = 'ohome.boardset.v1';

/** 該圖庫要使用的標頭 (v2.0) — 如果沒有另外設定，就使用預設圖庫的標頭 */
export const galleryCatsOf = (s: BoardSettings, secId: string): BoardBadge[] =>
  (secId === MAIN_SEC ? s.galleryCats : s.secGalleryCats?.[secId] ?? s.galleryCats);

/** 包含該圖庫標頭的 patch — 如果是預設圖庫，就直接儲存在原本的位置 */
const galleryCatsPatch = (s: BoardSettings, secId: string, cats: BoardBadge[]): Partial<BoardSettings> =>
  (secId === MAIN_SEC ? { galleryCats: cats } : { secGalleryCats: { ...s.secGalleryCats, [secId]: cats } });

export function useBoardSettings() {
  const [st, setSt] = useState<BoardSettings>(DEFAULTS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<BoardSettings>;
        setSt({
          /* **先展開已儲存的值** — 以前只挑選已知的四個欄位建立新物件，
             後來新增的欄位（各圖庫標頭 `secGalleryCats`）在讀取時就會悄悄消失。
             會變成明明有儲存，重新整理後卻消失，很難找到原因 (v2.0) */
          ...DEFAULTS,
          ...p,
          system: DEFAULT_BOARD_SYSTEM.map(d => p.system?.find(s => s.id === d.id) ?? d),
          cats: p.cats ?? DEFAULT_BOARD_CATS,
          gallery: DEFAULT_GALLERY_BADGES.map(d => p.gallery?.find(g => g.id === d.id) ?? d),
          galleryCats: p.galleryCats ?? DEFAULT_GALLERY_CATS,
        });
      }
    } catch { /* 使用預設值 */ }
    setLoaded(true);
  }, []);
  const apply = useCallback((fn: (s: BoardSettings) => BoardSettings) => {
    setSt(s => {
      const n = fn(s);
      try { setSetting(KEY, n); } catch { /* 忽略 */ }
      return n;
    });
  }, []);
  const patchSystem = useCallback((id: string, p: Partial<BoardBadge>) =>
    apply(s => ({ ...s, system: s.system.map(b => (b.id === id ? { ...b, ...p } : b)) })), [apply]);
  const patchCat = useCallback((id: string, p: Partial<BoardBadge>) =>
    apply(s => ({ ...s, cats: s.cats.map(b => (b.id === id ? { ...b, ...p } : b)) })), [apply]);
  const addCat = useCallback(() =>
    apply(s => ({ ...s, cats: [...s.cats, { id: newId(), label: '新標頭', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' }] })), [apply]);
  const removeCat = useCallback((id: string) =>
    apply(s => ({ ...s, cats: s.cats.filter(b => b.id !== id) })), [apply]);
  const setCats = useCallback((cats: BoardBadge[]) => apply(s => ({ ...s, cats })), [apply]);
  const patchGallery = useCallback((id: string, p: Partial<BoardBadge>) =>
    apply(s => ({ ...s, gallery: s.gallery.map(b => (b.id === id ? { ...b, ...p } : b)) })), [apply]);
  /* 圖庫標頭 — 與討論區標頭相同的方式進行新增・修改・刪除・排序 (v2.0)。
     **每個圖庫都可以各自擁有** (v2.0 使用者要求) — 第一個參數就是指定哪一個圖庫。
     只會修改目前正在查看的圖庫，因此不會刪除其他圖庫的標頭。 */
  const mutGalleryCats = useCallback((secId: string, fn: (cats: BoardBadge[]) => BoardBadge[]) =>
    apply(s => ({ ...s, ...galleryCatsPatch(s, secId, fn(galleryCatsOf(s, secId))) })), [apply]);
  const patchGalleryCat = useCallback((secId: string, id: string, p: Partial<BoardBadge>) =>
    mutGalleryCats(secId, cs => cs.map(b => (b.id === id ? { ...b, ...p } : b))), [mutGalleryCats]);
  const addGalleryCat = useCallback((secId: string) =>
    mutGalleryCats(secId, cs => [...cs, { id: newId(), label: '新標頭', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' }]), [mutGalleryCats]);
  const removeGalleryCat = useCallback((secId: string, id: string) =>
    mutGalleryCats(secId, cs => cs.filter(b => b.id !== id)), [mutGalleryCats]);
  const setGalleryCats = useCallback((secId: string, cats: BoardBadge[]) =>
    mutGalleryCats(secId, () => cats), [mutGalleryCats]);
  return {
    st, loaded, patchSystem, patchCat, addCat, removeCat, setCats, patchGallery,
    patchGalleryCat, addGalleryCat, removeGalleryCat, setGalleryCats,
  };
}

/** 決定文章的徽章 — 公告/秘密優先，其餘與標頭比對（以標籤為基準・未註冊的標頭使用中性色） */
export function badgeFor(st: BoardSettings, p: { notice?: boolean; secret?: boolean; category: string }, cats?: BoardBadge[]): BoardBadge {
  if (p.notice) return st.system[0];
  if (p.secret) return st.system[1];
  return (cats ?? st.cats).find(c => c.label === p.category)
    ?? { id: 'etc', label: p.category, bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' };
}

/* ---------- 討論區多重建立 (5.2 v1.9) ---------- */
// 可以建立多個相同類型（列表型）的討論區 — 每個討論區有自己的名稱・標頭・權限・列表外觀（基本型/票券型）。
// 文章會在 ohome.board.v1 的同一處，以 boardId 區分儲存（即使刪除討論區，文章資料也會保留 — 第 3 章原則）。
export type BoardSkin = 'list' | 'ticket';
export type BoardPerm = 'guest' | 'member' | 'admin';

export interface Board {
  id: string;              // 'main' = 預設討論區（不可刪除）
  name: string;            // 選單・頁面標題顯示名稱
  desc: string;            // 頁面說明預設文字
  skin: BoardSkin;         // 列表外觀 — 基本型 / 票券型
  permWrite: BoardPerm;    // 發文權限（mock 階段預設登入 — 與讀取畫面相同）
  permComment: BoardPerm;  // 留言權限
  cats: BoardBadge[];      // 每個討論區自己的標頭
  fg?: string;             // 列表文字顏色 (v1.9 — 未指定時使用主題預設顏色)
}

const BOARDS_KEY = 'ohome.boards.v1';
export const MAIN_BOARD_ID = 'main';

export const DEFAULT_BOARDS: Board[] = [{
  id: MAIN_BOARD_ID, name: '列表',
  desc: '支援 MD / HTML 撰寫 · 禁止執行腳本 · 標頭 · 秘密文章 · 折疊',
  skin: 'list', permWrite: 'member', permComment: 'member', cats: DEFAULT_BOARD_CATS,
}];

export function useBoards(): {
  boards: Board[]; setBoards: (next: Board[]) => void; loaded: boolean;
  patchBoard: (id: string, p: Partial<Board>) => void;
} {
  const [boards, setSt] = useState<Board[]>(DEFAULT_BOARDS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(BOARDS_KEY);
      if (raw) setSt(JSON.parse(raw));
      else {
        // 遷移 — 將舊的全域標頭（boardset.cats）繼承到預設討論區
        const old = getRawSetting(KEY);
        if (old) {
          const cats = (JSON.parse(old) as Partial<BoardSettings>).cats;
          if (cats?.length) setSt([{ ...DEFAULT_BOARDS[0], cats }]);
        }
      }
    } catch { /* 使用預設值 */ }
    setLoaded(true);
    const sync = () => {
      try {
        const raw = getRawSetting(BOARDS_KEY);
        if (raw) setSt(JSON.parse(raw));
      } catch { /* 忽略 */ }
    };
    window.addEventListener('ohome-boards', sync);
    return () => window.removeEventListener('ohome-boards', sync);
  }, []);
  const setBoards = useCallback((next: Board[]) => {
    setSt(next);
    try { setSetting(BOARDS_KEY, next); } catch { /* 忽略 */ }
    // 讓上方選單在同一個分頁中立即更新
    setTimeout(() => window.dispatchEvent(new Event('ohome-boards')), 0);
  }, []);
  const patchBoard = useCallback((id: string, p: Partial<Board>) => {
    setSt(s => {
      const n = s.map(b => (b.id === id ? { ...b, ...p } : b));
      try { setSetting(BOARDS_KEY, n); } catch { /* 忽略 */ }
      setTimeout(() => window.dispatchEvent(new Event('ohome-boards')), 0);
      return n;
    });
  }, []);
  return { boards, setBoards, loaded, patchBoard };
}

/** 討論區列表頁面路徑 — 預設討論區不帶查詢參數 */
export const boardHref = (id: string) => (id === MAIN_BOARD_ID ? '/board' : `/board?b=${id}`);

/** 討論區徽章樣式 — 膠囊型、文字正中央（背景一起上色，避免只有文字突出）
 *  韓文字體會集中在字框上方，line-height:1 時會看起來往上偏（v1.9 實測修正） —
 *  line-height 11px + 上3/下2 不對稱 padding，使文字墨跡中心 = 徽章中心，總高度 18px 整數 */
export function boardBadgeStyle(b?: BoardBadge): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '3px 11px 2px', borderRadius: 999, lineHeight: 'calc(11px*var(--fs,1))',
    background: b?.bg ?? '#eef0f2', border: `1px solid ${b?.border ?? '#d7dae0'}`, color: b?.fg ?? '#5d636d',
    fontSize: 'calc(10.5px*var(--fs,1))', fontWeight: 700, letterSpacing: '.05em',
    fontFamily: 'var(--sans)', whiteSpace: 'nowrap',
  };
}
import type React from 'react';
import { getRawSetting, setSetting } from './settingStore';