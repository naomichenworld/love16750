'use client';
/**
 * 將列表型區段增加為多個（v2.0 使用者要求）。
 *
 * 直接將留言板原本的方式一般化 — **列表放在設定中，項目放在原本的資料表中**。
 * 即使建立 3 個圖庫，圖片仍然全部放在 `gallery` 資料表中，每個項目只透過 `secId`
 * 記錄自己屬於哪個區段。因此**不需要修改 DB 結構**（使用分支版本的人也不需要
 * 重新執行 SQL — 經歷過 Schema 快取問題後，這一點很重要）。
 *
 * 個別分開儲存的只有**名稱**，分類標籤・心情等詳細設定則共用（使用者已確認）。
 * 這樣設定畫面就不需要再出現「要編輯哪一個」的選擇列，可以維持現在的簡潔。
 * **例外是分類／類別** — 感想串與行事曆處理的內容不同，因此分類也要分開設定
 * （使用者要求）。如果沒有另外設定，就直接使用預設分類。
 *
 * 即使刪除區段，**項目資料也會保留**（第 3 章原則）— 只會從選單中消失。
 */
import { useCallback, useEffect, useReducer } from 'react';
import { useSearchParams } from 'next/navigation';
import { getRawSetting, setSetting } from './settingStore';
import { newId } from './postStore';

export type SectionKind =
  | 'gallery' | 'roadview' | 'trpg' | 'dotori' | 'playlog' | 'comm' | 'diary' | 'threads' | 'sched' | 'chars';

/** 各區段種類的預設資訊 — 設定分頁名稱與頁面網址 */
export const SECTION_META: Record<SectionKind, { label: string; href: string; defName: string }> = {
  gallery:  { label: '圖庫',    href: '/gallery',   defName: '圖庫' },
  roadview: { label: '載入紀錄',    href: '/loadb', defName: '載入紀錄' },
  trpg:     { label: '日誌備份', href: '/trpg',     defName: '日誌備份' },
  dotori:   { label: '橡果',    href: '/dotori',   defName: '橡果' },
  playlog:  { label: '遊玩紀錄', href: '/playlog', defName: '遊玩紀錄' },
  comm:     { label: '委託',    href: '/comm',     defName: '委託' },
  diary:    { label: '日記',  href: '/diary',    defName: '日記' },
  threads:  { label: '感想串',  href: '/threads',  defName: '感想串' },
  sched:    { label: '行事曆',  href: '/cal',      defName: '行事曆' },
  chars:    { label: '角色',    href: '/chars',    defName: '角色' },
};

export const SECTION_KINDS = Object.keys(SECTION_META) as SectionKind[];

/** 預設區段 id — 這個 id 不建立也不刪除（原本存在的那個頁面） */
export const MAIN_SEC = 'main';

export interface SectionItem {
  id: string;
  name: string;
  /** 網址使用的別名（v2.0 使用者要求）— 沒有的話就直接使用 id，網址會變成 `?s=mt9ipt` 這樣，不太好看。
   *  **所屬標示（secId）永遠儲存 id** — 即使更改別名，文章也不會失去所屬區段。 */
  slug?: string;
}

/** 只保留可以用於網址／別名的格式 — 英文字母小寫・數字・連字號・底線 */
export const cleanSlug = (v: string) =>
  v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);

type SectionMap = Partial<Record<SectionKind, SectionItem[]>>;

const KEY = 'ohome.sections.v1';
const EVT = 'ohome-sections';

/** 已儲存的列表 + 永遠位於最前面的預設區段 */
export function sectionsOf(map: SectionMap, kind: SectionKind): SectionItem[] {
  const base: SectionItem = { id: MAIN_SEC, name: SECTION_META[kind].defName };
  const extra = (map[kind] ?? []).filter(s => s.id !== MAIN_SEC);
  // 如果已經修改過預設區段的名稱，就使用修改後的名稱
  const named = (map[kind] ?? []).find(s => s.id === MAIN_SEC);
  return [named ? { ...base, ...named } : base, ...extra];
}

/** 網址使用的值 — 如果設定了別名就使用別名，否則使用 id（v2.0） */
export function secKeyOf(kind: SectionKind, id: string): string {
  load();
  const s = (cache[kind] ?? []).find(x => x.id === id);
  return s?.slug?.trim() || id;
}

/** 此區段的網址 — 預設區段維持原本網址，其餘使用 ?s=別名（沒有則使用 id） */
export const sectionHref = (kind: SectionKind, id: string) =>
  (id === MAIN_SEC ? SECTION_META[kind].href : `${SECTION_META[kind].href}?s=${secKeyOf(kind, id)}`);

/** 判斷項目是否屬於此區段 — 舊資料（沒有 secId）全部視為預設區段 */
export const inSection = (secId: string | undefined, cur: string) =>
  (cur === MAIN_SEC ? !secId || secId === MAIN_SEC : secId === cur);

/* ---------- 儲存 ---------- */
let cache: SectionMap = {};
let loaded = false;

function load() {
  if (loaded) return;
  try {
    const raw = getRawSetting(KEY);
    if (raw) cache = JSON.parse(raw) as SectionMap;
  } catch { /* 使用預設值 */ }
  loaded = true;
}

function notify() { try { window.dispatchEvent(new Event(EVT)); } catch { /* 忽略 */ } }

/** 區段列表 — 設定畫面・選單共用 */
export function useSections(): {
  map: SectionMap;
  list: (kind: SectionKind) => SectionItem[];
  setList: (kind: SectionKind, next: SectionItem[]) => void;
  add: (kind: SectionKind) => void;
  loaded: boolean;
} {
  const [, force] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const h = () => force();
    window.addEventListener(EVT, h);
    window.addEventListener('ohome-setting', h);
    return () => { window.removeEventListener(EVT, h); window.removeEventListener('ohome-setting', h); };
  }, []);
  load();

  const setList = useCallback((kind: SectionKind, next: SectionItem[]) => {
    cache = { ...cache, [kind]: next };
    try { setSetting(KEY, cache); } catch { /* 忽略 */ }
    notify();
  }, []);

  const add = useCallback((kind: SectionKind) => {
    const cur = sectionsOf(cache, kind);
    const next = [...(cache[kind] ?? []), { id: newId(), name: `新${SECTION_META[kind].label} ${cur.length}` }];
    cache = { ...cache, [kind]: next };
    try { setSetting(KEY, cache); } catch { /* 忽略 */ }
    notify();
  }, []);

  return {
    map: cache,
    list: (kind: SectionKind) => sectionsOf(cache, kind),
    setList,
    add,
    loaded,
  };
}

/**
 * 目前正在查看的區段（v2.0）— 讀取網址中的 `?s=`。沒有則使用預設區段。
 *
 * 如果進入已刪除區段的網址，就回到預設區段 — 不顯示空白頁面，而是顯示原本的頁面。
 * `useSearchParams` 需要 Suspense 邊界，因此使用它的頁面需要包起來（與自設關係修改頁相同）。
 */
export function useSectionParam(kind: SectionKind): { id: string; name: string; items: SectionItem[] } {
  const sp = useSearchParams();
  const { list } = useSections();
  const items = list(kind);
  const want = sp.get('s') ?? MAIN_SEC;
  // 也可以透過別名找到（v2.0）— 以前分享出去的 id 網址也必須仍然可以開啟
  const found = items.find(s => s.id === want || (s.slug ?? '') === want) ?? items[0];
  return { id: found.id, name: found.name, items };
}

/** 詳細／建立頁面的標題文字 + 點擊標題後返回的網址（v2.0 使用者回報 —
 *  進入額外區段的詳細頁後，原本會顯示 CHARACTERS 等原始頁面標題，點擊後也無法回到列表）。
 *  如果是額外區段，就使用該區段名稱；如果是預設區段，就使用 def（頁面原本的標題）。
 *  如果同時透過 href 傳給 PageTitle，選單管理中設定的標題・名稱會優先於此處。 */
export function useSectionTitle(
  kind: SectionKind, secId: string | undefined, def: string,
): { title: string; href: string } {
  const { list } = useSections();
  const id = secId ?? MAIN_SEC;
  const name = id === MAIN_SEC ? null : list(kind).find(s => s.id === id)?.name;
  return { title: name || def, href: sectionHref(kind, id) };
}

/** 列表中只保留此區段的項目（v2.0）— 舊資料全部視為預設區段 */
export function filterSection<T extends { secId?: string }>(rows: T[], cur: string): T[] {
  return rows.filter(r => inSection(r.secId, cur));
}

/**
 * 只替換此區段的儲存函式（v2.0）— **不刪除其他區段內容的核心**。
 *
 * 畫面只會顯示篩選後的列表，因此如果像 `setItems(items.filter(...))` 這樣使用，
 * **原本看不到的其他區段內容會整批消失**。因此將儲存函式改成這個之後，即使完全不修改原本的程式碼，
 * 也可以做到「只替換這個區段的位置 + 其他內容保持不變」。新加入的項目會標記上所屬區段。
 */
export function sectionSetter<T extends { secId?: string }>(
  all: T[], cur: string, setAll: (next: T[]) => void,
): (next: T[]) => void {
  return (next: T[]) => {
    const others = all.filter(r => !inSection(r.secId, cur));
    // 預設區段不留下標記 — 與舊資料相同的形式，也方便還原
    const mine = cur === MAIN_SEC ? next : next.map(r => (r.secId === cur ? r : { ...r, secId: cur }));
    setAll([...mine, ...others]);
  };
}

/** 傳送到新建立頁面時附帶目前區段 — 預設區段不附加任何內容。
 *  **如果設定了別名（slug），就使用別名**（v2.0 使用者回報）— 選單網址使用的是別名，
 *  如果這裡建立的網址卻使用 id，就會造成同一頁面出現不同網址字串，導致選單標題・名稱的尋找全部失效。 */
export const secQuery = (kind: SectionKind, id: string) =>
  (id === MAIN_SEC ? '' : `?s=${secKeyOf(kind, id)}`);

/** 將網址的 ?s= 值統一成該區段的代表寫法（優先使用別名）（v2.0 使用者回報）。
 *  即使透過舊分享網址・舊版本產生的 id 網址進入，也能正確取得選單標題・名稱 —
 *  如果 pathname 不是區段列表頁，就原樣返回收到的值。 */
export function canonSecKey(pathname: string, key: string): string {
  const kind = SECTION_KINDS.find(k => SECTION_META[k].href === pathname);
  if (!kind) return key;
  load();
  const hit = (cache[kind] ?? []).find(s => s.id === key || (s.slug ?? '') === key);
  return hit ? (hit.slug?.trim() || hit.id) : key;
}

/** 新項目要標記的所屬區段 — 預設區段不留下標記（與舊資料相同的形式） */
export const secStamp = (id: string): { secId?: string } => (id === MAIN_SEC ? {} : { secId: id });

/** 放到選單上的額外項目 — 預設區段已有原本的選單，因此排除 */
export function sectionMenuEntries(map: SectionMap): { id: string; name: string; href: string; anchor: string }[] {
  const out: { id: string; name: string; href: string; anchor: string }[] = [];
  for (const kind of SECTION_KINDS) {
    for (const s of sectionsOf(map, kind)) {
      if (s.id === MAIN_SEC) continue;
      out.push({ id: s.id, name: s.name, href: sectionHref(kind, s.id), anchor: SECTION_META[kind].href });
    }
  }
  return out;
}
