'use client';
// 留言板文章撰寫／編輯（4.2 / 5.2 多留言板）— MD/HTML 模式選擇＋即時預覽＋摺疊／私密文章／公告設定
// 透過 ?edit=<文章 id> 進入時為編輯模式（僅限作者・管理員）
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, BOARD_SEED, Post, newId, FoldType } from '@/lib/postStore';
import { useBoards, boardHref, MAIN_BOARD_ID } from '@/lib/boardStore';
import { renderBody } from '@/lib/sanitize';
import { KInput, KTextarea, KSelect, KCheck } from '@/components/ui/Kit';
import { CropEditor, CropImg, CropValue } from '@/components/ui/CropEditor';
import { ConfirmModal } from '@/components/ui/Modal';
import { RichEditor } from '@/components/ui/RichEditor';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

/** 是否存在編輯器無法處理、可能會被整理掉的標籤・屬性 — 用於判斷是否需要顯示轉換警告（與 Intro 採用相同標準） */
const hasRichHtml = (html: string) =>
  /<(table|thead|tbody|tr|td|th|div|span|section|article|video|audio|details|summary|font|center)\b/i.test(html)
  || /\s(style|class|id)\s*=/i.test(html);

function WriteInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const editPid = params.get('edit');
  const [posts, setPosts, postsLoaded] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  const editing = editPid ? posts.find(p => p.id === editPid) : undefined;
  const bid = editing?.boardId ?? params.get('b') ?? MAIN_BOARD_ID;
  const { boards } = useBoards();
  const board = boards.find(b => b.id === bid) ?? boards[0];
  const [title, setTitle] = useState('');
  const [writeMode, setWriteMode] = useState<'editor' | 'md' | 'html'>('editor'); // 編輯器為預設
  const [body, setBody] = useState('');
  // HTML 模式內的檢視方式（v2.0 使用者要求）— 原始程式碼／可直接編輯的預覽
  const [htmlView, setHtmlView] = useState<'code' | 'preview'>('code');
  const [askRich, setAskRich] = useState<null | (() => void)>(null);   // 顯示整理警告後執行切換
  const [category, setCategory] = useState('');
  // 分類標籤預設值 — 載入各留言板的列表（5.2）後使用第一個項目
  React.useEffect(() => { if (!category && board.cats[0]) setCategory(board.cats[0].label); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.cats.length]);
  const [secret, setSecret] = useState(false);
  const [notice, setNotice] = useState(false);
  // 標籤（v2.0 使用者要求）— 以逗號分隔輸入，儲存時轉換成陣列
  const [tagsText, setTagsText] = useState('');
  const parseTags = (s: string) =>
    [...new Set(s.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))];
  const [foldType, setFoldType] = useState<FoldType | 'none'>('none');
  const [foldLabel, setFoldLabel] = useState('');
  // 票券面板代表圖片（v1.9）— 從插入正文的圖片中選擇＋裁切成 16:9 縮圖
  const [thumbSrc, setThumbSrc] = useState<string | undefined>(undefined);
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(undefined);
  const [cropOpen, setCropOpen] = useState(false);
  // 正文圖片列表 — HTML <img> ＋ Markdown 圖片
  const bodyImages = useMemo(() => {
    const out: string[] = [];
    for (const m of body.matchAll(/<img[^>]*src=["']([^"']+)["']/gi)) out.push(m[1]);
    for (const m of body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) out.push(m[1]);
    return [...new Set(out)];
  }, [body]);
  // 如果設定為代表圖片的圖片從正文中刪除，則取消代表圖片設定
  useEffect(() => {
    if (thumbSrc && !bodyImages.includes(thumbSrc)) { setThumbSrc(undefined); setThumbCrop(undefined); }
  }, [bodyImages, thumbSrc]);

  // 編輯模式 — 儲存資料載入完成後填入一次表單（正文依儲存模式保持原樣：md→Markdown、html→HTML）
  const hydrated = useRef(false);
  useEffect(() => {
    if (!editPid || !postsLoaded || hydrated.current) return;
    const p = posts.find(x => x.id === editPid);
    if (!p) return;
    hydrated.current = true;
    setTitle(p.title); setBody(p.body);
    // 使用編輯器撰寫的文章會再次以編輯器開啟 — 以前一律顯示 HTML 原始碼，
    // 導致用編輯器撰寫的文章編輯時突然看到標籤（沒有 authored 的舊文章則維持原本的 HTML）
    setWriteMode(p.mode === 'md' ? 'md' : (p.authored === 'editor' ? 'editor' : 'html'));
    setCategory(p.category);
    setSecret(p.secret); setNotice(p.notice);
    setFoldType(p.fold?.type ?? 'none'); setFoldLabel(p.fold?.label ?? '');
    setTagsText((p.tags ?? []).join(', '));
    setThumbSrc(p.thumbSrc); setThumbCrop(p.thumbCrop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editPid, postsLoaded, posts]);

  const preview = useMemo(() => renderBody(writeMode === 'md' ? 'md' : 'html', body), [writeMode, body]);

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>WRITE</PageTitle><p>發文功能請先登入後使用</p></div>
      </section>
    );
  }

  const post = () => {
    if (!title.trim() || !body.trim()) { toast('請輸入標題與內容'); return; }
    if (editing) {
      // 編輯 — 僅限作者本人（管理員對他人文章只能刪除，v1.9）。保留作者／日期／留言／所屬留言板
      if (editing.authorId !== user.id) { toast('只有作者本人可以編輯'); return; }
      setPosts(posts.map(p => (p.id === editing.id ? {
        ...p,
        title: title.trim(), body,
        mode: writeMode === 'md' ? 'md' : 'html',
        authored: writeMode === 'editor' ? 'editor' : undefined,
        category,
        secret, notice: isAdmin ? notice : p.notice,
        tags: parseTags(tagsText),
        fold: foldType === 'none' ? null : { type: foldType, label: foldType === 'custom' ? foldLabel : undefined },
        thumbSrc, thumbCrop,
      } : p)));
      toast('修改完成');
      router.push(`/board/${editing.id}`);
      return;
    }
    const p: Post = {
      id: newId(), title: title.trim(), body,
      mode: writeMode === 'md' ? 'md' : 'html', category,
      author: user.nickname, authorId: user.id, date: new Date().toISOString(),
      secret, notice: isAdmin && notice,
      tags: parseTags(tagsText),
      fold: foldType === 'none' ? null : { type: foldType, label: foldType === 'custom' ? foldLabel : undefined },
      comments: [],
      boardId: board.id,   // 所屬留言板（5.2 多留言板）
      thumbSrc, thumbCrop,
    };
    setPosts([p, ...posts]);
    toast('登錄完成');
    router.push(`/board/${p.id}`);
  };

  return (
    <section className="page">
      {/* 大標題 — 如果是額外留言板則顯示該名稱（選單管理中的標題・名稱優先），點擊後返回該留言板
          （v2.0 使用者回報 —「在發文頁點擊大標題也回不去，而且標題還是原本的」） */}
      <div className="page-head"><PageTitle href={boardHref(board.id)}>{board.id === MAIN_BOARD_ID ? (editing ? 'EDIT' : 'WRITE') : board.name}</PageTitle><EditableDesc k="board-write-desc" def="編輯器 / Markdown / HTML — 儲存時會自動移除腳本" /></div>
      <div className="write-grid">
        {/* 左：正文 */}
        <div className="panel" style={{ padding: 24 }}>
          <div className="form-row">
            <label className="k-label" style={{ width: 60 }}>標題</label>
            <KInput value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="form-row">
            <label className="k-label" style={{ width: 60 }}>模式</label>
            <div className="mini-seg">
              {/* 以 HTML 撰寫的文章以編輯器開啟時，無法處理的標籤會被整理掉 — 無法復原，因此先詢問（v2.0） */}
              <button className={writeMode === 'editor' ? 'on' : ''} onClick={() => {
                if (writeMode === 'html' && hasRichHtml(body)) { setAskRich(() => () => setWriteMode('editor')); return; }
                setWriteMode('editor');
              }}>編輯器</button>
              <button className={writeMode === 'md' ? 'on' : ''} onClick={() => { setWriteMode('md'); setHtmlView('code'); }}>Markdown</button>
              <button className={writeMode === 'html' ? 'on' : ''} onClick={() => setWriteMode('html')}>HTML</button>
            </div>
            {/* HTML 模式內的檢視切換（v2.0 使用者要求）— 原始程式碼／可直接編輯的預覽 */}
            {writeMode === 'html' && (
              <div className="mini-seg">
                <button className={htmlView === 'code' ? 'on' : ''} onClick={() => setHtmlView('code')}>程式碼</button>
                <button className={htmlView === 'preview' ? 'on' : ''} onClick={() => {
                  if (htmlView === 'preview') return;
                  if (hasRichHtml(body)) { setAskRich(() => () => setHtmlView('preview')); return; }
                  setHtmlView('preview');
                }}>預覽（可編輯）</button>
              </div>
            )}
          </div>
          {writeMode === 'editor' || (writeMode === 'html' && htmlView === 'preview') ? (
            <RichEditor value={body} onChange={setBody} placeholder='請撰寫內容 — 可插入圖片（禁止腳本 6.3）' />
          ) : (
            <>
              <KTextarea
                style={{ minHeight: 220, fontFamily: writeMode === 'html' ? 'ui-monospace, Consolas, monospace' : undefined }}
                placeholder={writeMode === 'md' ? '使用 Markdown 撰寫...' : '<div>撰寫／貼上 HTML 程式碼...</div>'}
                value={body} onChange={e => setBody(e.target.value)}
              />
              <div className="preview-box" style={{ marginTop: 14 }}>
                <div className="pv-label">PREVIEW — 即時預覽</div>
                <div className="post-body" dangerouslySetInnerHTML={{ __html: preview }} />
              </div>
            </>
          )}
          {/* 票券面板代表圖片 — 從正文插入的圖片列表中選擇，點擊後指定 16:9 縮圖位置（v1.9） */}
          {board.skin === 'ticket' && bodyImages.length > 0 && (
            <div style={{ marginTop: 14 }}>
              <label className="k-label" style={{ marginBottom: 7 }}>代表圖片（票券縮圖）</label>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {bodyImages.map(src => (
                  <div key={src}
                    data-tip={thumbSrc === src ? '調整縮圖位置' : '選為代表圖片'}
                    onClick={() => { if (thumbSrc !== src) { setThumbSrc(src); setThumbCrop(undefined); } setCropOpen(true); }}
                    style={{
                      width: 104, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', cursor: 'var(--cur-pointer,pointer)',
                      position: 'relative', flexShrink: 0,
                      outline: thumbSrc === src ? '2px solid var(--accent)' : '1px solid var(--line)', outlineOffset: 2,
                    }}>
                    <CropImg src={src} crop={thumbSrc === src ? thumbCrop : undefined} />
                    {thumbSrc === src && (
                      <span style={{
                        position: 'absolute', right: 4, top: 4, fontSize: 9, fontWeight: 700, letterSpacing: '.08em',
                        background: 'var(--accent)', color: '#fff', padding: '2px 6px', borderRadius: 999,
                      }}>代表</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* 右：設定 */}
        <div>
          <div className="panel widget" style={{ marginBottom: 14 }}>
            <h4>設定</h4>
            <div className="form-row">
              <label className="k-label" style={{ width: 60 }}>分類標籤</label>
              <KSelect minWidth={130} value={category} onChange={setCategory}
                options={board.cats.map(x => ({ value: x.label, label: x.label }))} placeholder='選擇分類標籤' />
            </div>
            {/* 標籤（v2.0 使用者要求）— 會列在列表作者左側，也會成為搜尋條件 */}
            <div className="form-row">
              <label className="k-label" style={{ width: 60 }}>標籤</label>
              <KInput value={tagsText} onChange={e => setTagsText(e.target.value)}
                placeholder="以逗號分隔" style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'grid', gap: 9 }}>
              <KCheck label="私密文章（僅管理員與自己可以查看）" checked={secret} onChange={setSecret} />
              {isAdmin && <KCheck label="固定為公告" checked={notice} onChange={setNotice} />}
            </div>
          </div>
          <div className="panel widget" style={{ marginBottom: 14 }}>
            <h4>摺疊（6.2）</h4>
            <div style={{ display: 'grid', gap: 9 }}>
              <KCheck label="摺疊劇透" checked={foldType === 'spoiler'}
                onChange={v => setFoldType(v ? 'spoiler' : 'none')} />
              <KCheck label="摺疊限制級內容" checked={foldType === 'adult'}
                onChange={v => setFoldType(v ? 'adult' : 'none')} />
              <KCheck label="自訂輸入文字" checked={foldType === 'custom'}
                onChange={v => setFoldType(v ? 'custom' : 'none')} />
              {foldType === 'custom' && (
                <KInput placeholder="摺疊文字" value={foldLabel} onChange={e => setFoldLabel(e.target.value)} />
              )}
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-onbk"
              onClick={() => router.push(editing ? `/board/${editing.id}` : boardHref(board.id))}>CANCEL</button>
            <button className="btn btn-accent" onClick={post}>{editing ? 'SAVE' : 'POST'}</button>
          </div>
        </div>
      </div>

      {/* HTML → 編輯器／可編輯預覽切換警告（v2.0）— 無法處理的標籤會在編輯時被整理掉 */}
      <ConfirmModal open={askRich !== null} title="在這裡編輯會整理部分標籤"
        body="編輯器只處理粗體・列表・標題・圖片等基本格式。表格・div・style・class 等會在編輯時被整理掉，而且無法復原。如果要保留原始 HTML，請選擇取消。"
        onClose={() => setAskRich(null)}
        buttons={[
          { label: 'CANCEL', kind: 'ghost', onClick: () => setAskRich(null) },
          { label: '繼續', kind: 'accent', onClick: () => { askRich?.(); setAskRich(null); } },
        ]} />

      {/* 指定代表縮圖位置 — 16:9（票券面板） */}
      {cropOpen && thumbSrc && (
        <CropEditor open src={thumbSrc} aspect="16:9" initial={thumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setThumbCrop(c); setCropOpen(false); }} />
      )}
    </section>
  );
}

export default function BoardWritePage() {
  // useSearchParams 需要 Suspense 邊界（Next App Router）
  return <Suspense fallback={<section className="page" />}><WriteInner /></Suspense>;
}