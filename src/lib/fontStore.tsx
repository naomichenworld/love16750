'use client';
// 字體庫（5.1）— 內建（Google Fonts）＋網頁字體 URL 註冊
// 內建字體也可以刪除・修改 — 可以只保留想要的字體。刪除的字體如果被既有資料使用，
// familyOf 仍會從完整字體池中解析，因此不會造成顯示錯誤。
// 可在角色個人資料・自設關係名稱・劇本標題等地方選擇使用（4.4、4.5、4.3）
// TODO（後續）：字體檔案上傳（woff2 等）・儲存英文／韓文字體配對
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { newId } from './postStore';
import { putBlob, getBlob } from './blobStore';
import { getRawSetting, setSetting } from './settingStore';

export interface FontDef {
  id: string;
  name: string;        // 顯示名稱
  family: string;      // CSS font-family 值
  gfont?: string;      // Google Fonts family 查詢字串（內建）
  cssUrl?: string;     // 網頁字體 CSS URL（直接註冊或修改內建字體）
  builtin?: boolean;
  locked?: boolean;    // 網站預設字體 — 不可刪除（因為是 fallback stack，所以沒有 URL）
  fileId?: string;     // 上傳的字體檔案（IndexedDB — woff2/woff/ttf/otf，v1.9）
  fileName?: string;   // 上傳檔案名稱（用於列表顯示）
  pairId?: string;     // 英文字體的中文字體 fallback 配對 — 列表中的其他字體 id（v1.9）
}

/** 「預設」・「預設襯線」的 family 是 var(--sans)/var(--serif)，但這兩個變數是由**角色字體
 *  覆寫的位置**。直接使用的話，「預設襯線」會變成「目前標題指定的字體」
 *  （v2.0 使用者發現 — 「預設襯線一直套用我上傳的字體」）。
 *  展開成原始 stack（--sans-base/--serif-base），解除這個別名連結。 */
export const deVarFamily = (fam: string): string =>
  (fam === 'var(--sans)' ? 'var(--sans-base)' : fam === 'var(--serif)' ? 'var(--serif-base)' : fam);

export const BUILTIN_FONTS: FontDef[] = [
  { id: 'default', name: '預設（Pretendard）', family: 'var(--sans)', builtin: true, locked: true },
  { id: 'serif', name: '預設襯線（Cormorant + Noto Serif KR）', family: 'var(--serif)', builtin: true, locked: true },
  { id: 'notoserif', name: 'Noto Serif KR', family: "'Noto Serif KR', serif", builtin: true },
  { id: 'gowun', name: 'Gowun Batang', family: "'Gowun Batang', serif", gfont: 'Gowun+Batang:wght@400;700', builtin: true },
  { id: 'nanummj', name: 'Nanum Myeongjo', family: "'Nanum Myeongjo', serif", gfont: 'Nanum+Myeongjo:wght@400;700', builtin: true },
  { id: 'songmyung', name: 'Song Myung', family: "'Song Myung', serif", gfont: 'Song+Myung', builtin: true },
  { id: 'dohyeon', name: 'Do Hyeon', family: "'Do Hyeon', sans-serif", gfont: 'Do+Hyeon', builtin: true },
  { id: 'blackhan', name: 'Black Han Sans', family: "'Black Han Sans', sans-serif", gfont: 'Black+Han+Sans', builtin: true },
  // 눈누式 CSS URL 註冊範例（v1.9 使用者要求）— 可直接參考列表中的 URL・family 格式
  { id: 'nanumsqneo', name: 'NanumSquare Neo（눈누式範例）', family: "'NanumSquareNeo', sans-serif",
    cssUrl: 'https://hangeul.pstatic.net/hangeul_static/css/nanum-square-neo.css', builtin: true },
];

/** 實際載入字體的 CSS URL — 內建 Google Fonts 由 gfont 查詢字串產生 */
export function fontCssUrl(f: FontDef): string | undefined {
  if (f.cssUrl) return f.cssUrl;
  if (f.gfont) return `https://fonts.googleapis.com/css2?family=${f.gfont}&display=swap`;
  return undefined;
}

const STORAGE_KEY = 'ohome.fonts.v2';
const LEGACY_KEY = 'ohome.fonts.v1'; // 舊版：只儲存自訂字體陣列

/** 網站角色字體（環境設定 > 設計）— 字體＋粗細＋大小倍率（依字體調整實際視覺大小） */
export type FontRole = 'title' | 'pagetitle' | 'subtitle' | 'logosub' | 'menu' | 'dropdown' | 'body';
/** 下拉選單角色的特殊值 — 直接跟隨選單字體（預設） */
export const FOLLOW_MENU = '_menu';
/** 選單標題角色的特殊值 — 直接跟隨標題字體（預設） */
export const FOLLOW_TITLE = '_title';
export interface RoleSetting {
  id: string;        // 字體 id
  weight?: number;   // 粗細（300/400/700）— 未指定時使用角色預設值
  scale?: number;    // 大小 %（預設 100）
}
// desc 為選填 — 不需要說明的角色可以留空（v2.0 使用者要求：移除選單標題字體說明）
export const ROLE_LABEL: Record<FontRole, { label: string; desc?: string }> = {
  title: { label: '標題字體', desc: 'Banner 標題文字等所有襯線字體位置' },
  pagetitle: { label: '選單標題字體' },
  subtitle: { label: '副標題字體', desc: '標題下方的說明文字' },
  logosub: { label: 'Logo 副標題字體', desc: '頂部列 Logo 下方文字 — TRPG 票券底部文字也會跟隨' },
  menu: { label: '選單字體', desc: '頂部選單' },
  dropdown: { label: '下拉選單字體', desc: '子選單下拉選單 — 預設跟隨選單字體' },
  body: { label: '內文字體', desc: '網站預設字體 — 所有未指定其他字體的文字' },
};
const DEFAULT_ROLES: Record<FontRole, RoleSetting> = {
  title: { id: 'serif' }, pagetitle: { id: FOLLOW_TITLE }, subtitle: { id: 'default' },
  logosub: { id: 'default' },
  menu: { id: 'default' }, dropdown: { id: FOLLOW_MENU }, body: { id: 'default' },
};

interface FontState {
  custom: FontDef[];
  hidden: string[];                              // 已刪除（隱藏）的內建字體 id
  overrides: Record<string, Partial<FontDef>>;   // 內建字體修改值（name/family/cssUrl）
  roles: Record<FontRole, RoleSetting>;          // 角色 → 字體／粗細／大小
}

const EMPTY: FontState = { custom: [], hidden: [], overrides: {}, roles: DEFAULT_ROLES };

/** 儲存值正規化 — 同時支援舊版本（角色=字串 id） */
function normRoles(raw?: Record<string, unknown>): Record<FontRole, RoleSetting> {
  const out = { ...DEFAULT_ROLES };
  if (!raw) return out;
  (Object.keys(DEFAULT_ROLES) as FontRole[]).forEach(r => {
    const v = raw[r];
    if (typeof v === 'string') out[r] = { id: v };
    else if (v && typeof v === 'object') out[r] = { ...DEFAULT_ROLES[r], ...(v as RoleSetting) };
  });
  return out;
}

interface FontCtx {
  fonts: FontDef[];                              // 選擇列表（排除隱藏・套用修改）
  hiddenCount: number;
  roles: Record<FontRole, RoleSetting>;          // 如果有草稿則使用草稿（預覽）
  setRole: (role: FontRole, patch: Partial<RoleSetting>) => void;  // 僅套用到草稿 — 按 SAVE 確認（v1.9）
  rolesDirty: boolean;                           // 角色字體存在尚未儲存的變更
  saveRoles: () => void;                         // 將角色字體草稿 → 實際儲存
  discardRoles: () => void;                      // 捨棄角色字體草稿
  addFont: (name: string, family: string, cssUrl: string, pairId?: string) => boolean;
  addFontFile: (name: string, file: File, pairId?: string) => Promise<boolean>;  // 上傳字體檔案註冊（v1.9）
  setFontPair: (id: string, pairId?: string) => void;                            // 指定／解除中文字體配對（v1.9）
  updateFont: (id: string, patch: { name: string; family: string; cssUrl: string }) => boolean;
  removeFont: (id: string) => void;              // 內建字體則隱藏，自訂字體則刪除
  resetFont: (id: string) => void;               // 重設內建字體修改值（v2.0）
  restoreBuiltins: () => void;                   // 恢復所有隱藏的內建字體
  familyOf: (id?: string) => string | undefined; // 解析被隱藏的字體（保護既有資料）
}

const Ctx = createContext<FontCtx | null>(null);

function ensureLink(id: string, href: string) {
  const ex = document.getElementById(id) as HTMLLinkElement | null;
  if (ex) { if (ex.href !== href) ex.href = href; return; }
  const l = document.createElement('link');
  l.id = id; l.rel = 'stylesheet'; l.href = href;
  document.head.appendChild(l);
}

export function FontProvider({ children }: { children: React.ReactNode }) {
  const [st, setSt] = useState<FontState>(EMPTY);
  // 角色字體草稿（v1.9）— 整合設計分頁的 SAVE：變更僅用於預覽，按 SAVE 後才確認
  const [draftRoles, setDraftRoles] = useState<Record<FontRole, RoleSetting> | null>(null);
  const roles = draftRoles ?? st.roles;

  useEffect(() => {
    try {
      const raw = getRawSetting(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as Partial<FontState>;
        setSt({ ...EMPTY, ...p, roles: normRoles(p.roles as Record<string, unknown> | undefined) });
        return;
      }
      const legacy = getRawSetting(LEGACY_KEY);
      if (legacy) setSt({ ...EMPTY, custom: JSON.parse(legacy) });
    } catch { /* 忽略 */ }
  }, []);

  // 套用修改值的內建字體 + 自訂字體（完整字體池 — 用於 familyOf）
  const pool: FontDef[] = [
    ...BUILTIN_FONTS.map(f => ({ ...f, ...(st.overrides[f.id] ?? {}) })),
    ...st.custom,
  ];
  const fonts = pool.filter(f => !st.hidden.includes(f.id));

  // 載入網頁字體 — 未修改的內建 Google Fonts 一次載入，其餘依 URL 載入
  useEffect(() => {
    const plain = BUILTIN_FONTS.filter(f => f.gfont && !st.overrides[f.id]?.cssUrl);
    const gf = plain.map(f => `family=${f.gfont}`).join('&');
    if (gf) ensureLink('ohome-gfonts', `https://fonts.googleapis.com/css2?${gf}&display=swap`);
    pool.forEach(f => { if (f.cssUrl) ensureLink(`ohome-font-${f.id}`, f.cssUrl); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  // 載入上傳的字體檔案（v1.9）— IndexedDB blob → 註冊 FontFace（每個字體一次）
  const loadedFiles = useRef<Set<string>>(new Set());
  useEffect(() => {
    pool.forEach(f => {
      if (!f.fileId || loadedFiles.current.has(f.id)) return;
      loadedFiles.current.add(f.id);
      /* 伺服器模式的檔案是儲存空間公開 URL — **字體是強制要求 CORS 的資源**，
         如果儲存空間沒有提供允許標頭，直接載入會被靜默拒絕（v2.0 使用者回報 — 「註冊的字體無法套用」、
         整個畫面都維持 fallback 襯線字體的原因）。透過同源中介（/api/font）取得以避開 CORS */
      if (/^https?:/.test(f.fileId)) {
        const face = new FontFace(f.family, `url("/api/font?u=${encodeURIComponent(f.fileId)}")`);
        face.load().then(fc => document.fonts.add(fc)).catch(() => { /* 無法存取 — 使用 fallback 渲染 */ });
        return;
      }
      getBlob(f.fileId).then(b => {
        if (!b) return;
        const face = new FontFace(f.family, `url(${URL.createObjectURL(b)})`);
        face.load().then(fc => document.fonts.add(fc)).catch(() => { /* 檔案損壞 — 使用 fallback 渲染 */ });
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  // 套用角色字體 — 字體族（--sans/--serif/--font-menu/--font-subtitle）＋粗細（--fw-*）＋大小倍率（--fs-*）
  // 原始 stack 保存在 --sans-base/--serif-base
  useEffect(() => {
    // 「預設」類型（family 為 var(--sans)/var(--serif)）會展開成原始 stack，避免循環參照。
    // 如果有配對（pairId），則組合成「英文字體、中文字體配對」stack（v1.9）
    const deVar = deVarFamily;
    /* 如果指定的字體消失，則使用**該角色的預設值**（v2.0 使用者發現 — 「刪除字體後
       預設襯線字體變奇怪了」）。以前一律退回 `var(--sans-base)`，
       導致像標題這種應該使用襯線的位置悄悄變成無襯線字體。內建字體即使刪除也會留在 pool 中
       （只是隱藏），所以不會進入這個情況 — 只有直接註冊後刪除的字體才會發生。 */
    const resolve = (id: string, role?: FontRole): string => {
      if (id === FOLLOW_MENU) return 'var(--font-menu)';   // 下拉選單：跟隨選單字體
      if (id === FOLLOW_TITLE) return 'var(--serif)';      // 選單標題：跟隨標題字體
      const f = pool.find(x => x.id === id);
      if (!f) {
        const back = role ? DEFAULT_ROLES[role].id : 'default';
        // 預設值如果又是「跟隨」或是自己本身，就不再繼續往下找（避免無限遞迴）
        return back === id ? 'var(--sans-base)' : resolve(back);
      }
      const p = f.pairId ? pool.find(x => x.id === f.pairId) : undefined;
      return p ? `${deVar(f.family)}, ${deVar(p.family)}` : deVar(f.family);
    };
    const root = document.documentElement.style;
    root.setProperty('--sans', resolve(roles.body.id, 'body'));
    root.setProperty('--serif', resolve(roles.title.id, 'title'));
    root.setProperty('--font-menu', resolve(roles.menu.id, 'menu'));
    root.setProperty('--font-dropdown', resolve(roles.dropdown.id, 'dropdown'));
    root.setProperty('--font-pagetitle', resolve(roles.pagetitle.id, 'pagetitle'));
    root.setProperty('--font-subtitle', resolve(roles.subtitle.id, 'subtitle'));
    root.setProperty('--font-logosub', resolve(roles.logosub.id, 'logosub'));
    (Object.keys(roles) as FontRole[]).forEach(r => {
      const cfg = roles[r];
      root.setProperty(`--fs-${r}`, String((cfg.scale ?? 100) / 100));
      if (cfg.weight) root.setProperty(`--fw-${r}`, String(cfg.weight));
      else root.removeProperty(`--fw-${r}`); // 使用角色預設粗細
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st, draftRoles]);

  const persist = (next: FontState) => {
    try { setSetting(STORAGE_KEY, next); } catch { /* 忽略 */ }
  };
  const apply = (fn: (s: FontState) => FontState) =>
    setSt(s => { const next = fn(s); persist(next); return next; });

  const addFont = useCallback((name: string, family: string, cssUrl: string, pairId?: string): boolean => {
    if (!name.trim() || !family.trim()) return false;
    apply(s => ({
      ...s,
      custom: [...s.custom, {
        id: newId(), name: name.trim(), family: family.trim(),
        cssUrl: cssUrl.trim() || undefined, pairId: pairId || undefined,
      }],
    }));
    return true;
  }, []);

  // 字體檔案上傳註冊（v1.9）— family 自動產生（upfont-id），如果是英文字體可以指定中文字體配對
  const addFontFile = useCallback(async (name: string, file: File, pairId?: string): Promise<boolean> => {
    if (!name.trim()) return false;
    const fileId = await putBlob(file);
    const id = newId();
    apply(s => ({
      ...s,
      custom: [...s.custom, {
        id, name: name.trim(), family: `upfont-${id}`,
        fileId, fileName: file.name, pairId: pairId || undefined,
      }],
    }));
    return true;
  }, []);

  const setFontPair = useCallback((id: string, pairId?: string) => {
    apply(s => BUILTIN_FONTS.some(f => f.id === id)
      ? { ...s, overrides: { ...s.overrides, [id]: { ...s.overrides[id], pairId } } }
      : { ...s, custom: s.custom.map(f => (f.id === id ? { ...f, pairId } : f)) });
  }, []);

  const updateFont = useCallback((id: string, patch: { name: string; family: string; cssUrl: string }): boolean => {
    if (!patch.name.trim() || !patch.family.trim()) return false;
    const p = { name: patch.name.trim(), family: patch.family.trim(), cssUrl: patch.cssUrl.trim() || undefined };
    apply(s => BUILTIN_FONTS.some(f => f.id === id)
      // 如果整個覆蓋，中文字體配對會悄悄消失 — 疊加在既有值上（v2.0）
      ? { ...s, overrides: { ...s.overrides, [id]: { ...s.overrides[id], ...p } } }
      : { ...s, custom: s.custom.map(f => (f.id === id ? { ...f, ...p } : f)) });
    return true;
  }, []);

  const removeFont = useCallback((id: string) => {
    apply(s => {
      const builtin = BUILTIN_FONTS.some(f => f.id === id);
      const base = builtin
        ? { ...s, hidden: s.hidden.includes(id) ? s.hidden : [...s.hidden, id] }
        : { ...s, custom: s.custom.filter(f => f.id !== id) };
      // 內建字體只是從列表中隱藏，定義仍然保留（保護既有資料），不修改原本指向它的位置
      if (builtin) return base;
      /* 直接註冊的字體會**連同定義一起消失** — 同時清理原本指向它的位置
         （v2.0 使用者發現：「刪除直接註冊的字體後，預設襯線字體壞掉了」）。
         如果它是中文字體配對，被配對的字體會一直保留不存在的配對，而列表中也會留下
         已消失的名稱，無法得知目前套用的是什麼。 */
      const custom = base.custom.map(f => (f.pairId === id ? { ...f, pairId: undefined } : f));
      const overrides = Object.fromEntries(
        Object.entries(base.overrides).map(([k, v]) => [k, v.pairId === id ? { ...v, pairId: undefined } : v]),
      ) as FontState['overrides'];
      // 如果角色正在使用該字體，就改回該角色的預設值（否則指定會指向不存在的字體）
      const roles = Object.fromEntries((Object.keys(base.roles) as FontRole[]).map(r =>
        [r, base.roles[r].id === id ? { ...base.roles[r], id: DEFAULT_ROLES[r].id } : base.roles[r]]),
      ) as Record<FontRole, RoleSetting>;
      return { ...base, custom, overrides, roles };
    });
  }, []);

  /** 將內建字體恢復到初始狀態（v2.0 使用者發現）— 清除修改值。
   *  過去沒有 UI 可以將錯誤的值（錯誤的 family・不存在的配對）恢復原狀。 */
  const resetFont = useCallback((id: string) => {
    apply(s => {
      const { [id]: _drop, ...rest } = s.overrides;
      return { ...s, overrides: rest };
    });
  }, []);

  const restoreBuiltins = useCallback(() => apply(s => ({ ...s, hidden: [] })), []);

  // 角色字體只套用到草稿（v1.9）— 透過設計分頁 SAVE 確認
  const setRole = useCallback((role: FontRole, patch: Partial<RoleSetting>) =>
    setDraftRoles(d => {
      const base = d ?? st.roles;
      return { ...base, [role]: { ...base[role], ...patch } };
    }), [st.roles]);
  const rolesDirty = draftRoles !== null && JSON.stringify(draftRoles) !== JSON.stringify(st.roles);
  const saveRoles = useCallback(() => {
    setDraftRoles(d => {
      if (d) apply(s => ({ ...s, roles: d }));
      return null;
    });
  }, []);
  const discardRoles = useCallback(() => setDraftRoles(null), []);

  // 配對（pairId）套用的字體 stack — 即使選擇英文字體，中文字仍會使用配對字體渲染（v1.9）
  const familyOf = useCallback((id?: string) => {
    const f = pool.find(x => x.id === id);
    if (!f) return undefined;
    const p = f.pairId ? pool.find(x => x.id === f.pairId) : undefined;
    // 展開成原始 stack — 否則「預設襯線」會變成目前標題字體（v2.0）
    return p ? `${deVarFamily(f.family)}, ${deVarFamily(p.family)}` : deVarFamily(f.family);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [st]);

  return (
    <Ctx.Provider value={{
      fonts, hiddenCount: st.hidden.length, roles, setRole, rolesDirty, saveRoles, discardRoles,
      addFont, addFontFile, setFontPair, updateFont, removeFont, resetFont, restoreBuiltins, familyOf,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useFonts(): FontCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useFonts must be used within FontProvider');
  return ctx;
}