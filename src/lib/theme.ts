// 主題系統 — 規劃書 5.1
// 4 種模式：淺色／深色（預設）／主色自動（深色・淺色調）／完全自訂
// 所有顏色都以純 hex 儲存（與環境設定 hex 輸入欄 1:1）— 需要半透明的地方則
// 在 themeToCssVars 中套用固定 alpha 後轉換成 CSS 變數。
import { adjust, hexToHsl, hslToHex, withAlpha } from './color';

export type ThemeMode = 'light' | 'dark' | 'point' | 'custom';
export type PointTone = 'dark' | 'light';

/** 可在環境設定中逐項控制的主題變數（5.1 詳細設定項目） */
export interface ThemeVars {
  // 背景漸層（起始色 → 結束色）
  bgG1: string; bgG2: string;
  // 背景擴充（v1.9）：漸層／圖片選擇・漸層角度・圖片（IndexedDB）與模糊
  bgType?: 'gradient' | 'image';
  bgAngle?: number;          // 漸層角度（deg，預設 180）
  bgImageId?: string;        // 背景圖片檔案 id（IndexedDB）
  bgBlur?: number;           // 背景圖片模糊 px（0 = 無）
  // 卡片（面板・留言板列表・篩選器等）背景／文字（v1.9）— 輔助文字色由文字色自動衍生
  cardBg?: string; cardFg?: string;
  // 上方選單：背景・文字・懸停文字（v1.9 分離）・Logo 文字
  topBg: string; topFg: string; topHv: string; topBrand: string;
  // 下層選單下拉：背景・文字・懸停（覆蓋色）
  ddBg: string; ddFg: string; ddHv: string;
  // 頁面標題／說明
  pageTitle: string; pageDesc: string;
  // 頁面標頭顯示（v1.9）：兩者／僅標題／僅說明／兩者都不顯示
  pageHead?: 'both' | 'title' | 'desc' | 'none';
  // 行動版標頭（v1.9 使用者要求）：與 PC 設定相同／僅在行動版省略
  pageHeadM?: 'same' | 'none';
  // BGM 播放器
  bgmBg: string; bgmFg: string; bgmIc: string; bgmVol: string;
  // 捲軸：顏色・邊框色
  sbThumb: string; sbBd: string;
  // 搜尋框（6.4 共用搜尋）：背景・文字・圖示／Placeholder・邊框
  searchBg?: string; searchFg?: string; searchIc?: string; searchBd?: string;
  // 深色按鈕（btn-dark）— 背景・文字・懸停 3 色。也共用於核取方塊・選擇篩選標籤（v1.9 使用者回饋）
  btnDark?: string; btnDarkFg?: string; btnDarkHv?: string;
  // 便利貼板（v1.9 使用者回饋）— 備忘錄配置板・主畫面小看板背景／邊框
  // （原本固定的 rgba 在淺色模式下看不見的問題）
  memoBoard?: string; memoBoardBd?: string;
  // 角色分頁列表（v1.9 使用者回饋）— 左側圖示分頁：背景・文字・選取背景・選取文字
  tabBg?: string; tabFg?: string; tabOnBg?: string; tabOnFg?: string;
  // 切換分頁（v2.0 使用者要求）— 留言板分類標籤・圖庫查看方式切換等。選取的一側直接沿用深色按鈕色，
  // 這裡設定的是「未選取的一側」的面板背景與文字色
  segBg?: string; segFg?: string;
  // Widget（v2.0 使用者要求）— 疊加在主畫面・側邊的卡片。未指定時沿用卡片顏色。
  // 必須開啟 wgBorder 才會繪製邊框（預設只有陰影，維持目前的樣式）
  wgBg?: string; wgTitle?: string; wgFg?: string;
  wgBorder?: boolean; wgBd?: string;
  // 圖片編輯（裁切）背景（v1.9 使用者回饋）— 指定透明 PNG 位置時顯示的面板
  cropBg?: string;
  // 輸入焦點（v1.9 使用者要求）— input・textarea・下拉選單・編輯器共用
  // focusColor：邊框・光環顏色 / focusRing：光環方式（淡淡的發光・清晰的線條・無） / focusW：光環厚度 px
  focusColor?: string; focusRing?: 'glow' | 'line' | 'none'; focusW?: number;
  // 主色
  accent: string; accentSoft: string;
  // 圓角程度（px）
  radius: number; radiusS: number;
  // 區塊（面板・卡片）陰影強度 % — 0 = 無、100 = 預設、200 = 最大
  shadow: number;
  // 下拉選單（下層選單・個人資料選單）陰影強度 % — 與區塊陰影分開（有時沒有陰影會更好看）
  ddShadow?: number;
  // 陰影顏色（區塊・下拉選單共用，預設黑色）
  shColor?: string;
}

export interface ThemeState {
  mode: ThemeMode;
  pointTone: PointTone;
  vars: ThemeVars;
}

/** 深色模式（預設）— 以原型「俐落單色調」為基準 */
export const DARK_THEME: ThemeVars = {
  bgG1: '#2b3038', bgG2: '#121418',
  bgType: 'gradient', bgAngle: 180, bgBlur: 0,
  cardBg: '#fbfbfc', cardFg: '#1d2025',
  topBg: '#14161b', topFg: '#aab0ba', topHv: '#ffffff', topBrand: '#f2f3f5',
  ddBg: '#1c1f25', ddFg: '#c6cad1', ddHv: '#ffffff',
  pageTitle: '#eceef1', pageDesc: '#9aa0a9',
  bgmBg: '#16181d', bgmFg: '#eef0f3', bgmIc: '#cfd3da', bgmVol: '#e8eaee',
  sbThumb: '#565d68', sbBd: '#1a1d22',
  searchBg: '#232830', searchFg: '#e8eaee', searchIc: '#8b919b', searchBd: '#3a404a',
  btnDark: '#1d2025', btnDarkFg: '#ffffff', btnDarkHv: '#33373e',
  memoBoard: '#2a2f37', memoBoardBd: '#3a404b',
  tabBg: '#3a4049', tabFg: '#aab0ba', tabOnBg: '#fbfbfc', tabOnFg: '#1d2025',
  cropBg: '#2c313a',
  accent: '#a63a45', accentSoft: '#c96a73',
  radius: 14, radiusS: 9, shadow: 100, ddShadow: 100,
};

/** 淺色模式 — 懸停文字色即使在白色背景上也能看見（v1.9） */
export const LIGHT_THEME: ThemeVars = {
  bgG1: '#f2f3f5', bgG2: '#dfe1e6',
  bgType: 'gradient', bgAngle: 180, bgBlur: 0,
  cardBg: '#fbfbfc', cardFg: '#1d2025',
  topBg: '#fbfbfc', topFg: '#5d636d', topHv: '#a63a45', topBrand: '#2b3038',
  ddBg: '#ffffff', ddFg: '#3c434d', ddHv: '#000000',
  pageTitle: '#2b3038', pageDesc: '#7a8089',
  bgmBg: '#ffffff', bgmFg: '#2b3038', bgmIc: '#5d636d', bgmVol: '#3c434d',
  sbThumb: '#b8bcc4', sbBd: '#e2e4e8',
  searchBg: '#ffffff', searchFg: '#2b3038', searchIc: '#8a9099', searchBd: '#d7dae0', // 淺色模式下更清晰
  btnDark: '#5d636d', btnDarkFg: '#ffffff', btnDarkHv: '#6d7480', // 淺色模式使用靜音石板色 — 黑色的對比過強（使用者回饋）
  memoBoard: '#e7e9ee', memoBoardBd: '#d4d7de', // 與白色卡片區分的亮灰色面板（v1.9）
  tabBg: '#e4e6eb', tabFg: '#6a7078', tabOnBg: '#ffffff', tabOnFg: '#1d2025',
  cropBg: '#e2e5ea', // 淺色模式 — 顯示透明圖片的亮色面板（v1.9）
  accent: '#a63a45', accentSoft: '#c96a73',
  radius: 14, radiusS: 9, shadow: 30, ddShadow: 30, // 明亮背景下減弱陰影（使用者確定 30%）
};

/**
 * 主色自動模式（v1.8 確定）— 使用單一主色衍生整體配色。
 * 可以選擇色調（深色／淺色），衍生值會全部填入詳細項目的 hex 欄位（v1.9）。
 */
export function derivePointTheme(accent: string, tone: PointTone): ThemeVars {
  const { h, s } = hexToHsl(accent);
  const c = (sat: number, lig: number) => hslToHex({ h, s: Math.min(1, s * sat), l: lig });
  const accentSoft = adjust(accent, cc => ({ l: Math.min(0.75, cc.l + 0.18), s: cc.s * 0.8 }));

  if (tone === 'dark') {
    return {
      bgG1: c(0.28, 0.2), bgG2: c(0.32, 0.07),
      bgType: 'gradient', bgAngle: 180, bgBlur: 0,
      cardBg: c(0.12, 0.985), cardFg: c(0.4, 0.14),
      topBg: c(0.3, 0.09), topFg: c(0.14, 0.68), topHv: c(0.2, 0.97), topBrand: c(0.12, 0.95),
      ddBg: c(0.28, 0.11), ddFg: c(0.14, 0.78), ddHv: '#ffffff',
      pageTitle: c(0.1, 0.93), pageDesc: c(0.12, 0.62),
      bgmBg: c(0.3, 0.08), bgmFg: c(0.1, 0.94), bgmIc: c(0.12, 0.82), bgmVol: c(0.1, 0.9),
      sbThumb: c(0.22, 0.38), sbBd: c(0.3, 0.1),
      searchBg: c(0.26, 0.14), searchFg: c(0.1, 0.9), searchIc: c(0.12, 0.6), searchBd: c(0.22, 0.24),
      btnDark: c(0.38, 0.12), btnDarkFg: c(0.08, 0.97), btnDarkHv: c(0.38, 0.19), /* 飽和度稍微↑ 亮度非常輕微↓ — 增加色彩感（v1.9 使用者回饋） */
      memoBoard: c(0.26, 0.17), memoBoardBd: c(0.22, 0.27),
      tabBg: c(0.26, 0.22), tabFg: c(0.14, 0.68), tabOnBg: c(0.12, 0.985), tabOnFg: c(0.4, 0.14),
      cropBg: c(0.24, 0.19),
      accent, accentSoft,
      radius: 14, radiusS: 9, shadow: 100, ddShadow: 100,
    };
  }
  // 淺色調 — 懸停文字色使用較深的主色衍生，避免白色背景上的白色文字（v1.9）
  const deepAccent = adjust(accent, cc => ({ l: Math.min(cc.l, 0.38) }));
  return {
    bgG1: c(0.25, 0.95), bgG2: c(0.3, 0.86),
    bgType: 'gradient', bgAngle: 180, bgBlur: 0,
    cardBg: c(0.15, 0.99), cardFg: c(0.4, 0.14),
    topBg: c(0.35, 0.97), topFg: c(0.3, 0.38), topHv: deepAccent, topBrand: c(0.45, 0.22),
    ddBg: c(0.3, 0.98), ddFg: c(0.3, 0.3), ddHv: '#000000',
    pageTitle: c(0.45, 0.22), pageDesc: c(0.2, 0.5),
    bgmBg: c(0.3, 0.98), bgmFg: c(0.4, 0.24), bgmIc: c(0.3, 0.4), bgmVol: c(0.4, 0.3),
    sbThumb: c(0.2, 0.72), sbBd: c(0.25, 0.88),
    searchBg: c(0.3, 0.99), searchFg: c(0.4, 0.24), searchIc: c(0.2, 0.55), searchBd: c(0.25, 0.84),
    btnDark: c(0.33, 0.4), btnDarkFg: c(0.1, 0.99), btnDarkHv: c(0.33, 0.46), // 淺色調 — 靜音按鈕（降低對比・飽和度稍微↑ 亮度稍微↓，v1.9）
    memoBoard: c(0.2, 0.9), memoBoardBd: c(0.22, 0.8),
    tabBg: c(0.22, 0.88), tabFg: c(0.3, 0.42), tabOnBg: c(0.15, 0.99), tabOnFg: c(0.4, 0.14),
    cropBg: c(0.2, 0.89),
    accent, accentSoft,
    radius: 14, radiusS: 9, shadow: 30, ddShadow: 30, // 淺色調也讓陰影較弱（30%）
  };
}

export function themeForMode(mode: ThemeMode, accent: string, tone: PointTone, custom: ThemeVars): ThemeVars {
  switch (mode) {
    case 'light': return LIGHT_THEME;
    case 'dark': return DARK_THEME;
    case 'point': return derivePointTheme(accent, tone);
    case 'custom': return custom;
  }
}

/* ---------- 各模式獨立設定儲存區（v1.9 — 切換模式時不會重設修改值） ---------- */
export interface ThemeStore {
  mode: ThemeMode;
  pointTone: PointTone;
  pointAccent: string;                     // 主色自動模式的基準色（只有變更時才重新衍生）
  perMode: Record<ThemeMode, ThemeVars>;   // 各模式的修改版本 — 即使切換分頁也會保留
}

/** 各模式的初始值（選擇重設時使用） */
export function defaultVarsFor(mode: ThemeMode, accent: string, tone: PointTone): ThemeVars {
  switch (mode) {
    case 'light': return LIGHT_THEME;
    case 'dark': return DARK_THEME;
    case 'point': return derivePointTheme(accent, tone);
    case 'custom': return DARK_THEME; // 自訂初始狀態 = 預設（深色）
  }
}

export const DEFAULT_THEME_STORE: ThemeStore = {
  mode: 'dark', pointTone: 'dark', pointAccent: '#a63a45',
  perMode: {
    light: LIGHT_THEME,
    dark: DARK_THEME,
    point: derivePointTheme('#a63a45', 'dark'),
    custom: DARK_THEME,
  },
};

/** 儲存的主題預設樣式（v1.9 — 從下拉選單套用至自訂模式） */
export interface ThemePreset { id: string; name: string; vars: ThemeVars }

/** ThemeVars → CSS 變數對應（與 globals.css 中的 var() 名稱 1:1） */
export function themeToCssVars(t: ThemeVars): Record<string, string> {
  // 區塊陰影 — 根據強度 % 調整 alpha（0 = 無）・顏色為 shColor（預設黑色）
  const hex = (t.shColor ?? '#000000').replace('#', '');
  const hf = hex.length === 3 ? hex.split('').map(ch => ch + ch).join('') : hex;
  const rgb = `${parseInt(hf.slice(0, 2), 16) || 0},${parseInt(hf.slice(2, 4), 16) || 0},${parseInt(hf.slice(4, 6), 16) || 0}`;
  const k = Math.max(0, Math.min(200, t.shadow ?? 100)) / 100;
  const sh = (y: number, blur: number, alpha: number) =>
    k === 0 ? 'none' : `0 ${y}px ${blur}px rgba(${rgb},${Math.min(1, alpha * k).toFixed(3)})`;
  // 下拉選單陰影 — 獨立強度（預設 100%）
  const kd = Math.max(0, Math.min(200, t.ddShadow ?? 100)) / 100;
  // 卡片文字 — 輔助（sub）・淡色（faint）顏色會從指定的文字色亮度自動衍生（v1.9）
  const cardFg = t.cardFg ?? '#1d2025';
  const fgDark = hexToHsl(cardFg).l < 0.5;
  const cardSub = adjust(cardFg, cc => ({ l: fgDark ? Math.min(0.85, cc.l + 0.25) : Math.max(0.15, cc.l - 0.22) }));
  const cardFaint = adjust(cardFg, cc => ({ l: fgDark ? Math.min(0.92, cc.l + 0.45) : Math.max(0.3, cc.l - 0.38), s: cc.s * 0.6 }));
  // 輸入焦點（v1.9）— 未指定時以主色為基礎的 3px 發光
  const focusC = t.focusColor ?? t.accent;
  const focusRing = t.focusRing ?? 'glow';
  const focusW = Math.max(0, Math.min(6, t.focusW ?? 3));
  return {
    '--bg-angle': `${t.bgAngle ?? 180}deg`,
    '--bg-blur': `${Math.max(0, t.bgBlur ?? 0)}px`,
    '--panel-solid': t.cardBg ?? '#fbfbfc',
    '--panel': withAlpha(t.cardBg ?? '#fcfcfd', 0.94),
    '--ink': cardFg, '--sub': cardSub, '--faint': cardFaint,
    '--sh-sm': sh(8, 26, 0.22),   // 小卡片
    '--sh-md': sh(10, 40, 0.25),  // 面板・橫幅
    '--sh-lg': sh(24, 70, 0.5),   // Modal
    '--sh-dd': kd === 0 ? 'none' : `0 14px 40px rgba(${rgb},${Math.min(1, 0.5 * kd).toFixed(3)})`,
    '--bg-g1': t.bgG1, '--bg-g2': t.bgG2,
    '--top-bg': withAlpha(t.topBg, 0.84), '--top-fg': t.topFg, '--top-hv': t.topHv, '--top-brand': t.topBrand,
    '--dd-bg': withAlpha(t.ddBg, 0.97), '--dd-fg': t.ddFg, '--dd-hv': withAlpha(t.ddHv, 0.09),
    '--page-title': t.pageTitle, '--page-desc': t.pageDesc,
    // 頁面標頭顯示選項（v1.9）— 行動版省略由 CSS media query 讀取 --ph-m 後處理
    '--ph-title': (t.pageHead ?? 'both') === 'both' || t.pageHead === 'title' ? 'block' : 'none',
    '--ph-desc': (t.pageHead ?? 'both') === 'both' || t.pageHead === 'desc' ? 'block' : 'none',
    '--ph-title-m': (t.pageHeadM ?? 'same') === 'none' ? 'none'
      : ((t.pageHead ?? 'both') === 'both' || t.pageHead === 'title' ? 'block' : 'none'),
    '--ph-desc-m': (t.pageHeadM ?? 'same') === 'none' ? 'none'
      : ((t.pageHead ?? 'both') === 'both' || t.pageHead === 'desc' ? 'block' : 'none'),
    '--bgm-bg': withAlpha(t.bgmBg, 0.9), '--bgm-fg': t.bgmFg, '--bgm-ic': t.bgmIc, '--bgm-vol': t.bgmVol,
    '--sb-thumb': t.sbThumb, '--sb-bd': t.sbBd,
    '--search-bg': t.searchBg ?? '#232830', '--search-fg': t.searchFg ?? '#e8eaee',
    '--search-ic': t.searchIc ?? '#8b919b', '--search-bd': t.searchBd ?? '#3a404a',
    '--accent': t.accent, '--accent-soft': t.accentSoft,
    // 深色按鈕 3 色 — 未指定懸停色時，會從背景自動衍生稍微變亮的顏色
    '--btn-dark': t.btnDark ?? '#1d2025',
    '--btn-dark-fg': t.btnDarkFg ?? '#ffffff',
    '--btn-dark-hv': t.btnDarkHv ?? adjust(t.btnDark ?? '#1d2025', cc => ({ l: Math.min(1, cc.l + 0.07) })),
    // 便利貼板（v1.9）
    '--memo-board': t.memoBoard ?? '#2a2f37',
    '--memo-board-bd': t.memoBoardBd ?? '#3a404b',
    // 圖片編輯（裁切）背景（v1.9）
    '--crop-bg': t.cropBg ?? '#2c313a',
    // 輸入焦點（v1.9）— 邊框色 + 光環（發光：半透明暈開／線條：清晰邊框／無）
    '--focus-bd': focusC,
    '--focus-ring': focusRing === 'none' || focusW === 0
      ? 'none'
      : focusRing === 'line'
        ? `0 0 0 ${focusW}px ${focusC}`
        : `0 0 0 ${focusW}px ${withAlpha(focusC, 0.16)}`,
    // 角色分頁列表（v1.9）— 背景・文字・選取背景・選取文字
    '--tab-bg': t.tabBg ?? '#3a4049',
    '--tab-fg': t.tabFg ?? '#aab0ba',
    '--tab-on-bg': t.tabOnBg ?? '#fbfbfc',
    '--tab-on-fg': t.tabOnFg ?? '#1d2025',
    // 切換分頁 — 未選取的一側（v2.0）· 選取的一側直接使用 --btn-dark 的 3 種顏色
    '--seg-bg': t.segBg ?? '#f0f1f3',
    '--seg-fg': t.segFg ?? '#8a8f98',
    // Widget（v2.0 使用者要求）— 未設定時直接沿用卡片顏色（維持目前的樣式）。
    // 僅對背景進行半透明處理，規則與卡片相同 — 放置背景圖片時可以透出來
    '--wg-bg': t.wgBg ? withAlpha(t.wgBg, 0.94) : withAlpha(t.cardBg ?? '#fcfcfd', 0.94),
    '--wg-title': t.wgTitle ?? 'var(--faint)',
    '--wg-fg': t.wgFg ?? 'var(--ink)',
    // 只有開啟邊框時才繪製 — 關閉時為 0，因此維持目前只有陰影的樣式
    '--wg-bd-w': t.wgBorder ? '1px' : '0px',
    '--wg-bd': t.wgBd ?? 'var(--line)',
    '--radius': `${t.radius}px`, '--radius-s': `${t.radiusS}px`,
  };
}