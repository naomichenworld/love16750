'use client';
/**
 * 介紹頁面（v2.0 使用者要求）— **使用編輯器撰寫，只顯示一篇文章的頁面。**
 *
 * 沒有列表・留言・分類標籤。因為只有一篇本文，所以不使用文章資料表，而是放在設定中的一個欄位（introStore），
 * 修改時也不跳轉到其他畫面，而是**直接在這個位置**編輯 — 明明只有一篇文章，還要在列表↔撰寫之間
 * 來回切換只會增加麻煩。大標題・說明文字則與其他頁面一樣，從選單管理中修改。
 *
 * 撰寫方式有兩種（v2.0 使用者要求）：
 *   · **編輯器** — 可以透過按鈕設定粗體・列表・圖片。方便，但可使用的格式是固定的。
 *   · **HTML** — 直接撰寫標籤。適合直接貼上在其他地方製作好的介紹文章。
 * 儲存形式兩者都是 HTML，同時也會記住目前使用哪一種方式撰寫。
 */
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useIntro } from '@/lib/introStore';
import { RichEditor } from '@/components/ui/RichEditor';
import { HtmlBody } from '@/components/ui/HtmlBody';
import { KTextarea } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';

/** 是否包含編輯器無法處理、可能會消失的標籤・屬性（用於警告判斷） */
const hasRichHtml = (html: string) =>
  /<(table|thead|tbody|tr|td|th|div|span|section|article|iframe|video|audio|details|summary|font|center)\b/i.test(html)
  || /\s(style|class|id)\s*=/i.test(html);

export default function IntroPage() {
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [doc, save, loaded] = useIntro();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [mode, setMode] = useState<'editor' | 'html'>('editor');
  const [askEditor, setAskEditor] = useState(false);   // 從 HTML → 編輯器時確認

  // 即使儲存版本延遲抵達（伺服器模式），只要不是編輯中就同步畫面上的值
  useEffect(() => { if (!editing) setDraft(doc.html); }, [doc.html, editing]);

  const start = () => { setDraft(doc.html); setMode(doc.mode ?? 'editor'); setEditing(true); };
  const done = () => {
    save({ html: draft, mode });
    setEditing(false);
    toast('已儲存');
  };
  /* 用 HTML 撰寫的文章如果用編輯器開啟，編輯器無法處理的標籤會靜默消失 —
     因為無法復原，所以只有在可能包含這類內容時才詢問 */
  const toEditor = () => {
    if (hasRichHtml(draft)) { setAskEditor(true); return; }
    setMode('editor');
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>INTRO</PageTitle>
        <EditableDesc k="intro-desc" def="關於此網站的介紹" />
        {isAdmin && (
          <div className="head-actions">
            {editing ? (
              <>
                <div className="mini-seg" style={{ marginRight: 6 }}>
                  <button className={mode === 'editor' ? 'on' : ''} onClick={toEditor}>編輯器</button>
                  <button className={mode === 'html' ? 'on' : ''} onClick={() => setMode('html')}>HTML</button>
                </div>
                <button className="btn btn-dark" onClick={done}>SAVE</button>
                <button className="btn btn-ghost" onClick={() => { setDraft(doc.html); setEditing(false); }}>CANCEL</button>
              </>
            ) : (
              <button className="btn btn-dark" onClick={start}>✎ EDIT</button>
            )}
          </div>
        )}
      </div>

      <div className="panel" style={{ padding: 26 }}>
        {editing
          ? (mode === 'html'
            ? (
              <>
                <KTextarea value={draft} onChange={e => setDraft(e.target.value)}
                  style={{ minHeight: 420, fontFamily: 'var(--mono, Consolas, "D2Coding", monospace)', fontSize: 12.5, lineHeight: 1.7 }} />
                <p className="hint" style={{ margin: '8px 0 0' }}>
                  直接撰寫標籤 — 顯示時會<b>移除 Script・Frame</b>（基於安全性）。圖片請使用網址插入，或在編輯器模式中上傳。
                </p>
              </>
            )
            : <RichEditor value={draft} onChange={setDraft} />)
          /* 儲存版本尚未抵達時，為避免短暫出現「是空的」，所以確認 loaded */
          : loaded && !doc.html.trim()
            ? (
              <p className="hint" style={{ margin: 0, textAlign: 'center', padding: '38px 0' }}>
                {isAdmin ? '目前還是空的 — 請使用右上方的 EDIT 撰寫介紹' : '目前正在準備中'}
              </p>
            )
            : <HtmlBody html={doc.html} className="html-body" />}
      </div>

      <ConfirmModal open={askEditor} title="切換至編輯器後部分標籤會消失"
        body="編輯器只處理粗體・斜體・列表・引用・圖片等基本格式。表格・div・style・class 等內容會在開啟時被整理，且無法復原。若要保留原始 HTML，請按取消。"
        onClose={() => setAskEditor(false)}
        buttons={[
          { label: 'CANCEL', kind: 'ghost', onClick: () => setAskEditor(false) },
          { label: '切換至編輯器', kind: 'accent', onClick: () => { setMode('editor'); setAskEditor(false); } },
        ]} />
    </section>
  );
}