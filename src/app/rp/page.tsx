'use client';
// 角色扮演 (4.9) — 即時聊天型。建立房間（以自設關係為基礎／自由）· 僅向參與者顯示存在 ·
// 選擇角色發言（主題色對話框）· 敘述（/desc）· 修改／刪除訊息 · 完結／公開切換 · HTML 匯出
// ※ 即時收發·輸入中顯示·全體參與者同意會在 Supabase Realtime 連結後啟用（目前使用 localStorage）
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import {
  RpRoom, RpMessage, RP_SEED, hexRgb, rpLastDate, rpHasNew,
  RpMessageRow, RP_MSG_KEY, RP_MSG_SEED, messagesFor, rpMarkRead, rpMemberIds,
} from '@/lib/rpStore';
import { Character, CHAR_SEED, Relation, REL_SEED, charGrant, charWithAu } from '@/lib/charStore';
import { Modal, ConfirmModal, useConfirmDelete } from '@/components/ui/Modal';
import { KInput, KTextarea, KSelect, KCheck } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';

/** 角色臉部晶片（縮圖或示範用佔位圖） */
function Face({ ch, className }: { ch?: Character; className: string }) {
  return (
    <div className={`${className} ${!ch?.thumbId ? `ph ${ch?.thumbClass ?? ''}` : ''}`}>
      {ch?.thumbId && <CroppedBlobImg fileRef={ch.thumbId} crop={ch.thumbCrop} />}
    </div>
  );
}

const fmtHM = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

import { useMembers } from '@/lib/members';
import { pushNotif } from '@/lib/notifStore';

export default function RpPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const del = useConfirmDelete();
  const [rooms, setRooms, loaded] = useLocalList<RpRoom>('ohome.rp.v1', RP_SEED);
  // 發言與房間分開儲存 (v2.0) — 如果放在房間裡，每次發言都必須 UPDATE 房間，
  // 因此在別人建立的房間中，參與者無法發言（與留言·問答相同的根本原因）
  const [msgRows, setMsgRows] = useLocalList<RpMessageRow>(RP_MSG_KEY, RP_MSG_SEED);
  // 單一房間的發言 — 舊房間內的內容 + 分離儲存的資料
  const msgsOf = (r: RpRoom) => messagesFor(msgRows, r.id, r.messages);
  // 參與會員 — 如果有基礎自設關係，則自動從該自設關係角色的權限者取得 (v2.0 使用者確認)。
  // 因為是計算後使用，所以當權限轉移給其他人時，該自設關係為基礎的整個角色扮演都會立即反映
  const memberIdsOf = (r: RpRoom) => rpMemberIds(r, rels, chars);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [selId, setSelId] = useState<string | null>(null);
  const [fStatus, setFStatus] = useState<'all' | 'ongoing' | 'done'>('ongoing'); // 右側狀態篩選 — 預設為進行中
  // 手機 (v1.9 使用者確認) — 房間列表收合在上方列，輸入框取得焦點時只顯示角色扮演區域
  const [mListOpen, setMListOpen] = useState(false);
  const [mFocus, setMFocus] = useState(false);

  // 僅向參與者顯示存在（已確認 — 管理員也看不到未參與的房間）
  const allMine = useMemo(() => (user
    ? rooms.filter(r => memberIdsOf(r).includes(user.id))
      .sort((a, b) => rpLastDate(b, messagesFor(msgRows, b.id, b.messages))
        .localeCompare(rpLastDate(a, messagesFor(msgRows, a.id, a.messages))))
    : []), [rooms, user, msgRows, rels, chars]);
  const myRooms = useMemo(() => allMine.filter(r => fStatus === 'all' || r.status === fStatus), [allMine, fStatus]);
  const sel = myRooms.find(r => r.id === selId) ?? myRooms[0];
  const cntS = (s: 'all' | 'ongoing' | 'done') =>
    allMine.filter(r => s === 'all' || r.status === s).length;

  // 發言者選擇 — 管理員為基礎自設關係的所有成員（+自由建立時則為所有自設角色），
  // 會員則只有被授予權限（grants — 角色扮演遊玩／編輯）的角色（第 3 層會員-角色連結，v1.9）
  const rel = rels.find(r => r.id === sel?.relId);
  /* 這個房間使用哪個 AU (v2.0 使用者要求) — 將房間內使用的角色全部
     替換成該 AU 個人資料。發言者選擇·對話框·房間副標題都會讀取這個列表，
     因此只要修改一個地方就會全部跟著變更。沒有 AU 時則維持原本列表（參照也相同）。

     **Key 是 `自設關係id:AU id`** (v2.0 使用者發現 — 「選了 AU 但名稱·照片還是原本的」)。
     角色的 AU 個人資料是每個自設關係分開儲存的值，因此前面會加上自設關係 id。
     一開始只傳入 AU id，找不到個人資料後就靜默退回原始資料 — 改成與自設關係詳細頁相同的方式。 */
  const auCharKey = sel?.relId && sel?.auId && sel.auId !== 'base' ? `${sel.relId}:${sel.auId}` : null;
  const rpChars = useMemo(
    () => (auCharKey ? chars.map(c => charWithAu(c, auCharKey)) : chars),
    [chars, auCharKey],
  );
  const speakChars = useMemo(() => {
    if (rel) {
      const members = rel.members.map(m => rpChars.find(c => c.id === m.charId)).filter(Boolean) as Character[];
      return isAdmin ? members : members.filter(c => !!charGrant(c, user?.id));
    }
    return isAdmin ? rpChars.filter(c => c.own) : rpChars.filter(c => !!charGrant(c, user?.id));
  }, [rel, rpChars, isAdmin, user?.id]);

  const [speaker, setSpeaker] = useState<string>('');   // charId | 'desc'（已移除玩家發言，v2.0）
  const [pickOpen, setPickOpen] = useState(false);
  useEffect(() => { setSpeaker(speakChars[0]?.id ?? 'desc'); setPickOpen(false); }, [sel?.id, speakChars]);

  // 進入時標記為已讀（解除 N 標記）— 只記錄在瀏覽器中 (v2.0)。
  // 以前寫入房間文件的 lastRead，因此只要打開查看房間就會 UPDATE 別人的房間，
  // 所以規則禁止參與者這樣做（標記無法消失）。閱讀時間原本就是每個人各自不同的值。
  useEffect(() => {
    if (!sel || !user) return;
    rpMarkRead(sel.id, user.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel?.id, user?.id, msgRows.length]);

  // 新訊息 → 捲動至最下方
  const msgsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = msgsRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [sel?.id, msgRows.length]);

  const [text, setText] = useState('');
  const send = () => {
    if (!sel || !user) return;
    let t = text.trim();
    if (!t) return;
    let kind: RpMessage['kind'] = speaker === 'desc' ? 'desc' : 'char';
    if (t.startsWith('/desc ')) { kind = 'desc'; t = t.slice(6).trim(); } // /desc 指令 (v1.8)
    if (!t) return;
    const m: RpMessage = {
      id: newId(), kind, charId: kind === 'char' ? speaker : undefined,
      // 發言當下的擁有者紀錄 — 即使角色被刪除，也能在重新連結時判斷要從哪個列表選擇 (v1.9)
      charOwn: kind === 'char' ? rpChars.find(c => c.id === speaker)?.own : undefined,
      authorId: user.id, text: t, date: new Date().toISOString(),
    };
    // 不碰房間 — 發言只儲存為自己的資料列 (v2.0)
    setMsgRows([...msgRows, { ...m, roomId: sel.id }]);
    rpMarkRead(sel.id, user.id, m.date);
    setText('');
    // 通知 (4.13) — 傳送給除自己以外的參與者，並以房間為單位合併（Discord DM 在機器人連結時）
    memberIdsOf(sel).filter(id => id !== user.id).forEach(id =>
      pushNotif({
        type: 'rp', toUserId: id, href: '/rp', dedupeKey: `rp:${sel.id}`,
        title: `角色扮演「${sel.title}」新訊息`,
        body: t.slice(0, 60),
      }));
  };

  // 訊息修改（本人）— Modal
  const [editMsg, setEditMsg] = useState<RpMessage | null>(null);
  const [editText, setEditText] = useState('');
  const saveMsg = () => {
    if (!sel || !editMsg) return;
    if (!editText.trim()) { toast('請輸入內容'); return; }
    const t = editText.trim();
    if (msgRows.some(x => x.id === editMsg.id)) {
      setMsgRows(msgRows.map(x => (x.id === editMsg.id ? { ...x, text: t } : x)));
    } else {
      setRooms(rooms.map(r => r.id === sel.id
        ? { ...r, messages: r.messages.map(m => m.id === editMsg.id ? { ...m, text: t } : m) } : r));
    }
    setEditMsg(null);
  };
  const removeMsg = (m: RpMessage) => {
    if (!sel) return;
    del.ask('確定要刪除這則訊息嗎？', () => {
      if (msgRows.some(x => x.id === m.id)) setMsgRows(msgRows.filter(x => x.id !== m.id));
      else setRooms(rooms.map(r => r.id === sel.id
        ? { ...r, messages: r.messages.filter(x => x.id !== m.id) } : r));
    });
  };

  // 建立房間 Modal
  const [newOpen, setNewOpen] = useState(false);
  const [nTitle, setNTitle] = useState('');
  const [nRel, setNRel] = useState('none');
  const [nAu, setNAu] = useState('base');   // 所選自設關係的 AU (v2.0 使用者要求)
  const [nMembers, setNMembers] = useState<string[]>([]);
  const pool = useMembers();
  // 建立 Modal 中要顯示的自動參與者（排除建立者）— 以權限者名稱顯示 (v2.0)
  const newRelGrantNames = (() => {
    if (nRel === 'none') return [] as string[];
    const ids = rpMemberIds(
      { relId: nRel, createdBy: user?.id ?? '', memberIds: [] } as unknown as RpRoom, rels, chars);
    return ids.filter(id => id !== user?.id)
      .map(id => pool.find(pp => pp.id === id)?.nickname ?? id);
  })();
  // 所選自設關係的 AU 列表（預設設定那一列由上方選擇器直接加入）
  const newRelAus = (rels.find(r => r.id === nRel)?.aus ?? []).filter(a => a.id !== 'base');
  const createRoom = () => {
    if (!user) return;
    if (!nTitle.trim()) { toast('請輸入房間標題'); return; }
    const members = Array.from(new Set([user.id, ...nMembers]));
    const room: RpRoom = {
      id: newId(), title: nTitle.trim(), relId: nRel === 'none' ? undefined : nRel,
      // 如果是原始設定(base)則不保留 — 與舊房間相同的樣子，也更容易還原
      auId: nRel !== 'none' && nAu !== 'base' ? nAu : undefined,
      memberIds: members, status: 'ongoing', isPublic: false,
      createdBy: user.id, created: new Date().toISOString(), lastRead: {}, messages: [],
    };
    setRooms([room, ...rooms]);
    setSelId(room.id);
    setNewOpen(false);
    setNTitle(''); setNRel('none'); setNMembers([]);
  };

  const canManage = sel && user && (sel.createdBy === user.id || isAdmin);
  const [endAsk, setEndAsk] = useState(false); // 完結確認 — 因為不是刪除，所以使用專用 Modal

  // 已解除連結（已刪除）的角色 — 如果仍有發言，則重新連結到其他角色 (v1.9)
  // own 與畫面顯示規則相同，統一正規化為 !!charOwn — 如果沒有紀錄則視為左側（對方）(v1.9 錯誤修正：
  // 原本顯示在左側的已刪除角色，RELINK 候選卻顯示了我的角色列表)
  const brokenChars = useMemo(() => {
    if (!sel) return [] as { charId: string; own: boolean }[];
    const map = new Map<string, boolean>();
    for (const m of msgsOf(sel)) {
      if (m.kind === 'char' && m.charId && !chars.some(c => c.id === m.charId) && !map.has(m.charId)) {
        map.set(m.charId, !!m.charOwn);
      }
    }
    return [...map.entries()].map(([charId, own]) => ({ charId, own }));
  }, [sel, chars]);
  const [relinkOpen, setRelinkOpen] = useState(false);
  const [relinkSel, setRelinkSel] = useState<Record<string, string>>({});
  // 替代候選 — 必須是相同區域（own）的角色 (v1.9 錯誤修正，使用者發現)
  // 自設關係成員列表中也包含我的角色，因此對方區域候選原本會出現我的角色，
  // 選擇後就會造成雙方台詞合併成同一個角色的問題 → 先依擁有者區分篩選。
  const relinkCands = (own: boolean): Character[] => {
    const sameSide = (c: Character) => !!c.own === own;
    const relList = rel
      ? (rel.members.map(mm => rpChars.find(c => c.id === mm.charId)).filter(Boolean) as Character[]).filter(sameSide)
      : [];
    return relList.length ? relList : chars.filter(sameSide);
  };
  // 已經在此房間中發言的角色 — 選擇後台詞會合併，因此顯示提示 (v1.9)
  const speakingIds = useMemo(() => new Set(
    (sel ? msgsOf(sel) : []).filter(m => m.kind === 'char' && m.charId).map(m => m.charId as string)), [sel, msgRows]);
  const applyRelink = () => {
    if (!sel) return;
    const picked = Object.entries(relinkSel).filter(([, v]) => v);
    if (picked.length === 0) { setRelinkOpen(false); return; }
    const relink = <M extends RpMessage>(m: M): M => {
      const nid = m.charId ? relinkSel[m.charId] : undefined;
      if (!nid) return m;
      return { ...m, charId: nid, charOwn: rpChars.find(c => c.id === nid)?.own };
    };
    setMsgRows(msgRows.map(x => (x.roomId === sel.id ? relink(x) : x)));
    setRooms(rooms.map(r => (r.id === sel.id ? { ...r, messages: r.messages.map(relink) } : r)));
    setRelinkOpen(false);
    setRelinkSel({});
    toast('角色已重新連結');
  };
  const patchRoom = (p: Partial<RpRoom>) => {
    if (!sel) return;
    setRooms(rooms.map(r => r.id === sel.id ? { ...r, ...p } : r));
  };
  const removeRoom = () => {
    if (!sel) return;
    const count = msgsOf(sel).length;
    del.ask(`「${sel.title}」房間確定要刪除嗎？`, () => {
      setRooms(rooms.filter(r => r.id !== sel.id));
      setMsgRows(msgRows.filter(x => x.roomId !== sel.id));   // 附帶的發言也一併刪除 (v2.0)
      setSelId(null);
    }, `連同 ${count} 則對話也會一併刪除。`);
  };

  // 匯出完結日誌 HTML (4.9 — 可附加到 TRPG 備份的格式)
  const exportHtml = () => {
    if (!sel) return;
    const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br>');
    const rows = msgsOf(sel).map(m => {
      if (m.kind === 'desc') {
        return `<p style="text-align:center;color:#4a505a;line-height:1.8;margin:14px 0">${esc(m.text)}</p>`;
      }
      const ch = rpChars.find(c => c.id === m.charId);
      const name = ch?.name ?? '';
      const color = ch?.color ?? '#5d636d';
      return `<div style="margin:10px 0;line-height:1.7"><b style="color:${color};letter-spacing:.05em">${esc(name)}</b> — ${esc(m.text)}</div>`;
    }).join('\n');
    const html = `<div style="font-family:sans-serif;max-width:720px;margin:0 auto">
<h2 style="letter-spacing:.08em">${esc(sel.title)}</h2>
${rows}
</div>`;
    const u = URL.createObjectURL(new Blob([html], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = u; a.download = `${sel.title}.html`;
    a.click();
    URL.revokeObjectURL(u);
  };

  if (!loaded) return <section className="page" />;

  if (!user) {
    return (
      <section className="page">
        {/* 未登入提示 — 管理員可以修改文字 (v1.9)，標題顯示選項中也會一直顯示 */}
        <div className="page-head"><PageTitle>ROLEPLAY</PageTitle>
          <EditableDesc k="rp-gate-desc" def="角色扮演僅向已登入的參與者顯示" always /></div>
      </section>
    );
  }

  const relName = (id?: string) => rels.find(r => r.id === id)?.name;
  // 顯示以角色為基準（原型 — "ALLOW 基礎 · ALONE · WOOD"）· 會員帳號僅用於存取權限，不會顯示
  const relCharNames = (relId?: string) => {
    const rel = rels.find(r => r.id === relId);
    if (!rel) return [];
    return rel.members
      .map(m => rpChars.find(c => c.id === m.charId)?.name)
      .filter(Boolean) as string[];
  };
  /** 房間副標題 (v2.0 使用者確認) — 雙人時只顯示兩個角色名稱，多人自設關係則只顯示自設關係名稱。
   *  不加入「~基礎」等多餘文字，也不顯示會員帳號 */
  const roomLabel = (r: RpRoom) => {
    const rel = rels.find(x => x.id === r.relId);
    if (!rel) return '自由建立';
    const names = relCharNames(r.relId);
    const isPair = rel.kind === 'pair' || rel.members.length === 2;
    return isPair && names.length ? names.join(' · ') : rel.name;
  };
  const roomSub = (r: RpRoom) => [
    roomLabel(r),
    r.status === 'done' ? (r.isPublic ? '完結 · 已切換公開' : '完結') : '進行中',
  ].join(' · ');

  // 不在畫面顯示會員帳號（擁有者）名稱 — 帳號僅用於存取權限 (v2.0 使用者要求)。
  const speakerLabel = speaker === 'desc' ? '敘述 (DESC)' : (rpChars.find(c => c.id === speaker)?.name ?? '');
  const speakerChar = rpChars.find(c => c.id === speaker);

  return (
    <section className={`page page-rp ${mFocus ? 'rp-focus' : ''}`}>
      <div className="page-head">
        <PageTitle>ROLEPLAY</PageTitle>
        <EditableDesc k="rp-desc" def="即時聊天型 · 僅向參與者顯示存在 · 選擇角色發言" />
      </div>

      <div className={`rp-layout ${mListOpen ? 'mopen' : ''}`}>
        {/* 手機專用收合列 — 點擊後展開房間列表·狀態篩選 (v1.9) */}
        <button type="button" className="rp-mfold" onClick={() => setMListOpen(o => !o)}>
          <b>{sel ? sel.title : '房間列表'}</b>
          <small>MY ROOMS {myRooms.length} {mListOpen ? '▴' : '▾'}</small>
        </button>
        {/* 房間列表 — 僅顯示我參與的房間 · 標題固定，只有列表內部捲動 */}
        <div className="panel rp-rooms">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 6px 12px', flexShrink: 0 }}>
            <b style={{ fontSize: 12, letterSpacing: '.1em', color: 'var(--sub)' }}>MY ROOMS</b>
            <button className="btn btn-dark" style={{ padding: '0 12px', height: 30, fontSize: 11 }}
              onClick={() => setNewOpen(true)}>＋ NEW ROOM</button>
          </div>
          <div className="rp-rooms-list">
            {myRooms.map(r => (
              <div key={r.id} className={`rp-room ${sel?.id === r.id ? 'on' : ''}`}
                onClick={() => { setSelId(r.id); setMListOpen(false); }}>
                <b>{r.title} {rpHasNew(r, user.id, msgsOf(r)) && sel?.id !== r.id && <span className="new">N</span>}</b>
                <small>{roomSub(r)}</small>
              </div>
            ))}
            {myRooms.length === 0 && (
              <p className="hint" style={{ padding: '10px 6px 0' }}>
                {fStatus === 'all' ? '目前沒有參與中的房間' : '目前沒有此狀態的房間'}
              </p>
            )}
          </div>
        </div>

        {/* 聊天 */}
        <div className="panel rp-chat">
          {sel ? (
            <>
              <div className="rp-head">
                <div>
                  <b>{sel.title}</b>
                  <small>{roomLabel(sel)}</small>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span className="pill">{sel.status === 'done' ? (sel.isPublic ? '完結 · 公開' : '完結') : '進行中'}</span>
                  {/* 如果有已刪除的角色，則重新連結 (v1.9) */}
                  {canManage && brokenChars.length > 0 && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, color: 'var(--accent)' }}
                      onClick={() => setRelinkOpen(true)}>RELINK</button>
                  )}
                  {canManage && sel.status === 'ongoing' && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                      onClick={() => setEndAsk(true)}>END</button>
                  )}
                  {canManage && sel.status === 'done' && (
                    <>
                      {/* 取消完結 — 恢復為進行中（如果原本是公開狀態則恢復為私密） */}
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                        onClick={() => patchRoom({ status: 'ongoing', isPublic: false })}>REOPEN</button>
                      {/* 切換公開 — 參與者全員同意流程會在 Supabase 連結後啟用（目前為建立者／管理員切換） */}
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                        onClick={() => patchRoom({ isPublic: !sel.isPublic })}>
                        {sel.isPublic ? 'UNPUBLISH' : 'PUBLISH'}
                      </button>
                      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                        onClick={exportHtml}>EXPORT</button>
                    </>
                  )}
                  {canManage && (
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                      onClick={removeRoom}>DELETE</button>
                  )}
                </div>
              </div>

              <div className="rp-msgs" ref={msgsRef}>
                {msgsOf(sel).map(m => {
                  const mine = m.authorId === user.id;
                  if (m.kind === 'desc') {
                    return (
                      <div key={m.id} className="msg-desc">
                        {m.text}
                        {mine && (
                          <span className="m-act">
                            <button onClick={() => { setEditMsg(m); setEditText(m.text); }}>EDIT</button>
                            <button onClick={() => removeMsg(m)}>DEL</button>
                          </span>
                        )}
                      </div>
                    );
                  }
                  const ch = rpChars.find(c => c.id === m.charId);
                  const name = ch?.name ?? '';
                  // 區域以「查看者」為基準 (v2.0 使用者確認)：我擁有權限的角色在右側，
                  // 沒有權限的角色在左側。管理員的自設角色（own）就是自己的角色。
                  // 因此即使是同一個房間，不同的人看到的左右位置也會相反（各自的角色在右側）。
                  // 已刪除的角色則根據發言當時的紀錄（charOwn）判斷。
                  const rightSide = ch
                    ? (!!charGrant(ch, user.id) || (!!ch.own && isAdmin))
                    : (!!m.charOwn && isAdmin);
                  return (
                    <div key={m.id} className={`msg ${rightSide ? 'me' : ''}`} style={{ ['--cc' as string]: hexRgb(ch?.color) }}>
                      <Face ch={ch} className="face" />
                      <div>
                        <div className="who">{name}</div>
                        <div className="bub">{m.text}</div>
                        <div style={{ fontSize: 9, color: 'var(--faint)', marginTop: 3 }}>{fmtHM(m.date)}</div>
                      </div>
                      {mine && (
                        <span className="m-act">
                          <button onClick={() => { setEditMsg(m); setEditText(m.text); }}>EDIT</button>
                          <button onClick={() => removeMsg(m)}>DEL</button>
                        </span>
                      )}
                    </div>
                  );
                })}
                {msgsOf(sel).length === 0 && (
                  <p className="hint" style={{ textAlign: 'center', marginTop: 30 }}>留下第一則訊息吧</p>
                )}
              </div>

              {sel.status === 'ongoing' && (
                <div className="rp-input">
                  {/* 發言者選擇 — 角色／敘述 (v2.0 使用者確認：角色扮演只需要這兩種) */}
                  <div className="char-pick" onClick={() => setPickOpen(o => !o)}>
                    {speaker === 'desc'
                      ? <div className="f" style={{ display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--sub)' }}>❝</div>
                      : <Face ch={speakerChar} className="f" />}
                    <small>{speakerLabel} ▾</small>
                    {pickOpen && (
                      <div className="rp-pick-pop" onClick={e => e.stopPropagation()}>
                        {speakChars.map(c => (
                          <button key={c.id} onClick={() => { setSpeaker(c.id); setPickOpen(false); }}>
                            <Face ch={c} className="f" />{c.name}
                          </button>
                        ))}
                        <button onClick={() => { setSpeaker('desc'); setPickOpen(false); }}>
                          <span className="f" style={{ display: 'grid', placeItems: 'center', color: 'var(--sub)' }}>❝</span>
                          敘述 (DESC)
                        </button>
                      </div>
                    )}
                  </div>
                  {/* 無佔位文字 (v1.8) · Enter 傳送 / Shift+Enter 換行 · 支援 /desc 指令
                      聚焦時手機只顯示角色扮演區域 (v1.9 — 延遲 blur 是為了避免 SEND 點擊失效) */}
                  <KTextarea style={{ minHeight: 44 }} value={text} onChange={e => setText(e.target.value)}
                    onFocus={() => setMFocus(true)}
                    onBlur={() => setTimeout(() => setMFocus(false), 180)}
                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  <button className="btn btn-dark" onClick={send}>SEND</button>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
              <p className="hint">建立房間後，聊天會顯示在這裡</p>
            </div>
          )}
        </div>

        {/* 右側狀態篩選 — 分別查看進行中／完結 */}
        {/* align-self 使用 CSS 控制 — PC 網格中為 start（靠上對齊），手機垂直排列時為 stretch（全寬）。
            如果保留 inline start，手機版會縮成內容寬度（v2.0 使用者回報） */}
        <div className="panel tagside" style={{ padding: 16 }}>
          <h4>狀態</h4>
          {/* 預設為進行中 — 進行中／全部／完結順序（使用者確認） */}
          <div className={`tag ${fStatus === 'ongoing' ? 'on' : ''}`} onClick={() => setFStatus('ongoing')}>
            進行中 <small>{cntS('ongoing')}</small>
          </div>
          <div className={`tag ${fStatus === 'all' ? 'on' : ''}`} onClick={() => setFStatus('all')}>
            全部 <small>{cntS('all')}</small>
          </div>
          <div className={`tag ${fStatus === 'done' ? 'on' : ''}`} onClick={() => setFStatus('done')}>
            完結 <small>{cntS('done')}</small>
          </div>
        </div>
      </div>

      {/* 建立房間 — 標題 + 基礎自設關係（選填）+ 參與會員 (4.9) */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} small title="建立角色扮演房間"
        desc="未參與者看不到房間的存在" dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setNewOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={createRoom}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 11 }}>
          <div>
            <label className="k-label" style={{ marginBottom: 5 }}>Title</label>
            <KInput value={nTitle} onChange={e => setNTitle(e.target.value)} />
          </div>
          {/* 基礎自設關係 + 該自設關係的 AU (v2.0 使用者要求) — 選擇 AU 後，房間內的角色會
              以該 AU 個人資料（名稱·顏色·圖片）顯示。沒有 AU 的自設關係不會顯示旁邊的欄位 */}
          <div>
            <label className="k-label" style={{ marginBottom: 5 }}>基礎自設關係（選填）</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <KSelect value={nRel} onChange={v => { setNRel(v); setNAu('base'); }}
                minWidth={160}
                options={[{ value: 'none', label: '自由建立（無自設關係）' }, ...rels.map(r => ({ value: r.id, label: r.name }))]} />
              {newRelAus.length > 0 && (
                <KSelect value={nAu} onChange={setNAu} minWidth={140}
                  options={[{ value: 'base', label: '原始設定' },
                    ...newRelAus.map(a => ({ value: a.id, label: a.label || 'AU' }))]} />
              )}
            </div>
          </div>
          <div>
            <label className="k-label" style={{ marginBottom: 7 }}>參與會員</label>
            {nRel === 'none' ? (
              /* 自由建立時才由使用者直接選擇 */
              <div style={{ display: 'grid', gap: 8 }}>
                {pool.filter(p => p.id !== user.id).map(p => (
                  <KCheck key={p.id} label={p.nickname}
                    checked={nMembers.includes(p.id)}
                    onChange={v => setNMembers(ms => v ? [...ms, p.id] : ms.filter(x => x !== p.id))} />
                ))}
              </div>
            ) : (
              /* 以自設關係為基礎時，該自設關係角色的權限者會自動參與 (v2.0 使用者確認) —
                 之後即使權限轉移給其他人，也會跟著這個房間同步 */
              <p className="hint" style={{ margin: 0 }}>
                {newRelGrantNames.length
                  ? `擁有此自設關係角色權限的會員會自動參與 — ${newRelGrantNames.join(' · ')}`
                  : '目前還沒有會員取得此自設關係角色的權限 — 可在角色編輯的「會員權限」中指定，之後也會自動套用到此房間'}
              </p>
            )}
          </div>
        </div>
      </Modal>

      {/* 訊息修改（本人） */}
      <Modal open={editMsg !== null} onClose={() => setEditMsg(null)} small title="修改訊息" dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEditMsg(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveMsg}>SAVE</button>
        </>}>
        <KTextarea style={{ minHeight: 100 }} value={editText} onChange={e => setEditText(e.target.value)} />
      </Modal>
      {/* 重新連結角色 — 將已刪除角色的發言移至其他角色 (v1.9) */}
      <Modal open={relinkOpen} onClose={() => setRelinkOpen(false)} small title="重新連結角色"
        desc="將已解除連結角色的發言移至其他角色 — 只能選擇相同區域（左側／右側）的角色" dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setRelinkOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={applyRelink}>APPLY</button>
        </>}>
        <div style={{ display: 'grid', gap: 12 }}>
          {brokenChars.map(b => (
            <div key={b.charId}>
              <label className="k-label" style={{ marginBottom: 5 }}>
                已刪除角色 — {b.own ? '我的角色區域（只能選擇我的角色）' : '對方區域（只能選擇對方角色）'}
              </label>
              <KSelect value={relinkSel[b.charId] ?? ''} onChange={v => setRelinkSel(s => ({ ...s, [b.charId]: v }))}
                options={[
                  { value: '', label: '不選擇' },
                  // 如果選擇已經在發言的角色，台詞會合併，因此顯示提示 (v1.9 使用者回饋)
                  ...relinkCands(b.own).map(c => ({
                    value: c.id,
                    label: speakingIds.has(c.id) ? `${c.name} — 已在發言中（台詞會合併）` : c.name,
                  })),
                ]} />
            </div>
          ))}
        </div>
      </Modal>

      {/* 完結確認（不是刪除 — END/CANCEL） */}
      <ConfirmModal open={endAsk} title="確定要將角色扮演標記為完結嗎？"
        body="完結後可以使用公開切換與日誌匯出功能。"
        onClose={() => setEndAsk(false)}
        buttons={[
          { label: 'END', kind: 'dark', onClick: () => { patchRoom({ status: 'done' }); setEndAsk(false); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setEndAsk(false) },
        ]} />
      {del.element}
    </section>
  );
}