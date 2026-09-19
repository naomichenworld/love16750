'use client';
// 主頁 Widget 系統＋編輯模式狀態（企劃書 4.0）
// 儲存位置：localStorage → 之後移轉至 Supabase site_settings
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ConfirmModal } from '@/components/ui/Modal';
import { useAuth } from './auth';
import { getRawSetting, setSetting } from './settingStore';

export type WidgetType =
  | 'banner' | 'member'                 // 固定元素（不可刪除）
  | 'menu' | 'memo' | 'diary' | 'latest'
  | 'dday' | 'todo' | 'upcoming' | 'freetext' | 'deco' | 'memoboard'
  | 'apply';   // 'image' 統一為 deco（裝飾圖片＋連結）（v1.9）· apply = 委託申請者（v2.0）

export interface WidgetConf {
  id: string;
  type: WidgetType;
  col: 1 | 2 | 3;                       // PC 配置欄位
  enabled: boolean;
  fixed?: boolean;                      // 是否為固定元素
  // 編輯模式配置值（網格原點 = 第一個位置，v1.8）
  tx: number; ty: number;
  w?: number; h?: number; z?: number;
  freeMove?: boolean;   // 不受網格限制的元素（v1.9 — 右鍵切換，用於文字・圖片自由配置）
  mOff?: boolean;       // 從手機版排除（v1.9 使用者確認 — 切換只控制手機版顯示，PC 版刪除使用右鍵刪除）
  rot?: number;         // 傾斜角度（度）— 圖片・自由文字，編輯模式左上角控制點拖曳（v1.9 使用者要求）
  // PC 絕對配置座標（v1.9 使用者確認 — PC 畫布沒有文件流：可以重疊，也不會互相推開。
  // 流程堆疊僅用於手機版。舊有的流程＋偏移配置會在第一次載入時，以這些座標進行快照遷移。
  ax?: number; ay?: number;
  settings: Record<string, unknown>;
}

export type LayoutMode = 'fixed' | 'fluid'; // 固定畫布（預設）／響應式（v1.9）

interface MainState {
  layoutMode: LayoutMode;
  widgets: WidgetConf[];
  mobileOrder: string[];                // 手機版垂直排列順序（Widget id）
  removedIds?: string[];                // 已刪除的預設 Widget id — 載入時不會在預設值合併中重新出現（v1.9）
}

export const WIDGET_META: Record<WidgetType, { title: string; desc: string }> = {
  banner: { title: '幻燈片橫幅', desc: '固定元素 — 最上方' },
  member: { title: '會員資訊窗', desc: '固定元素 — 登入／個人資料' },
  menu: { title: '選單列表', desc: '僅限手機版 — PC 版由上方選單取代' },
  memo: { title: 'MEMO', desc: '管理員備忘錄（點擊後開啟管理 Modal）' },
  diary: { title: 'DIARY', desc: '最近日記（心情圖示・不顯示私人內容）' },
  latest: { title: 'LATEST', desc: '最新 3 張圖片' },
  dday: { title: 'D-DAY', desc: 'D-DAY 列表' },
  todo: { title: 'TO-DO', desc: '管理員待辦事項（訪客只能查看）' },
  upcoming: { title: 'UPCOMING', desc: '即將到來的行程' },
  freetext: { title: '自由文字', desc: '不帶面板，只有文字' },
  deco: { title: '圖片', desc: '不帶面板，只有圖片' },
  memoboard: { title: 'STICKY', desc: '便利貼備忘錄小看板 — 點擊後開啟備忘錄（4.6）' },
  apply: { title: 'COMMISSION', desc: '委託申請者 — 按截止較快的順序（可設定顯示幾人）' },
};

/** 可以新增多個相同類型的 Widget（v1.9 使用者確認 — 其餘每種類型只能有一個） */
export const MULTI_TYPES: WidgetType[] = ['freetext', 'deco', 'banner'];   // banner：v2.0 使用者要求 — 可以有多個幻燈片橫幅

/** Widget 顯示名稱 — 如果可重複新增的 Widget 有 2 個以上，就加上編號區分（v1.9） */
export function widgetLabel(widgets: WidgetConf[], w: WidgetConf): string {
  const t = WIDGET_META[w.type].title;
  if (!MULTI_TYPES.includes(w.type)) return t;
  const same = widgets.filter(x => x.type === w.type);
  return same.length > 1 ? `${t} ${same.findIndex(x => x.id === w.id) + 1}` : t;
}

// 預設配置固定使用絕對座標（v1.9 使用者回饋）— 以前會測量流程渲染後建立快照，
// 但測量值會受到 Widget 最小高度影響，導致 D-DAY・TO-DO 的間距變成 0。垂直間距全部為 10px。
const DEFAULT_STATE: MainState = {
  layoutMode: 'fixed',
  widgets: [
    // 部署預設 — 不放入虛假內容，從空白 Widget 開始（v1.9）
    // 選單列表僅限手機版（PC 隱藏），因此座標沒有意義
    { id: 'menu', type: 'menu', col: 1, enabled: true, tx: 0, ty: 0, ax: 0, ay: 0, w: 230, h: 80, settings: {} },
    { id: 'memo', type: 'memo', col: 1, enabled: true, tx: 0, ty: 0, ax: 0, ay: 0, w: 230, h: 80, settings: { text: '' } },
    { id: 'banner', type: 'banner', col: 2, enabled: true, fixed: true, tx: 0, ty: 0, ax: 240, ay: 0, w: 610, h: 210, settings: {} },
    { id: 'diary', type: 'diary', col: 2, enabled: true, tx: 0, ty: 0, ax: 240, ay: 220, w: 300, h: 150, settings: {} },
    { id: 'latest', type: 'latest', col: 2, enabled: true, tx: 0, ty: 0, ax: 550, ay: 220, w: 300, h: 150, settings: {} },
    // 會員資訊窗的高度剛好符合登入狀態的內容（個人資料＋按鈕）— 再加高會顯得下方空白（v1.9 使用者確認）
    { id: 'member', type: 'member', col: 3, enabled: true, fixed: true, tx: 0, ty: 0, ax: 860, ay: 0, w: 260, h: 150, settings: {} },
    { id: 'dday', type: 'dday', col: 3, enabled: true, tx: 0, ty: 0, ax: 860, ay: 160, w: 260, h: 90, settings: { items: [] } },
    { id: 'todo', type: 'todo', col: 3, enabled: true, tx: 0, ty: 0, ax: 860, ay: 260, w: 260, h: 90, settings: { items: [] } },
    // UPCOMING 不包含在預設配置中 — 如有需要，可使用［＋ Widget］新增（v1.9：由開／關改為新增／刪除模式）
  ],
  mobileOrder: ['menu', 'memo', 'diary', 'latest', 'dday', 'todo'],
};

const STORAGE_KEY = 'ohome.main.v1';
/** 支援編輯模式的頁面（v1.9 — 包含卡片網格拖曳排序）
 *  /trpg 遺漏日誌備份是失誤 — 拖曳排序・列表隱藏確認都必須有這個切換才能啟用
 *  （v2.0 使用者發現 — 製作列表隱藏功能時，才發現編輯模式本身在此頁面無法開啟） */
const EDIT_PAGES = ['/', '/comm-apply', '/chars', '/rels', '/comm', '/gallery', '/dotori', '/tchars', '/playlog', '/trpg'];
const EDIT_PAGE_NAMES = '主頁 · 申請者列表 · 角色 · 自設關係 · 委託 · 圖庫 · 橡果 · TRPG 角色 · 遊玩紀錄 · TRPG 日誌';

interface MainCtx {
  state: MainState;
  editOn: boolean;
  editAvailable: boolean;               // 目前頁面是否可以開啟編輯模式（選單顯示條件）
  gridOn: boolean;
  setGridOn: (v: boolean) => void;
  toggleEdit: () => void;               // 個人資料下拉選單中的編輯模式項目
  requestExit: (pendingHref?: string) => void; // 編輯中點擊項目・頁面移動時
  guardNav: (href: string) => boolean;  // true = 阻止移動（顯示 Modal）
  updateWidget: (id: string, patch: Partial<WidgetConf>, opts?: { persist?: boolean }) => void;
  addWidget: (type: WidgetType, col: 1 | 2 | 3) => string;   // 回傳新 Widget id（v1.9）
  removeWidget: (id: string) => void;
  setLayoutMode: (m: LayoutMode) => void;
  setMobileOff: (id: string, v: boolean) => void;  // 從手機版排除切換（v1.9 — PC 版刪除使用右鍵刪除）
  setMobileOrder: (ids: string[]) => void;
  saveNow: () => void;                  // 在環境設定等編輯模式之外的變更立即儲存
  resetMain: () => void;                // 將主頁恢復為預設配置（v1.9 — 立即儲存）
}

const Ctx = createContext<MainCtx | null>(null);

export function MainStoreProvider({ children }: { children: React.ReactNode }) {
  const { isAdmin } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<MainState>(DEFAULT_STATE);
  const [editOn, setEditOn] = useState(false);
  const [gridOn, setGridOn] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingNav = useRef<string | null>(null);
  const snapshot = useRef<MainState | null>(null);

  // 載入
  useEffect(() => {
    try {
      const raw = getRawSetting(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MainState;
        // 即使新增新的 Widget 類型，也會與預設值合併 · 過濾已移除的 'image' Widget（v1.9 — 統一為 deco）
        // 舊版 enabled:false（全部隱藏）會轉為刪除 — 現在切換只控制手機版顯示（v1.9 使用者確認）
        const removed = new Set(parsed.removedIds ?? []);
        const kept: WidgetConf[] = [];
        for (const w of parsed.widgets) {
          if ((w.type as string) === 'image') continue;
          if (!w.enabled && !w.fixed) { removed.add(w.id); continue; }
          kept.push(w.enabled ? w : { ...w, enabled: true });
        }
        const ids = new Set(kept.map(w => w.id));
        // 已刪除的預設 Widget 不會在合併時重新出現
        const merged = [...kept, ...DEFAULT_STATE.widgets.filter(w => !ids.has(w.id) && !removed.has(w.id))];
        setState({ ...DEFAULT_STATE, ...parsed, widgets: merged, removedIds: [...removed] });
      }
    } catch { /* 使用預設值 */ }
  }, []);

  const persist = useCallback((s: MainState) => {
    try { setSetting(STORAGE_KEY, s); } catch { /* 忽略 */ }
  }, []);

  // 固定畫布 body class（v1.9 — 主頁永遠固定，移除響應式選項：只有 PC／手機兩種）
  useEffect(() => {
    document.body.classList.toggle('main-fixed', pathname === '/');
  }, [pathname]);

  useEffect(() => {
    document.body.classList.toggle('edit-on', editOn);
  }, [editOn]);

  const startEdit = useCallback(() => {
    if (window.matchMedia('(max-width:620px)').matches) {
      setNotice('手機版無法使用編輯模式，請使用 PC。');
      return;
    }
    if (!EDIT_PAGES.includes(pathname)) {
      setNotice(`此頁面無法開啟編輯模式。\n可使用的頁面：${EDIT_PAGE_NAMES}`);
      return;
    }
    snapshot.current = JSON.parse(JSON.stringify(state));
    setEditOn(true);
  }, [pathname, state]);

  const endEdit = useCallback((save: boolean) => {
    if (save) persist(state);
    // 還原時也要儲存 — 編輯期間 Widget 設定 Modal 立即儲存的值，也會依照快照還原（v1.9）
    else if (snapshot.current) { setState(snapshot.current); persist(snapshot.current); }
    snapshot.current = null;
    setEditOn(false);
    setGridOn(false); // 結束編輯時自動關閉網格（v1.8）
    setExitOpen(false);
    if (pendingNav.current) {
      const t = pendingNav.current;
      pendingNav.current = null;
      router.push(t);
    }
  }, [state, persist, router]);

  const toggleEdit = useCallback(() => {
    if (!isAdmin) return;
    if (editOn) setExitOpen(true);
    else startEdit();
  }, [isAdmin, editOn, startEdit]);

  const requestExit = useCallback((pendingHref?: string) => {
    pendingNav.current = pendingHref ?? null;
    setExitOpen(true);
  }, []);

  const guardNav = useCallback((href: string) => {
    if (!editOn) return false;
    requestExit(href);
    return true;
  }, [editOn, requestExit]);

  // opts.persist：更新狀態的同時儲存（Modal SAVE 等 — 禁止使用 saveNow，因為 closure 會取得舊狀態）
  const updateWidget = useCallback((id: string, patch: Partial<WidgetConf>, opts?: { persist?: boolean }) => {
    setState(s => {
      const n = { ...s, widgets: s.widgets.map(w => (w.id === id ? { ...w, ...patch } : w)) };
      if (opts?.persist) persist(n);
      return n;
    });
  }, [persist]);

  const addWidget = useCallback((type: WidgetType, col: 1 | 2 | 3): string => {
    const id = `${type}-${Date.now().toString(36)}`;
    setState(s => {
      // 防止重複新增（v1.9）— 除了圖片・自由文字之外，每種類型只能有一個（UI 也會阻擋，但這裡是安全機制）
      if (!MULTI_TYPES.includes(type) && s.widgets.some(w => w.type === type)) return s;
      // 絕對配置預設座標（v1.9）— 放在所選欄位上方附近、現有 Widget 下方
      const colX = { 1: 0, 2: 240, 3: 880 } as const;
      const maxY = Math.max(60, ...s.widgets.filter(w => w.enabled && w.col === col && w.ay != null)
        .map(w => (w.ay ?? 0) + (w.h ?? 200) + 10));
      const w: WidgetConf = {
        id, type, col, enabled: true, tx: 0, ty: 0,
        ax: colX[col], ay: maxY,
        settings: type === 'freetext' ? { text: '自由文字' } : {},
      };
      return { ...s, widgets: [...s.widgets, w], mobileOrder: [...s.mobileOrder, id] };
    });
    return id;   // 用於提示捲動到新增 Widget（v1.9）
  }, []);

  const removeWidget = useCallback((id: string) => {
    setState(s => ({
      ...s,
      widgets: s.widgets.filter(w => w.id !== id || w.fixed),
      mobileOrder: s.mobileOrder.filter(x => x !== id),
      removedIds: [...(s.removedIds ?? []), id],   // 如果是預設 Widget，下次載入合併時也會排除（v1.9）
    }));
  }, []);

  const setLayoutMode = useCallback((m: LayoutMode) => {
    setState(s => { const n = { ...s, layoutMode: m }; persist(n); return n; });
  }, [persist]);

  // 切換只控制手機版顯示（v1.9 使用者確認）— 如果要從 PC 主頁移除，請在編輯模式中右鍵刪除
  const setMobileOff = useCallback((id: string, v: boolean) => {
    setState(s => {
      const n = { ...s, widgets: s.widgets.map(w => (w.id === id ? { ...w, mOff: v } : w)) };
      persist(n); return n;
    });
  }, [persist]);

  const setMobileOrder = useCallback((ids: string[]) => {
    setState(s => { const n = { ...s, mobileOrder: ids }; persist(n); return n; });
  }, [persist]);

  const saveNow = useCallback(() => persist(state), [persist, state]);

  // 恢復主頁預設配置（v1.9 使用者要求）— Widget 配置・位置・大小・手機版順序全部重設
  const resetMain = useCallback(() => {
    const fresh: MainState = JSON.parse(JSON.stringify(DEFAULT_STATE));
    setState(fresh);
    persist(fresh);
  }, [persist]);

  return (
    <Ctx.Provider value={{
      state, editOn, editAvailable: EDIT_PAGES.includes(pathname), gridOn, setGridOn, toggleEdit, requestExit, guardNav,
      updateWidget, addWidget, removeWidget, setLayoutMode, setMobileOff, setMobileOrder, saveNow, resetMain,
    }}>
      {children}

      {/* 編輯結束確認（v1.8 — 3 個按鈕） */}
      <ConfirmModal
        open={exitOpen}
        title="確定要結束編輯嗎？"
        body="如果不儲存就結束，本次編輯中修改的配置・大小・順序會恢復到開始編輯時的狀態。"
        onClose={() => { pendingNav.current = null; setExitOpen(false); }}
        buttons={[
          { label: '儲存後結束', kind: 'dark', onClick: () => endEdit(true) },
          { label: '不儲存直接結束', kind: 'ghost', onClick: () => endEdit(false) },
          { label: 'CANCEL', kind: 'ghost', onClick: () => { pendingNav.current = null; setExitOpen(false); } },
        ]}
      />

      {/* 無法進入編輯模式提示（v1.9） */}
      <ConfirmModal
        open={notice !== null}
        title="編輯模式"
        body={<span style={{ whiteSpace: 'pre-line' }}>{notice}</span>}
        onClose={() => setNotice(null)}
        buttons={[{ label: '確認', kind: 'dark', onClick: () => setNotice(null) }]}
      />
    </Ctx.Provider>
  );
}

export function useMainStore(): MainCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useMainStore must be used within MainStoreProvider');
  return ctx;
}

/* ---------- 圖片 Widget 幻燈片（v2.0） ---------- */

export interface DecoSlide {
  id: string;
  imgId: string;
  crop?: import('@/components/ui/CropEditor').CropValue;
  link?: string;
}

/**
 * 圖片 Widget 的場景列表。
 * 以前只儲存一張圖片（imgId/crop/link）— 現有的儲存資料也會讀取成一張圖片的列表，
 * 讓畫面・編輯器都可以將它當成只有一張幻燈片來處理。
 */
export function decoSlides(settings: Record<string, unknown>): DecoSlide[] {
  const list = settings.slides as DecoSlide[] | undefined;
  if (Array.isArray(list) && list.length) return list.filter(s => s?.imgId);
  const imgId = settings.imgId as string | undefined;
  if (!imgId) return [];
  return [{
    id: 'legacy',
    imgId,
    crop: settings.crop as DecoSlide['crop'],
    link: settings.link as string | undefined,
  }];
}