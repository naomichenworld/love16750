'use client';
// 選單管理（5.2 — 選單選擇制）— 可自由建立上層選單（建立・刪除・名稱・順序）
// 將下層選單（功能模組）放置到想要的上層選單中的自由樹狀結構（v1.9 改版）。
// 從樹狀結構中移除的功能只是不再顯示，資料仍會保留（第 3 章原則）。
import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_MENU, FEATURES, MenuItem } from './menu';
import { newId } from './postStore';
import { getRawSetting, setSetting } from './settingStore';

export type MenuPerm = 'guest' | 'member' | 'admin';

/** 選單公開範圍（v1.9）— all：全部顯示 / member：對未登入者隱藏 / admin：僅管理員 */
export type MenuVis = 'all' | 'member' | 'admin';

/** 樹狀結構的下層選單項目 — 沒有 label 時使用預設名稱（FEATURES／留言板名稱）· pageTitle 用於覆蓋頁面上方的大標題
 *  visMembers（v2.0 使用者要求）：「隱藏未登入者」時縮小範圍，只有這些會員可以看到 — 留空則為所有已登入會員 */
export interface MenuLeaf { href: string; label?: string; pageTitle?: string; vis?: MenuVis; open?: boolean; visMembers?: string[] }
/** 樹狀結構的上層項目 — 有 href 時為單獨選單（沒有下層） */
export interface MenuGroupNode { id: string; label: string; href?: string; items: MenuLeaf[]; pageTitle?: string; vis?: MenuVis; open?: boolean; visMembers?: string[] }

/** 用於判定公開範圍的訪客 — id 用於「會員選擇」判定（v2.0） */
export interface MenuViewer { loggedIn: boolean; isAdmin: boolean; id?: string }

export interface MenuSettings {
  tree?: MenuGroupNode[];            // 自由選單樹（v1.9 — 沒有時從 v1 設定遷移）
  removedBoards: string[];           // 從選單中移除的額外留言板 href（不自動配置）
  // v1 遺留資料 — 僅作為樹狀結構遷移材料使用
  groupOrder: string[];
  hidden: string[];
  labels: Record<string, string>;
  // 選單的附屬設定（規格中「在選單管理」指定的項目）
  playlogPc: string[];               // 遊玩紀錄顯示欄位 — PC（4.16 v1.8）
  playlogMobile: string[];           //   〃 行動版（預設 Date/Scenario/Role/Playtime）
  roadUpload: MenuPerm;              // 載入紀錄上傳權限（4.10 v1.7）
  roadComment: MenuPerm;             // 載入紀錄留言權限
  backupView: 'gal' | 'list';        // 圖庫（圖片備份）預設檢視方式（5.2）
  /** 圖庫撰寫權限（v2.0 使用者要求）— 依區段 id 設定 · 未指定時為 'member'（所有已登入會員） */
  galWrite?: Record<string, MenuPerm>;
  /** 將圖庫撰寫權限縮小至特定會員（v2.0）— 僅在 'member' 時有意義 · 留空則為所有會員 */
  galWriteMembers?: Record<string, string[]>;
  calTitle: 'en' | 'num';            // 行事曆月份顯示（v1.9）— AUGUST 2026 / 2026.08
  imgProtect: ImgProtectArea[];      // 圖片儲存防護區域（v1.9 — 禁止右鍵・拖曳，管理員除外）
}

/** 圖片儲存防護區域（v1.9）— 留言板包含圖庫・載入紀錄 */
export type ImgProtectArea = 'board' | 'comm' | 'tchar' | 'chars' | 'rels';

export const IMG_PROTECT_AREAS: { key: ImgProtectArea; label: string; paths: string[] }[] = [
  { key: 'board', label: '留言板（包含圖庫・載入紀錄）', paths: ['/board', '/gallery', '/loadb'] },
  { key: 'comm', label: '委託', paths: ['/comm', '/comm-apply'] },
  { key: 'tchar', label: 'TRPG 角色', paths: ['/tchars'] },
  { key: 'chars', label: '自設（角色）', paths: ['/chars'] },
  { key: 'rels', label: '自設關係', paths: ['/rels'] },
];

/** 目前路徑所屬的圖片防護區域 — 沒有則為 null */
export function imgProtectAreaFor(pathname: string): ImgProtectArea | null {
  for (const a of IMG_PROTECT_AREAS) {
    if (a.paths.some(p => pathname === p || pathname.startsWith(p + '/'))) return a.key;
  }
  return null;
}

/** 預設樹狀結構 — 完全依照 DEFAULT_MENU 結構 */
export function defaultTree(): MenuGroupNode[] {
  return DEFAULT_MENU.map(m => m.children
    ? { id: `g-${m.label}`, label: m.label, items: m.children.map(c => ({ href: c.href })) }
    : { id: `g-${m.label}`, label: m.label, href: m.href, items: [] });
}

/** v1 設定（groupOrder/hidden/labels）→ 樹狀結構遷移 */
function migrateTree(p: Partial<MenuSettings>): MenuGroupNode[] {
  const order = [
    ...(p.groupOrder ?? []).filter(k => DEFAULT_MENU.some(m => m.label === k)),
    ...DEFAULT_MENU.map(m => m.label).filter(k => !(p.groupOrder ?? []).includes(k)),
  ];
  const hidden = p.hidden ?? [];
  const labels = p.labels ?? {};
  return order
    .map(k => DEFAULT_MENU.find(m => m.label === k)!)
    .filter(m => !hidden.includes(m.label))
    .map(m => m.children
      ? {
        id: `g-${m.label}`, label: labels[m.label] ?? m.label,
        items: m.children.filter(c => !hidden.includes(c.href))
          .map(c => ({ href: c.href, ...(labels[c.href] ? { label: labels[c.href] } : {}) })),
      }
      : { id: `g-${m.label}`, label: labels[m.label] ?? m.label, href: m.href, items: [] });
}

export const newGroupId = () => `g-${newId()}`;

export const PLAYLOG_COLS: { key: string; label: string }[] = [
  { key: 'date', label: '日期' },
  { key: 'scenario', label: '劇本' },
  { key: 'writer', label: '作者' },
  { key: 'with', label: '與誰' },
  { key: 'role', label: '角色' },
  { key: 'playtime', label: '遊玩時間' },
  { key: 'url', label: '網址' },
];

export const DEFAULT_MENU_SETTINGS: MenuSettings = {
  removedBoards: [],
  groupOrder: DEFAULT_MENU.map(m => m.label),
  hidden: [],
  labels: {},
  playlogPc: PLAYLOG_COLS.map(c => c.key),                       // PC 預設全部 7 欄
  playlogMobile: ['date', 'scenario', 'role', 'playtime'],       // 行動版預設 4 欄（v1.8）
  roadUpload: 'member', roadComment: 'guest',
  backupView: 'gal',
  calTitle: 'en',
  imgProtect: [],
};

const KEY = 'ohome.menuset.v1';

/** 已變更網址的選單（v2.0 使用者要求）— 舊名稱仍存在的項目 */
const MOVED: Record<string, string> = { '/roadview': '/loadb', '/backup': '/gallery' };

/**
 * 將已儲存選單中的舊網址替換為新網址（v2.0）。
 *
 * 選單樹中會以**字串**記錄網址，因此如果更改網址，已儲存的配置會被視為
 * 「不存在的功能」，整個從選單中消失。因此讀取時先替換一次 —
 * 之後在下一次 SAVE 時自然會以新網址儲存。
 * 由多個區段組成的網址（`/backup?s=fan`）也只替換前半段。
 */
function moveHrefs(p: Partial<MenuSettings>): Partial<MenuSettings> {
  const mv = (h: string) => {
    for (const [from, to] of Object.entries(MOVED)) {
      if (h === from) return to;
      if (h.startsWith(`${from}?`)) return to + h.slice(from.length);
    }
    return h;
  };
  return {
    ...p,
    ...(p.tree ? {
      tree: p.tree.map(g => ({
        ...g,
        ...(g.href ? { href: mv(g.href) } : {}),
        items: (g.items ?? []).map(it => ({ ...it, href: mv(it.href) })),
      })),
    } : {}),
    ...(p.removedBoards ? { removedBoards: p.removedBoards.map(mv) } : {}),
  };
}

/**
 * 不使用 Hook，直接讀取目前已儲存的選單設定（v2.0）。
 * 在像儲存時決定文章公開範圍這種**渲染外部**的情況下需要 — 那裡無法使用 Hook。
 */
export function currentMenuSettings(): MenuSettings {
  try {
    const raw = getRawSetting(KEY);
    if (raw) {
      const p = moveHrefs(JSON.parse(raw) as Partial<MenuSettings>);
      return { ...DEFAULT_MENU_SETTINGS, ...p, tree: p.tree ?? migrateTree(p) };
    }
  } catch { /* 預設值 */ }
  return DEFAULT_MENU_SETTINGS;
}

export function useMenuSettings(): [MenuSettings, (patch: Partial<MenuSettings>) => void, boolean] {
  const [st, setSt] = useState<MenuSettings>(DEFAULT_MENU_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = getRawSetting(KEY);
      if (raw) {
        const p = moveHrefs(JSON.parse(raw) as Partial<MenuSettings>);
        setSt({
          ...DEFAULT_MENU_SETTINGS,
          ...p,
          // 僅有 v1（顯示開關）設定時，遷移至自由樹狀結構（v1.9）
          tree: p.tree ?? migrateTree(p),
        });
      }
    } catch { /* 預設值 */ }
    setLoaded(true);
    const sync = () => {
      try {
        const raw = getRawSetting(KEY);
        if (raw) setSt(s => ({ ...s, ...moveHrefs(JSON.parse(raw)) }));
      } catch { /* 忽略 */ }
    };
    window.addEventListener('ohome-menuset', sync);
    return () => window.removeEventListener('ohome-menuset', sync);
  }, []);
  const patch = useCallback((p: Partial<MenuSettings>) => {
    setSt(s => {
      const n = { ...s, ...p };
      try { setSetting(KEY, n); } catch { /* 忽略 */ }
      // 讓上方列（TopBar）在同一分頁中立即更新
      setTimeout(() => window.dispatchEvent(new Event('ohome-menuset')), 0);
      return n;
    });
  }, []);
  return [st, patch, loaded];
}

/** 留言板 href — 額外留言板為 /board?b=<id> */
export const extraBoardHref = (id: string) => `/board?b=${id}`;

/** 放入選單的額外項目（v2.0）— 不僅是留言板，也包含圖庫・日記等「建立多個的區段」。
 *  anchor = 此項目要插入在哪個預設選單之後（例如 /diary 後） */
export interface ExtraEntry { id: string; name: string; href: string; anchor: string }

/** 將留言板列表轉換成額外項目形式（預設留言板已存在於選單，因此排除） */
export const boardEntries = (boards?: { id: string; name: string }[]): ExtraEntry[] =>
  (boards ?? []).filter(b => b.id !== 'main')
    .map(b => ({ id: b.id, name: b.name, href: extraBoardHref(b.id), anchor: '/board' }));

/** 選單管理中指定的頁面上方大標題（5.2 v1.9）— 僅精確符合 href，沒有則為 null */
export function pageTitleFor(s: MenuSettings, href: string): string | null {
  for (const g of s.tree ?? []) {
    if (g.href === href) return g.pageTitle?.trim() || null;
    for (const it of g.items) if (it.href === href) return it.pageTitle?.trim() || null;
  }
  return null;
}

/** 功能 href 的預設名稱 — FEATURES + 額外留言板名稱（沒有則為 null = 功能消失） */
export function menuLabelFor(href: string, extra?: ExtraEntry[]): string | null {
  const f = FEATURES.find(x => x.href === href);
  if (f) return f.label;
  const e = extra?.find(x => x.href === href);
  return e ? e.name : null;
}

/**
 * 判斷此網址在選單中的公開範圍（v2.0 使用者發現 — 設為非公開的留言板被 Widget 帶出去了）。
 *
 * 公開範圍直到現在都**只在繪製選單時**使用。因為只是連結不顯示，
 * 主頁 Widget 仍然會直接取出該留言板的文章 — 即使是未登入的訪客也看得到。
 * 現在將判定集中到這裡，讓 Widget 也遵循與選單相同的標準。
 *
 * · 詳細頁面（`/board/123`）遵循列表（`/board`）的範圍。
 * · 邊界以 `/` 與 `?` 分隔 — 否則 `/comm-apply` 會被歸到 `/comm` 底下。
 * · 如果同一網址出現在多處，則由**更具體的網址**優先（`/gallery?s=fan` > `/gallery`）。
 *   如果具體程度相同，則採用較寬鬆的一方 — 表示至少存在一個實際可顯示該連結的路徑。
 */
const VIS_RANK: Record<MenuVis, number> = { all: 0, member: 1, admin: 2 };

/** 取得此網址所對應的選單項目的公開範圍 + 「允許透過網址開啟」 + 會員選擇清單（v2.0） */
function hrefEntry(s: MenuSettings, path: string): { vis: MenuVis; open: boolean; members?: string[] } {
  const covers = (href: string) =>
    path === href || path.startsWith(`${href}/`) || path.startsWith(`${href}?`);
  let bestLen = -1;
  let best: { vis: MenuVis; open: boolean; members?: string[] } = { vis: 'all', open: false };
  const take = (href: string, e: { vis: MenuVis; open: boolean; members?: string[] }) => {
    if (href.length > bestLen) { bestLen = href.length; best = e; }
    else if (href.length === bestLen && VIS_RANK[e.vis] < VIS_RANK[best.vis]) best = e;
  };
  for (const g of s.tree ?? defaultTree()) {
    const gv = g.vis ?? 'all';
    if (g.href && covers(g.href)) take(g.href, { vis: gv, open: !!g.open, members: g.visMembers });
    // 如果上層的範圍更窄，下層會跟著隱藏 — 因為上層看不到，下層也不應該顯示
    for (const it of g.items) {
      if (!covers(it.href)) continue;
      const iv = it.vis ?? 'all';
      const narrower = VIS_RANK[gv] >= VIS_RANK[iv];
      take(it.href, narrower
        ? { vis: gv, open: !!g.open, members: g.visMembers }
        : { vis: iv, open: !!it.open, members: it.visMembers });
    }
  }
  return best;
}

export function hrefVis(s: MenuSettings, path: string): MenuVis {
  return hrefEntry(s, path).vis;
}

/**
 * **是否可以進入**的判定標準（v2.0 使用者要求）—「隱藏但允許透過網址查看」。
 *
 * 公開範圍原本會同時決定「是否顯示在選單中」與「是否可以進入」。
 * 因此無法建立**只想透過連結進入的留言板** — 因為從選單隱藏後，
 * 即使把網址給別人也無法開啟。現在每個項目可以開啟「允許透過網址查看」，
 * 讓它**在選單・Widget 中維持隱藏，但允許進入頁面**。
 */
export function hrefAccess(s: MenuSettings, path: string): MenuVis {
  const e = hrefEntry(s, path);
  return e.open ? 'all' : e.vis;
}

/* 如果在「隱藏未登入者」時選擇了會員（visMembers），則只有這些會員（+管理員）可以看到（v2.0 使用者要求）。
   留空則如同以往，所有已登入會員都可以看到 — 管理員不受此清單限制，一律通過 */
const allows = (v: MenuVis, viewer: MenuViewer, members?: string[]) =>
  v === 'all'
  || (v === 'member' && viewer.loggedIn
    && (!members?.length || viewer.isAdmin || (!!viewer.id && members.includes(viewer.id))))
  || (v === 'admin' && viewer.isAdmin);

/** 圖庫撰寫權限（v2.0 使用者要求）— 依區段設定。未指定時為所有已登入會員，
 * 透過「會員選擇」縮小範圍時，只有該會員（+管理員）可以撰寫。WRITE 按鈕與撰寫頁面共用此判定 */
export function canGalleryWrite(s: MenuSettings, secId: string, viewer: MenuViewer): boolean {
  if (!viewer.loggedIn) return false;
  if (viewer.isAdmin) return true;
  if ((s.galWrite?.[secId] ?? 'member') === 'admin') return false;
  const members = s.galWriteMembers?.[secId];
  return !members?.length || (!!viewer.id && members.includes(viewer.id));
}

/** 此訪客是否**可以看到**（v2.0）— 選單・Widget 使用。
 * 即使「允許透過網址查看」，這裡仍會隱藏 — 因為目的是只能透過連結進入，而不是主動告知 */
export function canViewHref(
  s: MenuSettings, path: string, viewer: MenuViewer,
): boolean {
  const e = hrefEntry(s, path);
  return allows(e.vis, viewer, e.members);
}

/** 此訪客是否**可以進入**（v2.0）— 頁面阻擋・伺服器儲存值使用 */
export function canAccessHref(
  s: MenuSettings, path: string, viewer: MenuViewer,
): boolean {
  const e = hrefEntry(s, path);
  if (e.open) return true;   // 允許透過網址查看 — 知道網址的任何人都可以
  return allows(e.vis, viewer, e.members);
}

/** 選單樹中記錄的此網址名稱（v2.0）— 如果沒有另外設定名稱則為 null */
export function menuLabelOf(s: MenuSettings, href: string): string | null {
  for (const g of s.tree ?? []) {
    if (g.href === href) return g.label?.trim() || null;
    for (const it of g.items) if (it.href === href) return it.label?.trim() || null;
  }
  return null;
}

/** 套用設定後的實際選單樹 — 以自由樹狀結構（v1.9）為基礎。
 *  extraBoards：額外建立的留言板（5.2）— 如果尚未放入樹狀結構，會自動配置到包含 /board 的群組。
 *  viewer：公開範圍篩選（v1.9）— all/member/admin。沒有則全部顯示（管理畫面用） */
export function buildMenu(
  s: MenuSettings,
  extra?: ExtraEntry[],
  viewer?: MenuViewer,
): MenuItem[] {
  const tree = s.tree ?? defaultTree();
  const placed = new Set(tree.flatMap(g => (g.href ? [g.href] : g.items.map(it => it.href))));
  const canSee = (vis?: MenuVis, members?: string[]) =>
    !viewer || allows(vis ?? 'all', viewer, members);

  const menu: MenuItem[] = tree
    .filter(g => canSee(g.vis, g.visMembers))
    .map((g): MenuItem | null => {
      if (g.href) {
        return menuLabelFor(g.href, extra) === null ? null : { label: g.label, href: g.href };
      }
      const children = g.items
        .filter(it => canSee(it.vis, it.visMembers))
        .map(it => {
          const def = menuLabelFor(it.href, extra);
          return def === null ? null : { href: it.href, label: it.label ?? def };
        })
        .filter((c): c is { href: string; label: string } => !!c);
      return { label: g.label, children };
    })
    .filter((m): m is MenuItem => !!m);

  /* 新建立的區段・留言板**不會自動配置**（v2.0 使用者確認）。
     以前會自動插入原本的選單後方，但這樣會在選單管理的「未配置」中
     出現一次，下一次進入時卻消失，不知道跑到哪裡。
     現在建立後會留在未配置區，必須手動放入想要的上層選單後才會顯示。 */

  // 沒有任何下層項目的群組會整個隱藏
  return menu.filter(m => !m.children || m.children.length > 0);
}