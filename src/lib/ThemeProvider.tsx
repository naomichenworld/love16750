'use client';
// 主題 Context（5.1、v1.9 修訂）— 各模式獨立設定值 + 草稿／儲存分離 + 預設樣式
// · 模式切換只會載入各模式的修改版本，不會重設
// · 主色自動模式只有在「基準色／色調變更時」才會重新衍生整套配色
// · 修改會立即套用至預覽（DOM），但只有按下 [SAVE] 才會正式儲存 — 重新整理後會恢復為已儲存版本
// TODO（第 0 階段→）：連接 Supabase 時，將儲存位置移至 site_settings 資料表
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import {
  ThemeMode, PointTone, ThemeVars, ThemeState, ThemeStore, ThemePreset,
  DARK_THEME, DEFAULT_THEME_STORE, defaultVarsFor, derivePointTheme, themeToCssVars,
} from './theme';
import { newId } from './postStore';
import { getBlob } from './blobStore';
import { getRawSetting, setSetting } from './settingStore';

/** 頁面背景漸層（依自設關係指定，v2.0）— 2 個顏色 + 角度 */
export interface PageBg { g1: string; g2: string; angle: number }

interface ThemeCtx {
  /** 頁面臨時主題（自設關係・委託頁面的主題色）— 離開後恢復為 null，不會儲存 */
  setPageTheme: (color: string | null, tone?: PointTone) => void;
  /** 頁面背景另外設定（v2.0 使用者要求 — 依自設關係設定背景漸層）。
   *  與主題色（setPageTheme）會改變整套調色盤不同，這裡只覆蓋背景的 2 個顏色與角度。 */
  setPageBg: (bg: PageBg | null) => void;
  /** 目前（草稿）狀態 — 與既有使用者相容的格式 {mode, pointTone, vars} */
  state: ThemeState;
  dirty: boolean;                              // 存在尚未儲存的修改
  setMode: (m: ThemeMode) => void;             // 模式切換 — 載入該模式的修改版本（不是重設）
  setPointAccent: (hex: string) => void;       // 主色自動：只有變更時才重新衍生
  setPointTone: (t: PointTone) => void;
  setVar: <K extends keyof ThemeVars>(key: K, value: ThemeVars[K]) => void; // 套用至目前模式的修改版本
  resetMode: (m: ThemeMode) => void;           // 選擇性重設 — 只將該模式重設為初始值
  save: () => void;                            // 草稿 → 實際儲存（localStorage + FOUC 映射）
  discard: () => void;                         // 捨棄草稿 → 恢復為已儲存版本
  presets: ThemePreset[];
  savePreset: (name: string) => void;          // 將目前模式的草稿值儲存為預設樣式（立即儲存）
  applyPreset: (id: string) => void;           // 預設樣式 → 套用至自訂模式（草稿）
  removePreset: (id: string) => void;
}

const Ctx = createContext<ThemeCtx | null>(null);
const STORAGE_KEY = 'ohome.theme.v2';
const LEGACY_KEY = 'ohome.theme.v1';
/** 在第一次繪製前套用的 CSS 變數映射（layout.tsx 的內嵌腳本會讀取 — 防止 FOUC） */
const CSS_KEY = 'ohome.themeCss.v1';
const PRESET_KEY = 'ohome.themePresets.v1';

const normalize = (s: Partial<ThemeStore> | null | undefined): ThemeStore => ({
  ...DEFAULT_THEME_STORE,
  ...(s ?? {}),
  perMode: {
    light: { ...DEFAULT_THEME_STORE.perMode.light, ...(s?.perMode?.light ?? {}) },
    dark: { ...DEFAULT_THEME_STORE.perMode.dark, ...(s?.perMode?.dark ?? {}) },
    point: { ...DEFAULT_THEME_STORE.perMode.point, ...(s?.perMode?.point ?? {}) },
    custom: { ...DEFAULT_THEME_STORE.perMode.custom, ...(s?.perMode?.custom ?? {}) },
  },
});

function applyToDom(vars: ThemeVars) {
  const css = themeToCssVars(vars);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(css)) root.style.setProperty(k, v);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [saved, setSaved] = useState<ThemeStore>(DEFAULT_THEME_STORE);
  const [draft, setDraft] = useState<ThemeStore>(DEFAULT_THEME_STORE);
  const [presets, setPresets] = useState<ThemePreset[]>([]);
  const [pageColor, setPageColor] = useState<{ color: string; tone?: PointTone } | null>(null);
  const [pageBg, setPageBgState] = useState<PageBg | null>(null);   // 依自設關係設定的背景（v2.0）
  const [loaded, setLoaded] = useState(false);   // 載入已儲存版本前，不要將預設深色寫入 DOM（防止 FOUC）

  // 初次載入 — 優先使用 v2，沒有時則從 v1 遷移（將原本的 vars 繼承為該模式的修改版本）
  useEffect(() => {
    try {
      const raw = getRawSetting(STORAGE_KEY);
      if (raw) {
        const st = normalize(JSON.parse(raw));
        setSaved(st); setDraft(st);
        try { setSetting(CSS_KEY, themeToCssVars(st.perMode[st.mode])); } catch { /* 忽略 */ }
      } else {
        const legacy = getRawSetting(LEGACY_KEY);
        if (legacy) {
          const old = JSON.parse(legacy) as { mode?: ThemeMode; pointTone?: PointTone; vars?: ThemeVars };
          const mode = old.mode ?? 'dark';
          const vars = { ...DARK_THEME, ...(old.vars ?? {}) };
          const st = normalize({
            mode, pointTone: old.pointTone ?? 'dark', pointAccent: vars.accent,
            perMode: { ...DEFAULT_THEME_STORE.perMode, [mode]: vars },
          });
          setSaved(st); setDraft(st);
          try {
            setSetting(STORAGE_KEY, st);
            setSetting(CSS_KEY, themeToCssVars(st.perMode[st.mode]));
          } catch { /* 忽略 */ }
        }
      }
      const pr = getRawSetting(PRESET_KEY);
      if (pr) setPresets(JSON.parse(pr));
    } catch { /* 忽略並使用預設主題 */ }
    setLoaded(true);
  }, []);

  // 草稿變更時立即反映到 DOM（預覽）— 只有 save() 才會儲存。
  // 載入完成前不處理 — 避免用第一次繪製時的內嵌 FOUC 映射覆蓋預設深色而產生閃爍（v1.9）
  useEffect(() => {
    if (!loaded) return;
    /* 角色・自設關係主題色只是改變顏色 — 如果整套衍生調色盤重新建立 ThemeVars，
       **連顯示選項也會被重設為預設值**，因此從網站設定繼承。
       （v2.0 使用者回報 —
       「關閉標頭說明後，只有在自訂主題角色詳細頁中又重新顯示」） */
    const site = draft.perMode[draft.mode];
    applyToDom(pageColor
      ? {
        ...derivePointTheme(pageColor.color, pageColor.tone ?? draft.pointTone),
        pageHead: site.pageHead, pageHeadM: site.pageHeadM,
      }
      : site);
    // 頁面背景指定（v2.0）— 套用調色盤後，只覆蓋背景的三個值。
    // 因為這個 effect 會重新套用調色盤，所以按照順序必須在這裡覆蓋才能保留。
    const root = document.documentElement;
    if (pageBg) {
      root.style.setProperty('--bg-g1', pageBg.g1);
      root.style.setProperty('--bg-g2', pageBg.g2);
      root.style.setProperty('--bg-angle', `${pageBg.angle}deg`);
      root.style.setProperty('--bg-image', 'none');   // 避免被網站背景圖片覆蓋
    }
  }, [draft, pageColor, pageBg, loaded]);

  // 背景圖片（v1.9）— 將 IndexedDB 檔案轉為 blob URL 後套用至 --bg-image（漸層模式則解除）
  useEffect(() => {
    if (!loaded) return;
    const vars = draft.perMode[draft.mode];
    const root = document.documentElement;
    if (vars.bgType === 'image' && vars.bgImageId && !pageColor && !pageBg) {
      const ref = vars.bgImageId;
      /* **如果是網址就直接使用**（v2.0 使用者發現 —
         「背景放了照片卻沒有變化」）。
         在伺服器模式中，上傳的圖片會以儲存空間的公開網址儲存，但這裡卻只會透過
         `getBlob` **重新下載**並轉換成 blob 網址。該 fetch 如果受到儲存空間的
         CORS 設定限制，就會靜默失敗 — 畫面上不會顯示任何錯誤，只有背景沒有變化。
         其他圖片都直接使用網址，因此（useBlobUrl）可以正常顯示。只有這裡是例外。 */
      if (/^(https?:|data:|blob:)/.test(ref)) {
        root.style.setProperty('--bg-image', `url("${ref}")`);
        return () => { root.style.removeProperty('--bg-image'); };
      }
      // 瀏覽器儲存（IndexedDB）的檔案 id — 只有這種情況才解析並建立 blob 網址
      let cancelled = false;
      let url: string | null = null;
      getBlob(ref).then(b => {
        if (cancelled || !b) return;
        url = URL.createObjectURL(b);
        root.style.setProperty('--bg-image', `url("${url}")`);
      });
      return () => {
        cancelled = true;
        root.style.removeProperty('--bg-image');
        if (url) URL.revokeObjectURL(url);
      };
    }
    root.style.removeProperty('--bg-image');
  }, [draft, pageColor, pageBg, loaded]);

  const dirty = useMemo(() => JSON.stringify(saved) !== JSON.stringify(draft), [saved, draft]);

  const setMode = useCallback((mode: ThemeMode) =>
    setDraft(d => ({ ...d, mode })), []);

  const setPointAccent = useCallback((hex: string) =>
    setDraft(d => ({
      ...d, mode: 'point', pointAccent: hex,
      perMode: { ...d.perMode, point: derivePointTheme(hex, d.pointTone) },
    })), []);

  const setPointTone = useCallback((tone: PointTone) =>
    setDraft(d => ({
      ...d, mode: 'point', pointTone: tone,
      perMode: { ...d.perMode, point: derivePointTheme(d.pointAccent, tone) },
    })), []);

  // 細項修改（v1.9 確定）— 在預設樣式模式（淺色／深色／主色自動）中只要修改任何一項，
  // 就會將目前畫面上顯示的所有值複製到自訂模式，並切換至自訂模式。自訂模式則直接套用修改。
  // 儲存由 SAVE 執行 — 自訂值與 mode='custom' 會一起儲存。
  const setVar = useCallback(<K extends keyof ThemeVars>(key: K, value: ThemeVars[K]) =>
    setDraft(d => (d.mode === 'custom'
      ? { ...d, perMode: { ...d.perMode, custom: { ...d.perMode.custom, [key]: value } } }
      : {
        ...d, mode: 'custom',
        perMode: { ...d.perMode, custom: { ...d.perMode[d.mode], [key]: value } },
      })), []);

  // 選擇性重設 — 只將指定模式重設為初始值（草稿，儲存則由 SAVE 執行）
  const resetMode = useCallback((m: ThemeMode) =>
    setDraft(d => ({
      ...d,
      perMode: { ...d.perMode, [m]: defaultVarsFor(m, d.pointAccent, d.pointTone) },
    })), []);

  const save = useCallback(() => {
    setDraft(d => {
      setSaved(d);
      try {
        setSetting(STORAGE_KEY, d);
        setSetting(CSS_KEY, themeToCssVars(d.perMode[d.mode])); // 同步 FOUC 映射
      } catch { /* 忽略，例如儲存空間不足 */ }
      return d;
    });
  }, []);

  const discard = useCallback(() => setDraft(saved), [saved]);

  // 預設樣式 — 立即儲存（與草稿無關的獨立儲存區）
  const persistPresets = (list: ThemePreset[]) => {
    setPresets(list);
    try { setSetting(PRESET_KEY, list); } catch { /* 忽略 */ }
  };
  const savePreset = useCallback((name: string) => {
    setDraft(d => {
      persistPresets([...presets, { id: newId(), name, vars: d.perMode[d.mode] }]);
      return d;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presets]);
  const applyPreset = useCallback((id: string) => {
    const p = presets.find(x => x.id === id);
    if (!p) return;
    setDraft(d => ({ ...d, mode: 'custom', perMode: { ...d.perMode, custom: { ...p.vars } } }));
  }, [presets]);
  const removePreset = useCallback((id: string) =>
    persistPresets(presets.filter(p => p.id !== id)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [presets]);

  const setPageTheme = useCallback((color: string | null, tone?: PointTone) =>
    setPageColor(color ? { color, tone } : null), []);
  const setPageBg = useCallback((bg: PageBg | null) => setPageBgState(bg), []);

  // 與既有使用者相容 — state.vars = 目前模式的草稿值
  const state: ThemeState = useMemo(() => ({
    mode: draft.mode, pointTone: draft.pointTone, vars: draft.perMode[draft.mode],
  }), [draft]);

  return (
    <Ctx.Provider value={{
      state, dirty, setMode, setPointAccent, setPointTone, setVar,
      resetMode, save, discard, presets, savePreset, applyPreset, removePreset, setPageTheme, setPageBg,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}