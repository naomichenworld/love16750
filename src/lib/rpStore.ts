'use client';
// 角色扮演（4.9）— 即時聊天型。目前處於 localStorage 階段（用於確認同一瀏覽器內的運作），
// 即時收發、輸入中顯示、所有參與者同意流程會在串接 Supabase Realtime 時啟用。
export interface RpMessage {
  id: string;
  // 角色發言／敘述（中央敘述）。已移除 'player'（會員本人發言）—
  // 角色扮演只需要角色與敘述即可（v2.0 使用者確認）。舊紀錄在讀取時會轉換為敘述
  kind: 'char' | 'desc' | 'player';
  charId?: string;                  // kind==='char' 時的發言角色
  charOwn?: boolean;                // 發言當時是否為我的角色（自設）— 用於刪除角色重新連結時的列表判斷
  authorId: string;                 // 撰寫會員（修改／刪除權限）
  text: string;
  date: string;                     // ISO
}

export interface RpRoom {
  id: string;
  title: string;
  relId?: string;                   // 基礎自設關係（可選 — 可自由建立）
  /** 以該自設關係的哪個 AU 進行遊玩（v2.0 使用者要求）— 沒有則使用原本設定。
   * 在房間內會以該 AU 的角色設定檔（姓名・顏色・圖片）來顯示角色。 */
  auId?: string;
  memberIds: string[];              // 參與會員 — 不在此列表中就連房間本身的存在都看不到（已確認）
  status: 'ongoing' | 'done';       // 進行中 / 完結
  isPublic: boolean;                // 完結後切換為公開（可從自設關係角色扮演列表查看）
  createdBy: string;
  created: string;
  lastRead: Record<string, string>; // 每位會員最後確認的時間 — N 徽章
  messages: RpMessage[];
}

/**
 * 此房間的參與會員（v2.0 使用者確認）。
 *
 * 如果有基礎自設關係，**不直接選擇會員**，而是由對該自設關係角色擁有權限的人
 * 自動成為參與者。不是儲存的列表，而是每次查看時重新計算，因此如果將角色權限轉交給其他
 * 人，該自設關係所建立的角色扮演房間會**立即反映**，不需要另外修改。
 * （不需要到處修改房間文件 — 反正也無法修改別人的房間）。
 *
 * 自由建立（沒有自設關係）的房間則和以前一樣使用已儲存的 memberIds。建立者永遠是參與者。
 */
export function rpMemberIds(
  r: RpRoom,
  rels: { id: string; members: { charId: string }[] }[],
  chars: { id: string; grants?: { userId: string }[] }[],
): string[] {
  const ids = new Set<string>();
  if (r.createdBy) ids.add(r.createdBy);
  if (r.relId) {
    const rel = rels.find(x => x.id === r.relId);
    rel?.members.forEach(m => {
      chars.find(c => c.id === m.charId)?.grants?.forEach(g => ids.add(g.userId));
    });
    return [...ids];
  }
  (r.memberIds ?? []).forEach(id => ids.add(id));
  return [...ids];
}

/** hex → "r,g,b"（用於低透明度的對話框背景 — 6 張對話框的顏色規則） */
export function hexRgb(hex?: string): string {
  const h = (hex ?? '#5d636d').replace('#', '');
  const f = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
  return `${parseInt(f.slice(0, 2), 16) || 93},${parseInt(f.slice(2, 4), 16) || 99},${parseInt(f.slice(4, 6), 16) || 109}`;
}

/**
 * 一則發言 = 自己獨立的文件（v2.0）。
 *
 * 以前發言是放在房間（RpRoom）文件的陣列裡。因此**要發言就必須 UPDATE 房間**，
 * 而「只有作者或管理員可以修改」的規則會導致參與者無法在別人建立的房間中發言 —
 * 和留言、問答被限制是相同的根本原因（依 v2.0 使用者要求一併整理）。
 */
export const RP_MSG_KEY = 'ohome.rpmsgs.v1';

export interface RpMessageRow extends RpMessage { roomId: string }

export const RP_MSG_SEED: RpMessageRow[] = [];

/** 一個房間的發言 — 舊房間內的發言 + 分開儲存的發言，依時間排序。
 *  已移除的「玩家」發言不會**刪除，而是以敘述的形式讀取** — 別人實際說過的話不能消失 */
export function messagesFor(rows: RpMessageRow[], roomId: string, legacy: RpMessage[] = []): RpMessage[] {
  const mine = rows.filter(r => r.roomId === roomId);
  const seen = new Set(mine.map(r => r.id));
  return [...legacy.filter(m => !seen.has(m.id)), ...mine]
    .map(m => (m.kind === 'player' ? { ...m, kind: 'desc' as const, charId: undefined } : m))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ---------- 已讀標示（v2.0）----------
   以前記錄在房間文件的 lastRead 中，但即使只是打開房間查看，也會 UPDATE 別人的房間，
   因此參與者會受到規則限制（N 徽章永遠不會消失）。已讀時間本來就是每個人不同的值，
   沒有理由共享到伺服器，因此只保存在瀏覽器中。 */
const READ_KEY = 'ohome.rpread.v1';

function readMap(): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(READ_KEY) ?? '{}') as Record<string, string>; } catch { return {}; }
}

/** 我最後一次查看此房間的時間 — 取本機紀錄與舊房間紀錄中較晚的時間 */
export function rpSeenAt(r: RpRoom, userId: string): string {
  const local = readMap()[`${userId}:${r.id}`] ?? '';
  const legacy = r.lastRead?.[userId] ?? '';
  return local > legacy ? local : legacy;
}

export function rpMarkRead(roomId: string, userId: string, at = new Date().toISOString()): void {
  try {
    const m = readMap();
    m[`${userId}:${roomId}`] = at;
    localStorage.setItem(READ_KEY, JSON.stringify(m));
  } catch { /* 忽略 */ }
}

/** 房間最後一則訊息的時間（沒有則使用建立時間） */
export const rpLastDate = (r: RpRoom, msgs: RpMessage[]) =>
  msgs.length ? msgs[msgs.length - 1].date : r.created;

/** 是否有未讀的新訊息（在我最後查看之後由其他人發送的訊息） */
export function rpHasNew(r: RpRoom, userId: string, msgs: RpMessage[]): boolean {
  const seen = rpSeenAt(r, userId);
  return msgs.some(m => m.authorId !== userId && m.date > seen);
}

/* ---------- 種子資料（原型展示沿用 — admin・guest 參與）---------- */
export const RP_SEED: RpRoom[] = [];