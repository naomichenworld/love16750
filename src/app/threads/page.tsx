'use client';
// 感想串（4.17）— 將看過・讀過的作品感想以 Twitter 式串列呈現。
// 2 種檢視方式（串列／列表，預設檢視由環境設定決定）· 分類篩選 · 作品名稱搜尋 · 繼續撰寫編輯器
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery, sectionHref } from '@/lib/sectionStore';
import {
  useLocalList, newId, fmtDate, Comment,
  CommentRow, COMMENT_KEY, COMMENT_SEED, commentsFor,
} from '@/lib/postStore';
import {
  ThreadWork, ThreadPost, THREAD_SEED, useThreadSettings, threadCats, catLabel, threadBadgeStyle, lastDate, fmtMD, fmtMDHM,
} from '@/lib/threadStore';
import { useFonts } from '@/lib/fontStore';
import { putBlob, BlobImg, useBlobUrl } from '@/lib/blobStore';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { SearchBar, KTextarea, KInput, KSelect } from '@/components/ui/Kit';
import { GuestIdBar } from '@/components/ui/GuestId';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { Lightbox } from '@/components/ui/Lightbox';
import { useToast } from '@/components/ui/Toast';
import { pushNotif, notifyAdmins } from '@/lib/notifStore';

// 摺疊文字（與留言板 6.2 相同）
const FOLD_LABEL = { spoiler: '劇透注意', adult: '注意限制級內容' };
type FoldPick = 'none' | 'spoiler' | 'adult' | 'custom';
const FOLD_OPTIONS = [
  { value: 'none', label: '不摺疊' },
  { value: 'spoiler', label: '摺疊劇透' },
  { value: 'adult', label: '摺疊限制級內容' },
  { value: 'custom', label: '自訂文字' },
];

// 照片附件圖示（非 Emoji — v1.8）
const PhotoIcon = () => (
  <svg viewBox="0 0 24 24">
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    <path d="M3.5 17.5 9 13l4 3.5 3.5-3 4 4" />
  </svg>
);

/** 修改 Modal 中的既有附件圖片縮圖（IndexedDB） */
function KeepThumb({ id, onRemove }: { id: string; onRemove: () => void }) {
  const url = useBlobUrl(id);
  return (
    <div className="at">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="" />}
      <button onClick={onRemove}>✕</button>
    </div>
  );
}

/** 串文章圖片 — 1 張＝寬幅，2～4 張＝網格（4.17）· 點擊後放大查看 */
function PostImgs({ p, onOpen }: { p: ThreadPost; onOpen: (ids: string[], idx: number) => void }) {
  const ids = p.images.length ? p.images : [];
  const phs = !ids.length && p.phList ? p.phList : [];
  const n = ids.length + phs.length;
  if (n === 0) return null;
  return (
    <div className={`thr-imgs ${n === 1 ? 'one' : n === 3 ? 'three' : ''}`}>
      {ids.map((id, i) => (
        <div key={id} className="im" onClick={() => onOpen(ids, i)}><BlobImg fileRef={id} /></div>
      ))}
      {phs.map((ph, i) => <div key={i} className={`im ph ${ph}`} />)}
    </div>
  );
}

function ThreadsPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const del = useConfirmDelete();
  const { familyOf } = useFonts();
  const [worksAll, setWorksAll, loaded] = useLocalList<ThreadWork>('ohome.threads.v1', THREAD_SEED);
  // 多個區段（v2.0）— 只顯示網址 ?s= 所指定的區段
  const sec = useSectionParam('threads');
  const works = filterSection(worksAll, sec.id);
  // 儲存時只替換這個區段的位置 — 即使直接傳入篩選後的列表，也不會刪除其他區段
  const setWorks = sectionSetter(worksAll, sec.id, setWorksAll);
  const [settings, , setLoaded] = useThreadSettings();
  // 分類會針對每個區段分別設定（v2.0 使用者要求）— 尚未設定時使用預設區段的分類
  const cats = threadCats(settings, sec.id);

  const [view, setView] = useState<'thread' | 'list'>('thread');
  const [lb, setLb] = useState<{ srcs: string[]; idx: number } | null>(null); // 圖片放大查看
  const [viewInit, setViewInit] = useState(false);
  const [cat, setCat] = useState('all');
  const [q, setQ] = useState('');
  const [selId, setSelId] = useState<string | null>(null);

  // 預設檢視 — 載入環境設定值後套用一次（v1.8 確認）
  useEffect(() => {
    if (setLoaded && !viewInit) { setView(settings.defaultView); setViewInit(true); }
  }, [setLoaded, viewInit, settings.defaultView]);

  // 公開範圍 → 分類篩選 → 搜尋，依最近文章排序
  const visible = useMemo(() => works
    .filter(w => isAdmin || w.visibility === 'public' || (w.visibility === 'member' && user))
    .filter(w => cat === 'all' || w.catId === cat)
    .filter(w => !q || w.title.includes(q))
    .sort((a, b) => lastDate(b).localeCompare(lastDate(a))), [works, isAdmin, user, cat, q]);

  const sel = visible.find(w => w.id === selId) ?? visible[0];

  // 留言 — 與文章分開儲存（v2.0 使用者要求，與留言板・載入紀錄使用相同的 collection，透過 target 區分）
  const [cmtRows, setCmtRows,] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  // 串右鍵選單（v2.0 使用者要求）— 不直接開啟刪除 Modal，而是先經過一層選單
  const [wCtx, setWCtx] = useState<{ x: number; y: number; id: string } | null>(null);
  useEffect(() => {
    if (!wCtx) return;
    const close = () => setWCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setWCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [wCtx]);
  // 解除摺疊的文章（v2.0 劇透緩衝）— 只在此畫面停留期間記住
  const [openFolds, setOpenFolds] = useState<Set<string>>(new Set());

  // 繼續撰寫編輯器（管理員）
  const [text, setText] = useState('');
  const [foldType, setFoldType] = useState<FoldPick>('none');       // 摺疊（v2.0 劇透緩衝）
  const [foldLabel, setFoldLabel] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [urls, setUrls] = useState<string[]>([]);
  const imgRef = useRef<HTMLInputElement>(null);
  const addFiles = (list: FileList | null) => {
    if (!list) return;
    const next = [...files, ...Array.from(list)].slice(0, 4); // 圖片最多 4 張（4.17）
    if (files.length + list.length > 4) toast('最多只能附加 4 張圖片');
    setFiles(next);
    setUrls(next.map(f => URL.createObjectURL(f)));
  };
  const removeFile = (i: number) => {
    const next = files.filter((_, x) => x !== i);
    setFiles(next);
    setUrls(next.map(f => URL.createObjectURL(f)));
  };
  const post = async () => {
    if (!sel) return;
    if (!text.trim() && files.length === 0) { toast('請輸入內容'); return; }
    const images: string[] = [];
    for (const f of files) images.push(await putBlob(f));
    const p: ThreadPost = {
      id: newId(), text: text.trim(), images, date: new Date().toISOString(),
      fold: foldType === 'none' ? undefined : { type: foldType, label: foldType === 'custom' ? foldLabel.trim() || undefined : undefined },
    };
    setWorks(works.map(w => w.id === sel.id ? { ...w, posts: [...w.posts, p] } : w));
    setText(''); setFiles([]); setUrls([]); setFoldType('none'); setFoldLabel('');
  };

  // 文章修改 Modal — 文字＋附件圖片管理（總數限制 4 張）
  const [epId, setEpId] = useState<string | null>(null);
  const [epText, setEpText] = useState('');
  const [epFoldType, setEpFoldType] = useState<FoldPick>('none');   // 摺疊（v2.0）
  const [epFoldLabel, setEpFoldLabel] = useState('');
  const [epKeep, setEpKeep] = useState<string[]>([]);   // 要保留的既有圖片 id
  const [epPh, setEpPh] = useState<string[]>([]);       // 要保留的示範 placeholder（種子資料）
  const [epFiles, setEpFiles] = useState<File[]>([]);
  const [epUrls, setEpUrls] = useState<string[]>([]);
  const epImgRef = useRef<HTMLInputElement>(null);
  const epCount = epKeep.length + epPh.length + epFiles.length;
  const openEdit = (p: ThreadPost) => {
    setEpId(p.id); setEpText(p.text);
    setEpFoldType(p.fold?.type ?? 'none'); setEpFoldLabel(p.fold?.label ?? '');
    setEpKeep(p.images); setEpPh(p.images.length ? [] : (p.phList ?? []));
    setEpFiles([]); setEpUrls([]);
  };
  const epAddFiles = (list: FileList | null) => {
    if (!list) return;
    const room = 4 - epKeep.length - epPh.length;
    const next = [...epFiles, ...Array.from(list)].slice(0, Math.max(0, room));
    if (epFiles.length + list.length > room) toast('最多只能附加 4 張圖片');
    setEpFiles(next);
    setEpUrls(next.map(f => URL.createObjectURL(f)));
  };
  const saveEdit = async () => {
    if (!sel || !epId) return;
    if (!epText.trim() && epCount === 0) { toast('請輸入內容'); return; }
    const added: string[] = [];
    for (const f of epFiles) added.push(await putBlob(f));
    setWorks(works.map(w => w.id === sel.id ? {
      ...w,
      posts: w.posts.map(p => p.id === epId ? {
        ...p, text: epText.trim(), images: [...epKeep, ...added],
        phList: [...epKeep, ...added].length ? undefined : (epPh.length ? epPh : undefined),
        fold: epFoldType === 'none' ? undefined : { type: epFoldType, label: epFoldType === 'custom' ? epFoldLabel.trim() || undefined : undefined },
      } : p),
    } : w));
    setEpId(null);
    toast('已儲存');
  };

  const removePost = (pid: string) => {
    if (!sel) return;
    del.ask('確定要刪除這篇文章嗎？', () =>
      setWorks(works.map(w => w.id === sel.id ? { ...w, posts: w.posts.filter(p => p.id !== pid) } : w)));
  };
  const removeWork = (w: ThreadWork) => {
    del.ask(`確定要刪除「${w.title}」這個串嗎？`, () => {
      setWorks(works.filter(x => x.id !== w.id));
      // 附帶的留言也一併刪除 — 因為分開儲存，若留下就會變成沒有主人的資料列（v2.0）
      setCmtRows(cmtRows.filter(c => !(c.target === 'thread' && c.targetId === w.id)));
      setSelId(null);
    }, `串中的 ${w.posts.length} 篇文章也會一併刪除。`);
  };

  /* ---------- 留言（v2.0 使用者要求）— 與留言板相同的樣式：一層回覆，訪客使用暱稱 ---------- */
  const [cmt, setCmt] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [gName, setGName] = useState('');
  const guestMode = !user;                       // 允許訪客撰寫（與訪客留言・載入紀錄的預設設定相同）
  const comments = sel ? commentsFor(cmtRows, 'thread', sel.id) : [];
  const addComment = () => {
    if (!sel || !cmt.trim()) return;
    if (guestMode && !gName.trim()) { toast('請輸入暱稱'); return; }
    const base = { id: newId(), text: cmt.trim(), date: new Date().toISOString(), parentId: replyTo ?? undefined };
    const c: CommentRow = user
      ? { ...base, target: 'thread' as const, targetId: sel.id, author: user.nickname, authorId: user.id }
      : { ...base, target: 'thread' as const, targetId: sel.id, author: gName.trim(), authorId: '' };
    setCmtRows([...cmtRows, c]);
    /* 通知（v2.0）— 串屬於管理員，因此通知管理員；若是回覆，也通知該留言的主人 */
    notifyAdmins({
      type: 'comment', href: sectionHref('threads', sel.secId ?? 'main'),
      title: `「${sel.title}」串有新留言`, body: `${c.author} — ${c.text.slice(0, 50)}`,
    });
    if (replyTo) {
      // 不只通知根留言主人，也通知所有在該對話中留下回覆的人（v2.0 分支回報 — 與留言板相同）
      const rootAuthor = comments.find(x => x.id === replyTo)?.authorId;
      const seen = new Set<string>();
      for (const t of comments.filter(x => x.id === replyTo || x.parentId === replyTo)) {
        const to = t.authorId;
        if (!to || to === (user?.id ?? '') || seen.has(to)) continue;
        seen.add(to);
        pushNotif({
          type: 'comment', toUserId: to, href: sectionHref('threads', sel.secId ?? 'main'),
          title: to === rootAuthor ? '我的留言有新回覆' : '你參與的留言有新回覆',
          body: `${c.author} — ${c.text.slice(0, 50)}`,
        });
      }
    }
    setCmt(''); setReplyTo(null);
  };
  // 留言刪除 — 回覆也會一併刪除。訪客留言僅管理員可以刪除（與留言板 v2.0 確認相同）
  const removeComment = (c: Comment) =>
    del.ask('確定要刪除這則留言嗎？', () =>
      setCmtRows(cmtRows.filter(x => !(x.id === c.id || x.parentId === c.id))));
  const cmtRoots = comments.filter(c => !c.parentId);
  const cmtChildren = (pid: string) => comments.filter(c => c.parentId === pid);

  if (!loaded) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'THREADS' : sec.name}</PageTitle>
        <EditableDesc k="threads-desc" def="將看過、讀過的作品感想整理成串" />
      </div>

      <div className="toolrow">
        {/* 分類篩選（環境設定管理列表） */}
        <div className="seg">
          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>全部</button>
          {cats.map(c => (
            <button key={c.id} className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.label}</button>
          ))}
        </div>
        <div className="thr-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="seg">
            <button className={view === 'thread' ? 'on' : ''} onClick={() => setView('thread')}>串列</button>
            <button className={view === 'list' ? 'on' : ''} onClick={() => setView('list')}>列表</button>
          </div>
          <SearchBar onSearch={setQ} />
          {isAdmin && (
            <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }}
              onClick={() => router.push('/threads/new' + secQuery('threads', sec.id))}>＋ NEW THREAD</button>
          )}
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="panel" style={{ textAlign: 'center', padding: 48, fontSize: 13, color: 'var(--faint)' }}>
          {q || cat !== 'all' ? '沒有符合條件的串' : '目前沒有串'}
        </div>
      ) : view === 'list' ? (
        /* 列表檢視 — 海報卡片網格（每列 5 個，3:4） */
        <div className="g5">
          {visible.map(w => (
            <div key={w.id} className="panel thr-card"
              onClick={() => { setSelId(w.id); setView('thread'); }}
              /* 右鍵 → 選單 → 刪除確認 Modal（v2.0 使用者要求）— 列表檢視中沒有刪除按鈕 */
              onContextMenu={e => { if (!isAdmin) return; e.preventDefault(); setWCtx({ x: e.clientX, y: e.clientY, id: w.id }); }}>
              <div className="th">
                <CroppedBlobImg fileRef={w.posterId} crop={w.posterCrop} ph={w.ph} />
                <span className="pill dark" style={threadBadgeStyle(cats.find(c => c.id === w.catId))}>
                  {catLabel(cats, w.catId)}
                </span>
              </div>
              <div className="info">
                <div className="tt" style={{ fontFamily: familyOf(w.titleFontId) }}>{w.title}</div>
                {/* Author 欄位內容 — 位於標題與文章數量之間，最多 2 行（v2.0 分支使用者要求） */}
                {w.author && (
                  <div className="row" style={{
                    display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                    overflow: 'hidden', lineHeight: 1.45,
                  }}>{w.author}{w.authorRole ? ` ${w.authorRole}` : ''}</div>
                )}
                <div className="row"><b>文章</b> {w.posts.length}</div>
                <div className="row"><b>最近</b> {fmtMD(lastDate(w))}</div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* 串列檢視 — 左側串列＋右側作品列表 */
        <div className="thr-layout">
          <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
            {sel && (
              <>
                <div className="thr-head">
                  <span className="cat-badge" style={threadBadgeStyle(cats.find(c => c.id === sel.catId))}>
                    {catLabel(cats, sel.catId)}
                  </span>
                  <div className="poster">
                    <CroppedBlobImg fileRef={sel.posterId} crop={sel.posterCrop} ph={sel.ph} />
                  </div>
                  <div>
                    <div className="tt" style={{ fontFamily: familyOf(sel.titleFontId) }}>{sel.title}</div>
                    <div className="author">{sel.author}{sel.authorRole && <> <b>{sel.authorRole}</b></>}</div>
                    <small>
                      串開始於 {fmtMD(sel.created)} · 文章 {sel.posts.length}
                      {sel.visibility !== 'public' && ` · ${sel.visibility === 'member' ? '會員公開' : '僅自己可見'}`}
                    </small>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                        <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 10.5 }}
                          onClick={() => router.push(`/threads/${sel.id}/edit`)}>EDIT</button>
                        <button className="btn btn-ghost" style={{ padding: '3px 10px', fontSize: 10.5 }}
                          onClick={() => removeWork(sel)}>DELETE</button>
                      </div>
                    )}
                  </div>
                </div>
                <div className="thr-body">
                  {sel.posts.map(p => {
                    const folded = !!p.fold && !openFolds.has(p.id);
                    return (
                      <div key={p.id} className="thr-post">
                        {folded ? (
                          /* 摺疊緩衝（v2.0 使用者要求）— 只顯示文字，點擊後才會顯示內容 */
                          <div className="thr-fold" onClick={() => setOpenFolds(s => { const n = new Set(s); n.add(p.id); return n; })}>
                            <b>{p.fold!.type === 'custom' ? (p.fold!.label || '摺疊文章') : FOLD_LABEL[p.fold!.type]}</b>
                            <span>點擊後顯示內容</span>
                          </div>
                        ) : (
                          <>
                            {p.text && <p>{p.text}</p>}
                            <PostImgs p={p} onOpen={(ids, idx) => setLb({ srcs: ids, idx })} />
                            {p.fold && (
                              /* 再次摺疊 — 查看過後也可以恢復為摺疊狀態 */
                              <button className="thr-refold" onClick={() => setOpenFolds(s => { const n = new Set(s); n.delete(p.id); return n; })}>摺疊</button>
                            )}
                          </>
                        )}
                        <div className="tm">{fmtMDHM(p.date)}</div>
                        {isAdmin && (
                          <div className="hv-actions">
                            <button onClick={() => openEdit(p)}>EDIT</button>
                            <button className="del" onClick={() => removePost(p.id)}>DELETE</button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {sel.posts.length === 0 && (
                    <p style={{ fontSize: 12.5, color: 'var(--faint)', paddingBottom: 18 }}>目前還沒有文章</p>
                  )}
                </div>
                {/* 繼續撰寫編輯器（Twitter 式，管理員） */}
                {isAdmin && (
                  <div className="thr-write">
                    <textarea placeholder="繼續撰寫串…" value={text} onChange={e => setText(e.target.value)} />
                    {urls.length > 0 && (
                      <div className="thr-att">
                        {urls.map((u, i) => (
                          <div key={i} className="at">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={u} alt="" />
                            <button onClick={() => removeFile(i)}>✕</button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="wfoot">
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        <input ref={imgRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                          onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
                        <button className="icobtn" data-tip="新增照片（最多 4 張）" onClick={() => imgRef.current?.click()}>
                          <PhotoIcon />
                        </button>
                        {/* 摺疊（v2.0 劇透緩衝）— 與留言板文章撰寫的摺疊選項相同 */}
                        <KSelect minWidth={122} value={foldType} onChange={v => setFoldType(v as FoldPick)} options={FOLD_OPTIONS} />
                        {foldType === 'custom' && (
                          <KInput placeholder="摺疊文字" value={foldLabel} onChange={e => setFoldLabel(e.target.value)}
                            style={{ width: 130 }} />
                        )}
                      </div>
                      <button className="btn btn-dark" style={{ padding: '8px 20px', fontSize: 12, borderRadius: 20 }}
                        onClick={post}>POST</button>
                    </div>
                  </div>
                )}

                {/* 留言（v2.0 使用者要求）— 與留言板相同的樣式：一層回覆，訪客使用暱稱 */}
                <div className="thr-cmts">
                  <h4>留言 {comments.length > 0 && <span>{comments.length}</span>}</h4>
                  {cmtRoots.map(c => (
                    <React.Fragment key={c.id}>
                      {[c, ...cmtChildren(c.id)].map((x, i) => (
                        <div key={x.id} className={`cmt ${i > 0 ? 'reply-depth' : ''}`}>
                          <b>{x.author}</b><small>{fmtDate(x.date)}</small>
                          {i === 0 && (
                            <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8 }}
                              onClick={() => setReplyTo(replyTo === x.id ? null : x.id)}>
                              {replyTo === x.id ? '取消回覆' : '回覆'}
                            </small>
                          )}
                          {/* 訪客留言僅管理員可以刪除（v2.0 確認）— 伺服器端只能這樣處理 */}
                          {(isAdmin || (user && x.authorId === user.id)) && (
                            <small style={{ cursor: 'var(--cur-pointer,pointer)', marginLeft: 8 }}
                              onClick={() => removeComment(x)}>刪除</small>
                          )}
                          <p>{x.text}</p>
                        </div>
                      ))}
                    </React.Fragment>
                  ))}
                  {comments.length === 0 && <p className="hint" style={{ margin: 0 }}>留下第一則留言吧</p>}
                </div>
                <div className={`cmt-input ${guestMode ? 'guest' : ''}`}>
                  {guestMode && <GuestIdBar name={gName} onName={setGName} />}
                  <div className="ci-row" style={guestMode ? undefined : { display: 'contents' }}>
                    <KInput placeholder={replyTo ? '撰寫回覆...' : '留下留言...'} value={cmt}
                      onChange={e => setCmt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addComment(); }} />
                    <button className="btn btn-dark" onClick={addComment}>POST</button>
                  </div>
                </div>
              </>
            )}
          </div>
          {/* 右側作品列表 */}
          <div className="panel" style={{ padding: 10 }}>
            {visible.map(w => (
              <div key={w.id} className={`thr-item ${sel?.id === w.id ? 'on' : ''}`} onClick={() => setSelId(w.id)}
                /* 右鍵 → 選單 → 刪除確認 Modal（v2.0 使用者要求）— 串列檢視的右側卡片也支援 */
                onContextMenu={e => { if (!isAdmin) return; e.preventDefault(); setWCtx({ x: e.clientX, y: e.clientY, id: w.id }); }}>
                <div className="th">
                  <CroppedBlobImg fileRef={w.posterId} crop={w.posterCrop} ph={w.ph} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <b>{w.title}</b>
                  <small>{catLabel(cats, w.catId)} · 文章 {w.posts.length} · {fmtMD(lastDate(w))}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* 文章修改 Modal — 文字＋圖片管理（限制 4 張） */}
      <Modal open={epId !== null} onClose={() => setEpId(null)} title="文章修改" dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEpId(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveEdit}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <KTextarea style={{ minHeight: 120 }} value={epText} onChange={e => setEpText(e.target.value)} />
          {/* 摺疊（v2.0 劇透緩衝）— 與編輯器相同的選項 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={epFoldType} onChange={v => setEpFoldType(v as FoldPick)} options={FOLD_OPTIONS} />
            {epFoldType === 'custom' && (
              <KInput placeholder="摺疊文字" value={epFoldLabel} onChange={e => setEpFoldLabel(e.target.value)} style={{ flex: 1 }} />
            )}
          </div>
          {(epCount > 0) && (
            <div className="thr-att" style={{ padding: 0 }}>
              {epKeep.map(id => (
                <KeepThumb key={id} id={id} onRemove={() => setEpKeep(epKeep.filter(x => x !== id))} />
              ))}
              {epPh.map((ph, i) => (
                <div key={`ph${i}`} className={`at ph ${ph}`}>
                  <button onClick={() => setEpPh(epPh.filter((_, x) => x !== i))}>✕</button>
                </div>
              ))}
              {epUrls.map((u, i) => (
                <div key={u} className="at">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={u} alt="" />
                  <button onClick={() => {
                    const next = epFiles.filter((_, x) => x !== i);
                    setEpFiles(next);
                    setEpUrls(next.map(f => URL.createObjectURL(f)));
                  }}>✕</button>
                </div>
              ))}
            </div>
          )}
          <div>
            <input ref={epImgRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
              onChange={e => { epAddFiles(e.target.files); e.target.value = ''; }} />
            <button className="icobtn" data-tip="新增照片（最多 4 張）" onClick={() => epImgRef.current?.click()}>
              <PhotoIcon />
            </button>
          </div>
        </div>
      </Modal>
      {/* 串右鍵選單（v2.0 使用者要求）— 必須在這裡選擇後才會顯示刪除確認 Modal。
          因為卡片有 hover transform，為避免 fixed 位置偏移，所以透過 portal 放到 body */}
      {wCtx && createPortal(
        (() => {
          const w = works.find(x => x.id === wCtx.id);
          return w ? (
            <div className="ctx-menu on" style={{ left: wCtx.x, top: wCtx.y }} onClick={e => e.stopPropagation()}>
              <div className="ctx-ttl">{w.title}</div>
              <button className="danger" onClick={() => { setWCtx(null); removeWork(w); }}>刪除</button>
            </div>
          ) : null;
        })(),
        document.body,
      )}
      {lb && <Lightbox srcs={lb.srcs} index={lb.idx} onClose={() => setLb(null)} />}
      {del.element}
    </section>
  );
}

/** 因為需要讀取 ?s=，所以需要 Suspense 邊界（Next App Router） */
export default function ThreadsPage() {
  return <Suspense fallback={<section className="page" />}><ThreadsPageInner /></Suspense>;
}