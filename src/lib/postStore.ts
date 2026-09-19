'use client';
// 留言板・訪客留言類型 + 共用列表儲存 Hook
// v2.0：如果有連接伺服器（Supabase）就使用 DB，沒有則使用 localStorage — 畫面程式碼不需要改變。
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PostMode } from './sanitize';
import { isServerMode } from './supabase';
import { TABLE_OF, fetchList, syncList, subscribeTable } from './db';
import { currentUserId } from './currentUser';

/** 列表儲存失敗通知（v2.0）— 如果靜默恢復，畫面只會看起來像「剛寫的東西馬上消失」，無法知道原因。
 *  ListSync 會接收並顯示在畫面上（與設定儲存失敗通知相同的方式） */
export const LIST_ERR_EVT = 'ohome-list-error';

export interface Comment {
  id: string;
  author: string;
  authorId: string;      // 訪客留言的 authorId 為 ''（訪客權限 — 4.10/5.2）
  text: string;
  date: string;          // ISO
  parentId?: string;     // 回覆留言
  guestPw?: string;      // 訪客本人修改・刪除用（模擬版 — 正式服務使用伺服器雜湊）
}

/**
 * 一則留言 = 自己獨立的文件（v2.0）。
 *
 * 以前留言會放在文章（Post・RoadItem）的陣列裡。因此**要新增留言時，就必須 UPDATE 該文章**，
 * 而安全規則規定「文章修改只有作者或管理員可以」，所以一般會員在管理員的文章下留言時，
 * 伺服器會拒絕 — 畫面上會暫時出現，但隨著伺服器資料重新載入又消失，
 * 看起來就像「留言馬上被刪掉」一樣（已透過分支使用者回報確認）。
 *
 * 將留言獨立成集合後，就不需要修改文章，而且每則留言都有自己的 authorId，
 * 因此「自己寫的留言由自己修改・刪除」就能直接按照安全規則運作。
 */
export const COMMENT_KEY = 'ohome.comments.v1';

export interface CommentRow extends Comment {
  targetId: string;                 // 留言所屬的對象（文章・載入紀錄項目・感想串・訪客留言）的 id
  /** 對象種類 — 使用同一個集合區分（thread・guest：v2.0 使用者要求） */
  target: 'post' | 'road' | 'thread' | 'guest';
}

export const COMMENT_SEED: CommentRow[] = [];

/** 某個對象的留言 — 合併獨立儲存的留言 + 舊文章中仍保留的留言（legacy），按照時間排序 */
export function commentsFor(
  rows: CommentRow[], target: CommentRow['target'], targetId: string, legacy: Comment[] = [],
): Comment[] {
  const mine = rows.filter(r => r.target === target && r.targetId === targetId);
  const seen = new Set(mine.map(r => r.id));
  return [...legacy.filter(c => !seen.has(c.id)), ...mine]
    .sort((a, b) => a.date.localeCompare(b.date));
}

export type FoldType = 'spoiler' | 'adult' | 'custom';

export interface Post {
  id: string;
  title: string;
  body: string;
  mode: PostMode;        // 渲染方式（md / html）
  /** 使用什麼方式撰寫（v2.0）— 編輯器撰寫的文章在修改時不能直接顯示 HTML 原始碼，因此需要記住。
   *  渲染使用 mode，而這個值只用來決定修改畫面要以哪種模式開啟。 */
  authored?: 'editor';
  category: string;      // 分類標籤
  author: string;
  authorId: string;
  date: string;          // ISO
  secret: boolean;       // 私密文章
  notice: boolean;       // 固定為公告
  fold: { type: FoldType; label?: string } | null; // 劇透／限制級內容摺疊（6.2）
  comments: Comment[];
  boardId?: string;      // 所屬留言板（5.2 多留言板 — 沒有時使用預設 'main'）
  /** 標籤（v2.0 使用者要求）— 顯示於基本列表的作者左側，也會納入搜尋 */
  tags?: string[];
  thumbSrc?: string;     // 票券面板代表圖片 — 從內文插入的圖片中選擇（v1.9）
  thumbCrop?: { x: number; y: number; scale: number };  // 代表縮圖裁切（16:9）
}

export interface GuestEntry {
  id: string;
  author: string;
  authorId?: string;      // 如果是登入會員
  guestPw?: string;       // 訪客撰寫時本人修改・刪除用（模擬版 — 正式服務使用伺服器雜湊）
  body: string;
  secret: boolean;
  date: string;
  reply?: { author: string; text: string; date: string } | null; // 管理員回覆
}

export const BOARD_CATEGORIES = ['閒聊', '設定', '合作', '其他'];

export const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/** 列表儲存 Hook — 伺服器模式使用 DB，否則使用 localStorage（v2.0）
 *
 * 畫面程式碼仍然使用以前的 `[列表、整批儲存、載入完成]`。
 * 伺服器模式下，儲存時會比較前後兩個陣列，只對有變化的資料列進行 insert/update/delete，
 * 其他人的變更則透過即時訂閱接收。（本機模式則使用 storage 事件進行分頁間同步）
 */
export function useLocalList<T extends { id?: string }>(key: string, seed: T[]): [T[], (next: T[]) => void, boolean] {
  const server = isServerMode() && !!TABLE_OF[key];
  const table = TABLE_OF[key];
  // 伺服器模式不會把種子資料提供給畫面（v2.0 使用者發現）—
  // 原本會造成在取得伺服器列表前，範例資料短暫出現後又消失的閃爍。
  // 種子資料只是在本機模式下的初始值；如果伺服器模式以種子資料為基準，
  // 儲存時還可能錯誤地嘗試刪除伺服器中原本不存在於種子裡的資料列。
  const [list, setList] = useState<T[]>(() => (server ? [] : seed));
  const [loaded, setLoaded] = useState(false);
  const latest = useRef<T[]>(list);          // 作為 diff 基準的「目前已知存在於 DB 的狀態」
  latest.current = list;
  // 請求編號 — 當伺服器 fetch 同時發出多次時，避免較晚開始的舊結果覆蓋畫面
  //（v2.0 使用者發現 —「剛放進垃圾桶的東西要重新整理才會顯示」）。
  // 原因：即時訂閱可能會對同一次變更觸發兩次（本機反映 1 次・伺服器確認 1 次），
  // 導致 fetch 重疊；可能出現後發起的請求反而先完成，而較早發起的請求較晚完成，
  // 最後把畫面資料覆蓋回舊狀態。
  // 在樂觀更新（update）時也會增加請求編號，將之前已發出的 fetch 全部視為過期，
  // 避免剛剛完成的自己的修改又被舊結果覆蓋。
  const reqId = useRef(0);

  useEffect(() => {
    let alive = true;
    if (server) {
      const load = () => {
        const id = ++reqId.current;
        fetchList<T & { id: string }>(table)
          .then(rows => {
            if (!alive || id !== reqId.current) return;   // 如果期間已有更新的請求，就丟棄這個結果
            setList(rows); latest.current = rows; setLoaded(true);
          })
          .catch(() => { if (alive) setLoaded(true); });
      };
      load();
      const off = subscribeTable(table, load);   // 其他人寫入時立即反映
      return () => { alive = false; off(); };
    }
    try {
      const raw = localStorage.getItem(key);
      if (raw) setList(JSON.parse(raw));
    } catch { /* 保留種子資料 */ }
    setLoaded(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key !== key || e.newValue == null) return;
      try { setList(JSON.parse(e.newValue)); } catch { /* 忽略 */ }
    };
    window.addEventListener('storage', onStorage);
    return () => { alive = false; window.removeEventListener('storage', onStorage); };
  }, [key, server, table]);

  const update = useCallback((next: T[]) => {
    const prev = latest.current;
    // 在這個時間點之前發出的 fetch 全部標記為過期 — 即使晚到，也不會覆蓋這次樂觀更新
    const id = ++reqId.current;
    setList(next);            // 樂觀反映 — 畫面會立即變更
    latest.current = next;
    if (server) {
      syncList(table, prev as unknown as { id: string }[], next as unknown as { id: string }[], currentUserId())
        .catch(err => {
          // 失敗時恢復成伺服器狀態，避免畫面與 DB 長時間不一致 —
          // 但如果只恢復，就會看起來像「剛剛寫的內容自己消失」，所以也會一起通知失敗原因（v2.0）
          console.error('[ohome] 儲存失敗', err);
          try {
            window.dispatchEvent(new CustomEvent(LIST_ERR_EVT, {
              detail: { table, message: err instanceof Error ? err.message : String(err) },
            }));
          } catch { /* 忽略 */ }
          reqId.current = id;   // 將這次恢復 fetch 視為有效的最新請求
          fetchList<T & { id: string }>(table)
            .then(rows => { if (id === reqId.current) { setList(rows); latest.current = rows; } })
            .catch(() => { /* 忽略 */ });
        });
      return;
    }
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* 忽略 */ }
  }, [key, server, table]);

  return [list, update, loaded];
}

/* ---------- 種子資料（展示用） ---------- */
export const BOARD_SEED: Post[] = [];

export const GUEST_SEED: GuestEntry[] = [];

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};