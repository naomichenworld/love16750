'use client';
// 圖片留言板載入紀錄（4.10）— 不使用列表，直接依最新順序顯示 · 左側圖片／右側留言 · 即時上傳 · 摺疊
import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter } from '@/lib/sectionStore';
import {
  useLocalList, newId, fmtDate, Comment,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import { RoadItem, ROAD_SEED } from '@/lib/galleryStore';
import { SearchBar, KInput } from '@/components/ui/Kit';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { Modal, ConfirmModal, useConfirmDelete } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { KCheck } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';
import { pushNotif } from '@/lib/notifStore';
import { useMenuSettings, MenuPerm } from '@/lib/menuStore';
import { GuestIdBar } from '@/components/ui/GuestId';
import { fileDrop } from '@/lib/dnd';

const PAGE_SIZE = 4;
const FOLD_LABEL = { spoiler: '劇透', adult: '注意限制級內容' };

function RoadBlock({ item, comments, onComment, onEditComment, onDeleteComment, canComment, guestMode, editLevel, delLevel, canEditItem, canDeleteItem, onEdit, onDelete }: {
  item: RoadItem;
  comments: Comment[];                                  // 這張圖片的留言 — 分離儲存的留言 + 舊項目內的留言（v2.0）
  onComment: (id: string, text: string, guest?: { name: string }, parentId?: string) => void;
  onEditComment: (id: string, cid: string, text: string) => void;
  onDeleteComment: (id: string, cid: string) => void;
  canComment: boolean;
  guestMode: boolean;                                   // 未登入訪客撰寫（暱稱＋密碼 — 與訪客留言 4.7 相同）
  editLevel: (c: Comment) => 'free' | 'pw' | null;      // 修改 — 僅本人（訪客使用密碼）
  delLevel: (c: Comment) => 'free' | 'pw' | null;       // 刪除 — 本人・管理員（訪客使用密碼）
  canEditItem: boolean;                                 // 圖片修改 — 僅作者本人（v1.9）
  canDeleteItem: boolean;                               // 圖片刪除 — 作者・管理員
  onEdit: () => void;
  onDelete: () => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);   // 回覆留言（v2.0 使用者要求）
  const [gName, setGName] = useState('');               // 訪客暱稱
  // 留言內嵌修改（v1.9）
  const [editCid, setEditCid] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  // 訪客留言管理 — 密碼確認 Modal
  const del = useConfirmDelete();
  const folded = item.fold && !open;
  const imgSrc = useBlobUrl(item.imgId ?? item.imgUrl);
  const saveEdit = () => {
    if (editCid && editText.trim()) onEditComment(item.id, editCid, editText.trim());
    setEditCid(null);
  };
  const post = () => {
    if (!text.trim()) return;
    if (guestMode && !gName.trim()) { toast('請輸入暱稱'); return; }
    onComment(item.id, text.trim(), guestMode ? { name: gName.trim() } : undefined, replyTo ?? undefined);
    setText(''); setReplyTo(null);
  };
  // 回覆留言（v2.0 使用者要求）— 與留言板相同的單層回覆
  const roots = comments.filter(c => !c.parentId);
  const childrenOf = (pid: string) => comments.filter(c => c.parentId === pid);
  const askManage = (c: Comment, mode: 'edit' | 'del') => {
    const level = mode === 'edit' ? editLevel(c) : delLevel(c);
    if (level !== 'free') return;
    if (mode === 'edit') { setEditCid(c.id); setEditText(c.text); }
    else del.ask('確定要刪除這則留言嗎？', () => onDeleteComment(item.id, c.id));
  };
  return (
    <div className="panel roadview-item">
      {/* 每張圖片的上方編號區域（v1.9 使用者確認）— 只顯示數字（不顯示標題・作者） */}
      <div className="rv-head">
        <b>No.{String(item.no ?? 0).padStart(3, '0')}</b>
      </div>
      {/* 透明 PNG 也能自然地顯示在卡片顏色上 — 移除硬編碼深色（v1.9 使用者回饋） */}
      <div className={`art ${folded ? 'veil' : ''}`} style={{ background: 'var(--panel-solid)' }}>
        {imgSrc ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={imgSrc} alt={item.title}
            className={`artimg ${item.narrow ? 'narrow' : ''}`} style={{ filter: folded ? 'blur(18px)' : undefined }} />
        ) : (
          <div className={`artimg ${item.narrow ? 'narrow' : ''} ph ${item.ph}`}
            style={{ aspectRatio: item.ratio, filter: folded ? 'blur(18px)' : undefined }}>
            <span>{item.title}</span>
          </div>
        )}
        {folded && (
          <div className="cover" onClick={() => setOpen(true)}>
            <div>
              <b>{item.fold!.type === 'custom' ? (item.fold!.label || '摺疊') : FOLD_LABEL[item.fold!.type]}</b><br />
              <span>點擊後顯示</span>
            </div>
          </div>
        )}
        {(canEditItem || canDeleteItem) && (
          /* 滑鼠移到圖片上時才顯示（.rv-actions — globals.css）· 修改僅限作者，刪除管理員也可以 */
          <div className="rv-actions" style={{ position: 'absolute', top: 12, right: 12, zIndex: 6, display: 'flex', gap: 6 }}>
            {canEditItem && (
              <button style={{ fontSize: 10.5, padding: '5px 11px', borderRadius: 999, background: 'rgba(15,17,20,.55)', color: '#dfe2e7' }}
                onClick={e => { e.stopPropagation(); onEdit(); }}>EDIT</button>
            )}
            {canDeleteItem && (
              <button style={{ fontSize: 10.5, padding: '5px 11px', borderRadius: 999, background: 'rgba(166,58,69,.75)', color: '#fff' }}
                onClick={e => { e.stopPropagation(); onDelete(); }}>DELETE</button>
            )}
          </div>
        )}
      </div>
      <div className="cmt-side">
        <div className="list">
          {/* 回覆留言（v2.0 使用者要求）— 在根留言下方縮排顯示一層回覆 */}
          {roots.flatMap(r => [r, ...childrenOf(r.id)]).map(c => (
            <div className={`cmt ${c.parentId ? 'reply-depth' : ''}`} key={c.id}>
              <b>{c.author}</b><small>{fmtDate(c.date)}</small>
              {editCid !== c.id && (
                <>
                  {canComment && !c.parentId && (
                    <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8 }}
                      onClick={() => setReplyTo(replyTo === c.id ? null : c.id)}>
                      {replyTo === c.id ? '取消回覆' : '回覆'}
                    </small>
                  )}
                  {editLevel(c) !== null && (
                    <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8 }}
                      onClick={() => askManage(c, 'edit')}>修改</small>
                  )}
                  {delLevel(c) !== null && (
                    <small style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 6 }}
                      onClick={() => askManage(c, 'del')}>刪除</small>
                  )}
                </>
              )}
              {editCid === c.id ? (
                <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                  <KInput value={editText} autoFocus onChange={e => setEditText(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditCid(null); }}
                    style={{ flex: 1 }} />
                  <button className="btn btn-dark" style={{ padding: '4px 11px', fontSize: 10.5 }} onClick={saveEdit}>SAVE</button>
                  <button className="btn btn-ghost" style={{ padding: '4px 9px', fontSize: 10.5 }} onClick={() => setEditCid(null)}>✕</button>
                </div>
              ) : (
                <p>{c.text}</p>
              )}
            </div>
          ))}
          {comments.length === 0 && <p className="hint">留下第一則留言吧</p>}
        </div>
        {/* 訪客撰寫（允許訪客）— 分隔線下方垂直排列 GUEST 列＋輸入列 */}
        <div className={`cmt-input ${guestMode && canComment ? 'guest' : ''}`}>
          {guestMode && canComment && (
            <GuestIdBar name={gName} onName={setGName} />
          )}
          <div className="ci-row" style={guestMode && canComment ? undefined : { display: 'contents' }}>
            <KInput placeholder={canComment ? (replyTo ? '撰寫回覆...' : '留下留言...') : '登入後才能留言'} value={text}
              disabled={!canComment}
              onChange={e => setText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') post(); }} />
            <button className="btn btn-dark" disabled={!canComment} onClick={post}>POST</button>
          </div>
        </div>
      </div>
      {del.element}
    </div>
  );
}

function RoadviewPageInner() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  // 上傳・留言權限 3 個等級（4.10 v1.7 — 環境設定 > 選單管理的載入紀錄項目）。
  // 訪客（未登入）實際使用會在 Supabase 匿名處理 — Mock 階段以登入為前提
  const [menuSet] = useMenuSettings();
  const allow = (p: MenuPerm) => (p === 'admin' ? isAdmin : p === 'member' ? !!user : true);
  const [itemsAll, setItemsAll, roadLoaded] = useLocalList<RoadItem>('ohome.road.v1', ROAD_SEED);
  // 多個區段（v2.0）— 只顯示網址的 ?s= 所指向的區段
  const sec = useSectionParam('roadview');
  const items = filterSection(itemsAll, sec.id);
  // 儲存時只替換此區段的位置 — 即使直接傳入篩選後的列表，也不會刪除其他區段
  const setItems = sectionSetter(itemsAll, sec.id, setItemsAll);
  // 留言與項目分開儲存（v2.0）— 如果放在項目裡，留言時需要 UPDATE 項目，因此一般會員無法對別人的圖片留言
  // 與留言板是相同原因
  const [cmtRows, setCmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const [q, setQ] = useState('');
  const [shown, setShown] = useState(PAGE_SIZE);

  // 圖片編號（v1.9）— 沒有編號的既有圖片會按照舊→新順序自動編號
  useEffect(() => {
    if (!roadLoaded) return;
    if (items.some(it => it.no === undefined)) {
      let n = Math.max(0, ...items.map(it => it.no ?? 0));
      const next = [...items].sort((a, b) => a.date.localeCompare(b.date))
        .map(it => (it.no === undefined ? { ...it, no: ++n } : it));
      setItems(items.map(it => next.find(x => x.id === it.id) ?? it));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roadLoaded]);
  // 下一個編號 — 永遠自動增加最大值 +1。跳號・重新排列請在各圖片的編輯 Modal 中修改編號（v1.9）
  const nextNo = Math.max(0, ...items.map(it => it.no ?? 0)) + 1;
  const padNo = (n?: number) => `No.${String(n ?? 0).padStart(3, '0')}`;
  const fileRef = useRef<HTMLInputElement>(null);
  const [editFor, setEditFor] = useState<RoadItem | null>(null);
  const [eNo, setENo] = useState('');      // 修改編號（v1.9 — 不使用標題，只使用編號的系統）
  const [eAdult, setEAdult] = useState(false);
  const [delFor, setDelFor] = useState<RoadItem | null>(null);

  // 即時上傳（v1.7）— IndexedDB 實際儲存（之後連接 R2 時移至伺服器）
  const upload = async (f: File | undefined) => {
    if (!f) return;
    const imgId = await putBlob(f); // IndexedDB 實際儲存 — 重新整理後也會保留
    const it: RoadItem = {
      id: newId(), title: '', author: user!.nickname, authorId: user!.id,
      date: new Date().toISOString(), imgId, ph: '', ratio: 'auto',
      fold: null, comments: [],
      no: nextNo,   // 自動編號（v1.9）
    };
    setItems([it, ...items]);
    toast(`${padNo(it.no)} 已上傳`);
  };

  const addComment = (id: string, text: string, guest?: { name: string }, parentId?: string) => {
    // 訪客留言（訪客權限，v1.9）— 只有暱稱，authorId 為空值。若有 parentId 則為回覆留言（v2.0）
    const base = { id: newId(), text, date: new Date().toISOString(), target: 'road' as const, targetId: id, parentId };
    const c: CommentRow = guest
      ? { ...base, author: guest.name, authorId: '' }
      : { ...base, author: user!.nickname, authorId: user!.id };
    setCmtRows([...cmtRows, c]);
    // 如果是回覆，不只通知根留言作者，而是通知**所有在該對話中回覆過的人**（v2.0 Fork 回報 — 與留言板相同）。
    // 圖片作者會在下方已經收到通知，因此排除
    if (parentId) {
      const target0 = items.find(it => it.id === id);
      const thread = commentsFor(cmtRows, 'road', id, target0?.comments ?? [])
        .filter(x => x.id === parentId || x.parentId === parentId);
      const rootAuthor = thread.find(x => x.id === parentId)?.authorId;
      const seen = new Set<string>();
      for (const t of thread) {
        const to = t.authorId;
        if (!to || to === (user?.id ?? '') || to === target0?.authorId || seen.has(to)) continue;
        seen.add(to);
        pushNotif({
          type: 'comment', toUserId: to, href: '/loadb',
          title: to === rootAuthor ? '我的留言有新回覆' : '你參與的留言有新回覆',
          body: c.author + ' — ' + text.slice(0, 50),
        });
      }
    }
    // 通知（4.13）— 發送給圖片作者（排除自己的留言）
    const target = items.find(it => it.id === id);
    if (target && target.authorId && target.authorId !== (user?.id ?? '')) {
      pushNotif({
        type: 'comment', toUserId: target.authorId, href: '/roadview',
        title: `${padNo(target.no)}有新留言`,   // 通知也以編號為準（v1.9）
        body: `${c.author} — ${text.slice(0, 50)}`,
      });
    }
  };

  // 留言修改・刪除（v1.9）— 管理員・本人可直接操作，訪客留言需要密碼確認（RoadBlock）
  // 同時處理分離儲存的留言與舊項目內的留言（v2.0）
  const editComment = (id: string, cid: string, text: string) => {
    if (cmtRows.some(c => c.id === cid)) setCmtRows(cmtRows.map(c => (c.id === cid ? { ...c, text } : c)));
    else setItems(items.map(it => it.id === id ? { ...it, comments: it.comments.map(c => c.id === cid ? { ...c, text } : c) } : it));
  };
  const deleteComment = (id: string, cid: string) => {
    // 刪除根留言時，附帶的回覆也一併刪除（v2.0）— 留著會變成沒有主人的回覆
    const gone = (c: { id: string; parentId?: string }) => c.id === cid || c.parentId === cid;
    if (cmtRows.some(gone)) setCmtRows(cmtRows.filter(c => !gone(c)));
    if (items.some(it => it.id === id && it.comments.some(gone)))
      setItems(items.map(it => it.id === id ? { ...it, comments: it.comments.filter(c => !gone(c)) } : it));
  };
  /* 修改僅限作者本人 — 管理員也只能刪除他人的留言（v1.9 使用者確認）。
     **訪客留言無法操作**（v2.0 使用者確認）— 移除了透過密碼確認本人的方式。
     因為伺服器只允許登入者修改・刪除，所以實際上原本的功能無法使用。 */
  const editLevel = (c: Comment): 'free' | null => (user && c.authorId === user.id ? 'free' : null);
  const delLevel = (c: Comment): 'free' | null => (isAdmin || (user && c.authorId === user.id) ? 'free' : null);

  const visible = items.filter(it => !q || it.author.includes(q)
    || padNo(it.no).includes(q) || String(it.no ?? '').includes(q));

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'LOAD-B' : sec.name}</PageTitle>
        <EditableDesc k="roadview-desc" def="因為喜歡圖片，所以收集在這裡" />
        <div className="head-actions">
          {allow(menuSet.roadUpload) && !!user && (
            <>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { upload(e.target.files?.[0]); e.target.value = ''; }} />
              <button className="btn btn-dark" onClick={() => fileRef.current?.click()}
                {...fileDrop(fl => upload(fl[0]))}>↑ UPLOAD</button>
            </>
          )}
          <SearchBar onSearch={setQ} />
        </div>
      </div>

      {visible.slice(0, shown).map(it => (
        <RoadBlock key={it.id} item={it} comments={commentsFor(cmtRows, 'road', it.id, it.comments)} onComment={addComment}
          onEditComment={editComment} onDeleteComment={deleteComment}
          canComment={allow(menuSet.roadComment) && (!!user || menuSet.roadComment === 'guest')}
          guestMode={!user && menuSet.roadComment === 'guest'}
          editLevel={editLevel} delLevel={delLevel}
          /* 沒有 authorId 的項目 + 未登入時兩者都是 undefined，因此原本會通過判斷（v2.0 發現）—
             訪客上傳的內容現在只有管理員可以操作（因為沒有訪客身分確認方式） */
          canEditItem={!!it.authorId && it.authorId === user?.id}
          canDeleteItem={isAdmin || (!!it.authorId && it.authorId === user?.id)}
          onEdit={() => { setEditFor(it); setENo(String(it.no ?? '')); setEAdult(it.fold?.type === 'adult'); }}
          onDelete={() => setDelFor(it)} />
      ))}
      {visible.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          目前沒有圖片
        </div>
      )}
      {shown < visible.length && (
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <button className="btn btn-ghost" style={{ background: 'rgba(255,255,255,.9)' }}
            onClick={() => setShown(s => s + PAGE_SIZE)}>MORE ↓</button>
        </div>
      )}
      {/* 編輯 Modal（標題・限制級內容摺疊） */}
      <Modal open={editFor !== null} onClose={() => setEditFor(null)} small title="圖片編輯"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEditFor(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            const nv = parseInt(eNo, 10);
            setItems(items.map(x => x.id === editFor!.id
              ? { ...x, no: Number.isFinite(nv) && nv > 0 ? nv : x.no, fold: eAdult ? { type: 'adult' } : null } : x));
            setEditFor(null);
          }}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="cp-lb">編號</span>
            <KInput value={eNo} onChange={e => setENo(e.target.value.replace(/[^\d]/g, ''))}
              style={{ width: 90, textAlign: 'center' }} />
          </div>
          <KCheck label="摺疊限制級內容（模糊＋點擊顯示）" checked={eAdult} onChange={setEAdult} />
        </div>
      </Modal>

      {/* 刪除警告 Modal */}
      <ConfirmModal open={delFor !== null} title="確定要刪除圖片嗎？"
        body={`${padNo(delFor?.no)} — 刪除後的圖片與留言無法復原。`}
        onClose={() => setDelFor(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => {
            const gone = delFor!.id;
            setItems(items.filter(x => x.id !== gone));
            // 圖片附帶的留言也一併刪除（v2.0 — 因為分開儲存，留下後會變成沒有主人的回覆）
            setCmtRows(cmtRows.filter(c => !(c.target === 'road' && c.targetId === gone)));
            setDelFor(null);
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelFor(null) },
        ]} />
    </section>
  );
}

/** 讀取 ?s=，因此需要 Suspense 邊界（Next App Router） */
export default function RoadviewPage() {
  return <Suspense fallback={<section className="page" />}><RoadviewPageInner /></Suspense>;
}