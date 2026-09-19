'use client';
// 通知（4.13）— 網站內徽章（標頭鈴鐺 + 選單圓點）。Discord Bot 私訊會在 Supabase／Bot 伺服器串接時使用。
// 因為同一個分頁內，通知發生的位置（各頁面）和顯示的位置（TopBar）不同，所以透過自訂事件同步。
//
// **伺服器傳遞（v2.0 分支回報 —「收不到通知」）**：以前通知只累積在裝置（localStorage）裡，
// 只有在**產生通知的瀏覽器**切換帳號時才看得到（自己切換帳號測試時可以，
// 但訪客・其他裝置的會員留下的通知永遠收不到）。現在伺服器 mode 時也會寫入 notifications 集合 —
// **將資料列擁有者（authorId）設定為接收者**，因此依伺服器規則，只有接收者與管理員能讀取及刪除。
// 接收方會透過登入・開啟鈴鐺・即時訂閱來取得通知（TopBar），裝置列表則仍然作為快取使用。
import { newId } from './postStore';
import { isServerMode, backend } from './backend';
import { fetchList, syncList } from './db';
import { currentUserId } from './currentUser';

export type NotifType = 'rp' | 'comment' | 'guest';
export interface Notif {
  id: string;
  type: NotifType;
  toUserId: string;          // 接收會員
  title: string;
  body?: string;
  href: string;              // 點擊後前往
  date: string;
  read: boolean;
  readAt?: string;           // 閱讀時間 — 經過一天後從列表中整理掉（v2.0 使用者要求）
}

/** 將已閱讀且經過一天的通知從列表中移除（v2.0 使用者要求）。
 *  未閱讀的通知無論經過多久都會保留 — 因為不能任意刪除使用者錯過的通知。 */
const KEEP_READ_MS = 24 * 60 * 60 * 1000;
export function pruneNotifs(list: Notif[], now = Date.now()): Notif[] {
  return list.filter(n => {
    if (!n.read) return true;
    const t = Date.parse(n.readAt ?? '');
    return !Number.isFinite(t) || now - t < KEEP_READ_MS;
  });
}

const KEY = 'ohome.notif.v1';
const SET_KEY = 'ohome.notifset.v1'; // 每位會員的通知項目開／關 — { [userId]: { rp, comment, guest } }
export const NOTIF_EVENT = 'ohome-notif';

export const NOTIF_TYPE_LABEL: Record<NotifType, string> = {
  rp: '角色扮演新訊息', comment: '我的文章留言', guest: '訪客留言（管理員）',
};

export function readNotifs(): Notif[] {
  try {
    const all = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Notif[];
    const kept = pruneNotifs(all);
    // 如果有整理掉的內容，也會一併儲存（避免下次再次掃描）— 這裡如果發送事件，會在渲染時更新，因此不發送
    if (kept.length !== all.length) {
      try { localStorage.setItem(KEY, JSON.stringify(kept)); } catch { /* 忽略 */ }
    }
    return kept;
  } catch { return []; }
}

function write(list: Notif[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list.slice(0, 100))); } catch { /* 忽略 */ }
  window.dispatchEvent(new Event(NOTIF_EVENT));
}

export interface NotifSettings { rp: boolean; comment: boolean; guest: boolean }
const DEFAULT_SET: NotifSettings = { rp: true, comment: true, guest: true };

export function notifSettings(userId: string): NotifSettings {
  try {
    const all = JSON.parse(localStorage.getItem(SET_KEY) ?? '{}');
    return { ...DEFAULT_SET, ...(all[userId] ?? {}) };
  } catch { return DEFAULT_SET; }
}

export function setNotifSetting(userId: string, key: NotifType, value: boolean) {
  try {
    const all = JSON.parse(localStorage.getItem(SET_KEY) ?? '{}');
    all[userId] = { ...DEFAULT_SET, ...(all[userId] ?? {}), [key]: value };
    localStorage.setItem(SET_KEY, JSON.stringify(all));
  } catch { /* 忽略 */ }
  window.dispatchEvent(new Event(NOTIF_EVENT));
}

/** 建立通知 — 如果接收者已關閉該項目，就不建立通知。
 *  dedupeKey：如果已經存在相同 key 的未讀通知，就不新增，而是更新（例如依角色扮演房間合併）。 */
export function pushNotif(n: {
  type: NotifType; toUserId: string; title: string; body?: string; href: string; dedupeKey?: string;
}) {
  if (!notifSettings(n.toUserId)[n.type]) return;
  const list = readNotifs();
  if (n.dedupeKey) {
    const i = list.findIndex(x => !x.read && x.toUserId === n.toUserId
      && x.type === n.type && x.href === n.href && x.title === n.title);
    if (i >= 0) {
      const [ex] = list.splice(i, 1);
      write([{ ...ex, body: n.body, date: new Date().toISOString() }, ...list]);
      // 伺服器上會保留為新的資料列 — 因為無法修改其他人的資料列（接收者擁有）。
      // 重複的資料列會由接收方取得時整理掉（syncNotifs）
      sendToServer({ ...ex, id: newId(), body: n.body, date: new Date().toISOString() });
      return;
    }
  }
  const row: Notif = {
    id: newId(), type: n.type, toUserId: n.toUserId, title: n.title, body: n.body,
    href: n.href, date: new Date().toISOString(), read: false,
  };
  write([row, ...list]);
  sendToServer(row);
}

/**
 * 通知管理員（們）（v2.0 分支回報後整理）。
 *
 * 以前會直接把接收者寫成字串 'admin' — 因為這是模擬管理員的 id，所以**伺服器模式下
 * 絕對不會與實際管理員 uid 相同**，導致訪客留言通知永遠不會顯示給管理員。
 * 現在會從會員列表（公開讀取）中找出 role 為 admin 的實際 id，再發送給他們。若有多位管理員則全部發送，
 * 但會排除目前登入的人。瀏覽器儲存模式則維持原本的 'admin'（模擬 id）。
 */
let adminIdsCache: string[] | null = null;
async function adminIds(): Promise<string[]> {
  if (!isServerMode()) return ['admin'];
  if (adminIdsCache) return adminIdsCache;
  try {
    const ms = await backend()!.listMembers();
    adminIdsCache = ms.filter(m => m.role === 'admin').map(m => m.id);
  } catch { return []; }   // 不進行快取 — 下一次通知時重新嘗試
  return adminIdsCache;
}
export function notifyAdmins(n: { type: NotifType; title: string; body?: string; href: string; dedupeKey?: string }) {
  void adminIds().then(ids => {
    for (const id of ids) {
      if (id === currentUserId()) continue;   // 不通知自己剛剛做出的操作
      pushNotif({ ...n, toUserId: id });
    }
  });
}

/* ---------- 伺服器傳遞（v2.0） ---------- */
/** 伺服器資料列 — 將接收者設為擁有者，並設定為僅自己可見（讀取・修改・刪除會受到接收者・管理員限制） */
const asRow = (n: Notif) => ({ ...n, authorId: n.toUserId, visibility: 'private' as const });

/** 將一筆通知也寫入伺服器 — 失敗時靜默處理（不能因為通知失敗就阻擋留言本身） */
function sendToServer(n: Notif) {
  if (!isServerMode()) return;
  void syncList('notifications', [], [asRow(n)], currentUserId())
    .catch(e => console.warn('[ohome] 通知伺服器儲存失敗', e));
}

/** 將我的通知資料列變更（已讀・刪除）同步到伺服器 — 因為是我的資料列，所以伺服器規則允許 */
function mirrorToServer(prev: Notif[], next: Notif[]) {
  if (!isServerMode() || (!prev.length && !next.length)) return;
  void syncList('notifications', prev.map(asRow), next.map(asRow), currentUserId())
    .catch(() => { /* 規則尚未套用的分支等情況 — 裝置列表已經反映，因此忽略 */ });
}

/**
 * 通知傳遞自我診斷（v2.0 分支回報「還是收不到」的對應處理）— 自動確認到底卡在哪裡。
 * 將一筆發給自己的測試通知**寫入伺服器**，再從伺服器讀回，最後刪除。
 * 回傳文字就是提示：如果儲存被阻擋，就是建立規則問題；如果讀取被阻擋，就是讀取規則問題。
 */
export async function selfTestNotif(userId: string): Promise<string> {
  if (!isServerMode()) return '目前是瀏覽器儲存模式 — 通知只會在這個瀏覽器內運作';
  const now = new Date().toISOString();
  const row = asRow({
    id: newId(), type: 'comment', toUserId: userId, title: '通知傳遞確認',
    href: '/', date: now, read: true, readAt: now,
  });
  try {
    await syncList('notifications', [], [row], currentUserId());
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `伺服器儲存失敗 — ${msg.slice(0, 80)} · 需要重新執行安裝 SQL（Supabase）或重新套用 Firestore 規則（Firebase）`;
  }
  try {
    const rows = await fetchList('notifications') as unknown as Notif[];
    const found = rows.some(r => r.id === row.id);
    try { await syncList('notifications', [row], [], currentUserId()); } catch { /* 忽略測試資料列整理失敗 */ }
    return found
      ? '正常 — 通知已儲存至伺服器並成功讀取。其他人留下的通知會在登入・開啟鈴鐺時送達'
      : '儲存成功，但讀取時看不到 — 請重新套用最新的安全規則（讀取）';
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return `伺服器讀取失敗 — ${msg.slice(0, 80)} · 請重新套用最新的安全規則`;
  }
}

let lastSync = 0;
/**
 * 取得伺服器中累積的我的通知（v2.0）— 登入・開啟鈴鐺・收到即時訊號時呼叫。
 * 取得時也會整理：相同群組（例如角色扮演）重複的未讀資料列只保留最新的一筆，
 * 已讀且超過一天的資料列也會從伺服器刪除 — 因為全部都是我的資料列，所以可以刪除。
 */
export async function syncNotifs(userId: string, force = false): Promise<void> {
  if (!isServerMode() || !userId) return;
  const now = Date.now();
  if (!force && now - lastSync < 30_000) return;
  lastSync = now;
  try {
    const rows = await fetchList('notifications') as unknown as Notif[];
    // 接收者的開／關設定會在取得時過濾 — 發送方裝置不知道接收者的設定（裝置保存）
    const mySet = notifSettings(userId);
    const mine = rows.filter(r => r.toUserId === userId && mySet[r.type] !== false);
    const local = readNotifs();
    const byId = new Map(local.map(x => [x.id, x]));
    let changed = false;
    for (const r of mine) {
      const ex = byId.get(r.id);
      const merged: Notif = {
        id: r.id, type: r.type, toUserId: r.toUserId, title: r.title, body: r.body,
        href: r.href, date: r.date,
        // 已讀狀態只要其中一邊讀過就視為已讀 — 避免在裝置 A 讀過後，又在裝置 B 變回未讀
        read: (ex?.read ?? false) || r.read,
        readAt: ex?.readAt ?? r.readAt,
      };
      if (!ex || JSON.stringify(ex) !== JSON.stringify(merged)) changed = true;
      byId.set(r.id, merged);
    }
    // 整理重複資料列 — 相同（種類・網址・標題）的未讀通知只保留最新一筆
    const seen = new Map<string, Notif>();
    const drop: Notif[] = [];
    for (const x of [...byId.values()].sort((a, b) => b.date.localeCompare(a.date))) {
      if (x.toUserId !== userId || x.read) continue;
      const k = `${x.type}|${x.href}|${x.title}`;
      if (seen.has(k)) { drop.push(x); byId.delete(x.id); changed = true; }
      else seen.set(k, x);
    }
    // 已讀且超過一天的我的資料列，也會從伺服器整理掉
    const stale = mine.filter(r => {
      const t = Date.parse(r.readAt ?? '');
      return r.read && Number.isFinite(t) && now - t > 24 * 60 * 60 * 1000;
    });
    const del = [...drop, ...stale.filter(s => !drop.some(d => d.id === s.id))];
    if (del.length) mirrorToServer(del, []);
    if (changed) {
      write([...byId.values()].sort((a, b) => b.date.localeCompare(a.date)));
    }
  } catch { /* 資料表・規則尚未套用的分支等情況 — 僅使用裝置列表運作 */ }
}

export function markRead(id: string) {
  const at = new Date().toISOString();
  const list = readNotifs();
  const before = list.find(n => n.id === id);
  const next = list.map(n => (n.id === id ? { ...n, read: true, readAt: n.readAt ?? at } : n));
  write(next);
  // 已讀狀態也同步至伺服器 — 避免其他裝置再次顯示為未讀（v2.0）
  if (before && !before.read) mirrorToServer([before], [next.find(n => n.id === id)!]);
}

export function markAllRead(userId: string) {
  const at = new Date().toISOString();
  const list = readNotifs();
  const next = list.map(n => (n.toUserId === userId ? { ...n, read: true, readAt: n.readAt ?? at } : n));
  write(next);
  const before = list.filter(n => n.toUserId === userId && !n.read);
  mirrorToServer(before, before.map(n => next.find(x => x.id === n.id)!));
}

/** 立即整理已讀通知（v2.0 使用者要求 — 不等待一天，手動執行） */
export function clearReadNotifs(userId: string) {
  const list = readNotifs();
  const gone = list.filter(n => n.toUserId === userId && n.read);
  write(list.filter(n => !(n.toUserId === userId && n.read)));
  mirrorToServer(gone, []);   // 伺服器上也會刪除 — 否則下次登入時又會重新出現
}

export function removeNotif(id: string) {
  write(readNotifs().filter(n => n.id !== id));
}