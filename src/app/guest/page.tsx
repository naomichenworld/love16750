'use client';
// 訪客留言（4.7）— 允許訪客撰寫（暱稱） · 私密文章 · 回覆（全部開放，v2.0）
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, GUEST_SEED, GuestEntry, newId, fmtDate, Comment,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import { KInput, KTextarea, KCheck, SearchBar, Pager } from '@/components/ui/Kit';
import { GuestIdBar } from '@/components/ui/GuestId';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';
import { pushNotif, notifyAdmins } from '@/lib/notifStore';

export default function GuestbookPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [entries, setEntries] = useLocalList<GuestEntry>('ohome.guest.v1', GUEST_SEED);
  /* 回覆與文章分開儲存（v2.0 Fork 回報 —「除了管理員以外都不能回覆」）。
     之前回覆是放在訪客留言文章**裡面**，因此必須 UPDATE 別人的文章，而伺服器只允許
     作者・管理員進行這個操作 — 所以變成只有管理員能回覆。像留言一樣儲存成自己的文件，
     登入會員與未登入訪客都可以用自己的權限留下回覆。 */
  const [cmtRows, setCmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const [body, setBody] = useState('');
  const [secret, setSecret] = useState(false);
  const [gName, setGName] = useState('');
  const [q, setQ] = useState('');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyName, setReplyName] = useState('');   // 訪客回覆暱稱
  const [delFor, setDelFor] = useState<string | null>(null);
  const del = useConfirmDelete();                   // 回覆刪除確認

  const leave = () => {
    if (!body.trim()) { toast('請輸入內容'); return; }
    if (!user && !gName.trim()) { toast('請輸入暱稱'); return; }
    const e: GuestEntry = {
      id: newId(),
      author: user ? user.nickname : gName.trim(),
      authorId: user?.id,
      body: body.trim(), secret, date: new Date().toISOString(), reply: null,
    };
    /* **加在後面**（v2.0 使用者發現 —「無法儲存訪客留言 · 沒有權限」）。
       如果放在前面，既有文章的順序編號會全部往後移一格，因此儲存階段會把它們全部
       視為「修改」。而修改只有登入者可以執行，因此**未登入訪客只有在訪客留言為空時
       才能留言。**留言原本就是加在後面，所以沒有這個問題。
       畫面上的 visible 會按照日期降冪排序，因此新文章仍然會出現在最上方。 */
    setEntries([...entries, e]);
    setBody(''); setSecret(false); setGName('');
    toast('訪客留言已登錄');
    // 通知（4.13）— 發送給管理員（notifyAdmins 會排除本人）。
    // 之前把接收者寫成 'admin'（Mock ID），因此伺服器模式下無法發送給實際管理員（v2.0）
    notifyAdmins({
      type: 'guest', href: '/guest',
      title: '訪客留言有新文章',
      body: `${e.author} — ${e.secret ? '私密文章' : e.body.slice(0, 50)}`,
    });
  };

  const canRead = (e: GuestEntry) => !e.secret || isAdmin || (e.authorId && e.authorId === user?.id);

  const doDelete = () => {
    const e = entries.find(x => x.id === delFor);
    if (!e) return;
    // 訪客文章只有管理員可以刪除（v2.0 使用者確認）— 伺服器只能接受這種方式
    const allowed = isAdmin || (!!e.authorId && e.authorId === user?.id);
    if (!allowed) { toast('沒有刪除權限'); return; }
    setEntries(entries.filter(x => x.id !== delFor));
    // 附帶的回覆也一併刪除 — 因為分開儲存，留下它會變成沒有主文章的回覆（v2.0）
    setCmtRows(cmtRows.filter(c => !(c.target === 'guest' && c.targetId === e.id)));
    setDelFor(null);
    toast('已刪除');
  };

  /* 登錄回覆 — 全部開放（v2.0 Fork 回報）。儲存成自己的文件，因此不會碰到他人的文章 */
  const saveReply = () => {
    const target = entries.find(x => x.id === replyFor);
    if (!target || !replyText.trim()) return;
    if (!user && !replyName.trim()) { toast('請輸入暱稱'); return; }
    const c: CommentRow = {
      id: newId(), target: 'guest', targetId: target.id,
      text: replyText.trim(), date: new Date().toISOString(),
      author: user ? user.nickname : replyName.trim(), authorId: user?.id ?? '',
    };
    setCmtRows([...cmtRows, c]);
    setReplyFor(null); setReplyText('');
    // 通知（4.13）— 如果是會員寫的訪客留言，通知該會員（排除自己的回覆）
    const me = user?.id ?? '';
    if (target.authorId && target.authorId !== me) {
      pushNotif({
        type: 'comment', toUserId: target.authorId, href: '/guest',
        title: '你的訪客留言有新回覆',
        body: `${c.author} — ${c.text.slice(0, 50)}`,
      });
    }
    // 也通知先前回覆過這篇文章的會員（v2.0 Fork 回報 — 之前參與對話的會員收不到通知）
    const seen = new Set<string>();
    for (const t of repliesOf(target.id)) {
      const to = t.authorId;
      if (!to || to === me || to === target.authorId || seen.has(to)) continue;
      seen.add(to);
      pushNotif({
        type: 'comment', toUserId: to, href: '/guest',
        title: '你參與的訪客留言對話有新回覆',
        body: `${c.author} — ${c.text.slice(0, 50)}`,
      });
    }
  };
  const repliesOf = (id: string) => commentsFor(cmtRows, 'guest', id);
  // 刪除回覆 — 管理員或本人（會員）。訪客回覆只有管理員可以刪除（伺服器只能接受這種方式）
  const removeReply = (c: Comment) =>
    del.ask('確定要刪除這則回覆嗎？', () => setCmtRows(cmtRows.filter(x => x.id !== c.id)));

  // 最新文章在上方 — 因為儲存時加在後面（見上方），所以顯示時按照日期降冪排列
  const visible = (q
    ? entries.filter(e => canRead(e) && (e.body.includes(q) || e.author.includes(q)))
    : entries
  ).slice().sort((a, b) => b.date.localeCompare(a.date));

  // 訪客留言累積後分頁（v2.0 使用者要求）— 每頁 15 篇。
  // 因為有回覆後單篇高度會變長，所以比橡果（12 篇）稍微多一點。
  const PER_GB = 15;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(visible.length / PER_GB));
  const cur = Math.min(page, pages);      // 搜尋・刪除後數量減少導致頁面消失時，拉回最後一頁
  const start = (cur - 1) * PER_GB;
  useEffect(() => { setPage(1); }, [q]);  // 搜尋文字變更時從第一頁開始

  return (
    <section className="page">
      <div className="page-head"><PageTitle>GUESTBOOK</PageTitle><EditableDesc k="guest-desc" def="允許訪客撰寫選項 · 私密文章 · 管理員回覆" /></div>

      {/* 撰寫 */}
      <div className="panel" style={{ marginBottom: 16 }}>
        <KTextarea placeholder="請留下訪客留言" value={body} onChange={e => setBody(e.target.value)} />
        {!user && (
          /* 訪客身分 — 靠右對齊（v1.9 使用者要求），共用精簡 GUEST 列 UI */
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <GuestIdBar name={gName} onName={setGName}
              style={{ width: '100%', maxWidth: 380 }} />
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          <KCheck label={<span style={{ fontSize: 12 }}>私密文章（僅管理員可查看）</span>} checked={secret} onChange={setSecret} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SearchBar light onSearch={setQ} />
            <button className="btn btn-dark" onClick={leave}>LEAVE</button>
          </div>
        </div>
      </div>

      {/* 列表 */}
      <div className="panel flush">
        {visible.slice(start, start + PER_GB).map(e => (
          <div className="gb-item" key={e.id}>
            <div className="hd">
              {canRead(e)
                ? <b>{e.secret && '🔒 '}{e.author}</b>
                : <b style={{ color: 'var(--faint)' }}>🔒 私密文章</b>}
              <small>
                {fmtDate(e.date)}
                {/* 回覆全部開放（v2.0 Fork 回報）— 私密文章只有可以閱讀的人能回覆 */}
                {canRead(e) && (
                  <span style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 10, color: 'var(--accent)' }}
                    onClick={() => { setReplyFor(e.id); setReplyText(''); }}>
                    回覆
                  </span>
                )}
                {(isAdmin || (!!e.authorId && e.authorId === user?.id)) && (
                  <span style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 8 }} onClick={() => setDelFor(e.id)}>刪除</span>
                )}
              </small>
            </div>
            <p style={!canRead(e) ? { color: 'var(--faint)' } : undefined}>
              {canRead(e) ? e.body : '僅管理員可以查看的文章。'}
            </p>
            {/* 舊方式（文章內的管理員回覆）也繼續顯示 — 已存在的資料（v2.0） */}
            {e.reply && canRead(e) && (
              <div className="reply"><b>↳ {e.reply.author}</b>{e.reply.text}</div>
            )}
            {canRead(e) && repliesOf(e.id).map(c => (
              <div className="reply" key={c.id}>
                <b>↳ {c.author}</b>{c.text}
                {(isAdmin || (!!c.authorId && c.authorId === user?.id)) && (
                  <span style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 8, fontSize: 10.5, color: 'var(--faint)' }}
                    onClick={() => removeReply(c)}>刪除</span>
                )}
              </div>
            ))}
          </div>
        ))}
        {visible.length === 0 && (
          <div style={{ padding: 36, textAlign: 'center', fontSize: 12.5, color: 'var(--faint)' }}>目前還沒有訪客留言</div>
        )}
      </div>
      {visible.length > PER_GB && <Pager page={cur} total={pages} onChange={setPage} />}

      {/* 回覆 Modal — 全部開放（v2.0 Fork 回報），訪客使用暱稱 */}
      <Modal open={replyFor !== null} onClose={() => setReplyFor(null)} small title="回覆"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setReplyFor(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveReply}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          {!user && <KInput placeholder="暱稱" value={replyName} onChange={e => setReplyName(e.target.value)} />}
          <KTextarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="回覆內容" />
        </div>
      </Modal>
      {del.element}

      {/* 刪除確認 — 訪客文章只有管理員可以刪除，因此不詢問密碼（v2.0） */}
      <Modal open={delFor !== null} onClose={() => setDelFor(null)} small title="刪除訪客留言"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setDelFor(null)}>CANCEL</button>
          <button className="btn btn-accent" onClick={doDelete}>DELETE</button>
        </>}>
        <p style={{ fontSize: 13, color: 'var(--sub)' }}>要刪除這則訪客留言嗎？</p>
      </Modal>
    </section>
  );
}