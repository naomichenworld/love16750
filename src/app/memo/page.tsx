'use client';
// 便利貼備忘錄 (4.6) — 便利貼板：自由拖曳配置 · 顏色／尺寸 · 隨機傾斜 ·
// 點擊 = 移至最上層 · 右鍵自訂選單（順序／修改／刪除） · 右側備忘錄列表 · 撰寫權限選項
import React, { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import {
  StickyMemo, MEMO_SEED, MEMO_COLORS, MEMO_SIZE_W, useMemoSettings,
} from '@/lib/memoStore';
import { fmtMD } from '@/lib/threadStore';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { KTextarea } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';

export default function MemoPage() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const del = useConfirmDelete();
  const [memos, setMemos, loaded] = useLocalList<StickyMemo>('ohome.memo.v1', MEMO_SEED);
  const [settings] = useMemoSettings();
  const boardRef = useRef<HTMLDivElement>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const canWrite = isAdmin || (!!user && settings.allowMember);
  const canTouch = (m: StickyMemo) => isAdmin || (!!user && m.authorId === user.id);
  const maxZ = () => Math.max(0, ...memos.map(m => m.z));

  /* ---------- 拖曳（儲存配置 — 所有人看到相同結果） ---------- */
  const onDown = (e: React.PointerEvent, m: StickyMemo) => {
    if (e.button !== 0) return;
    const el = e.currentTarget as HTMLElement;
    const board = boardRef.current!;
    const br = board.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const ox = e.clientX - r.left, oy = e.clientY - r.top;
    const movable = canTouch(m);
    if (movable) document.body.classList.add('drag-move');   // 拖曳中固定游標 (v1.9)
    let moved = false;
    let fx = m.x, fy = m.y;
    const mv = (ev: PointerEvent) => {
      if (!movable) return;
      moved = true;
      const px = Math.max(0, Math.min(br.width - r.width, ev.clientX - br.left - ox));
      const py = Math.max(0, Math.min(br.height - r.height, ev.clientY - br.top - oy));
      fx = (px / br.width) * 100;
      fy = (py / br.height) * 100;
      el.style.left = `${fx}%`;
      el.style.top = `${fy}%`;
    };
    const up = () => {
      document.body.classList.remove('drag-move');
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      // 提交移動 + 移至最上層（即使只是點擊也移至最上層 — 4.6 重疊順序）
      setMemos(memos.map(x => x.id === m.id ? { ...x, x: fx, y: fy, z: maxZ() + 1 } : x));
    };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
    e.preventDefault();
  };

  /* ---------- 右鍵自訂選單（自訂樣式 — 4.6 v1.8） ---------- */
  // list：從右側列表開啟 — 不顯示順序項目，只顯示修改／刪除
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number; list?: boolean } | null>(null);
  const onCtx = (e: React.MouseEvent, m: StickyMemo, list = false) => {
    e.preventDefault();
    if (!canTouch(m)) return;
    setCtx({ id: m.id, x: e.clientX, y: e.clientY, list });
  };
  const zOrder = (mode: 'up' | 'down' | 'top' | 'bottom') => {
    if (!ctx) return;
    const cur = memos.find(m => m.id === ctx.id);
    if (!cur) return;
    const zs = memos.map(m => m.z);
    let next = memos;
    if (mode === 'top') next = memos.map(m => m.id === cur.id ? { ...m, z: Math.max(...zs) + 1 } : m);
    if (mode === 'bottom') next = memos.map(m => m.id === cur.id ? { ...m, z: Math.min(...zs) - 1 } : m);
    if (mode === 'up') {
      const hi = zs.filter(z => z > cur.z);
      if (hi.length) {
        const nz = Math.min(...hi);
        next = memos.map(m => m.z === nz ? { ...m, z: cur.z } : m.id === cur.id ? { ...m, z: nz } : m);
      }
    }
    if (mode === 'down') {
      const lo = zs.filter(z => z < cur.z);
      if (lo.length) {
        const nz = Math.max(...lo);
        next = memos.map(m => m.z === nz ? { ...m, z: cur.z } : m.id === cur.id ? { ...m, z: nz } : m);
      }
    }
    setMemos(next);
    setCtx(null);
  };

  /* ---------- 新增／修改 Modal ---------- */
  const [mOpen, setMOpen] = useState(false);
  const [mId, setMId] = useState<string | null>(null); // null = 新備忘錄
  const [mText, setMText] = useState('');
  const [mColor, setMColor] = useState(MEMO_COLORS[0]);
  const [mSize, setMSize] = useState<StickyMemo['size']>('m');
  const openNew = () => {
    setMId(null); setMText('');
    setMColor(MEMO_COLORS[memos.length % MEMO_COLORS.length]); setMSize('m');
    setMOpen(true);
  };
  const openEdit = (m: StickyMemo) => {
    setMId(m.id); setMText(m.text); setMColor(m.color); setMSize(m.size);
    setMOpen(true); setCtx(null);
  };
  const save = () => {
    if (!mText.trim()) { toast('請輸入內容'); return; }
    if (mId) {
      setMemos(memos.map(m => m.id === mId ? { ...m, text: mText.trim(), color: mColor, size: mSize } : m));
    } else {
      const m: StickyMemo = {
        id: newId(), text: mText.trim(),
        author: user?.nickname ?? '管理員', authorId: user?.id ?? 'admin',
        color: mColor, size: mSize,
        x: 6 + Math.random() * 55, y: 6 + Math.random() * 55,
        rot: Math.round((Math.random() * 6 - 3) * 10) / 10, // 隨機傾斜 (4.6)
        z: maxZ() + 1, date: new Date().toISOString(),
      };
      setMemos([...memos, m]);
    }
    setMOpen(false);
  };
  const remove = (m: StickyMemo) => {
    setCtx(null);
    del.ask('確定要刪除備忘錄嗎？', () => setMemos(memos.filter(x => x.id !== m.id)));
  };

  const focus = (id: string) => {
    setMemos(memos.map(m => m.id === id ? { ...m, z: maxZ() + 1 } : m));
    setFocusId(id);
    setTimeout(() => setFocusId(f => (f === id ? null : f)), 900);
  };

  if (!loaded) return <section className="page" />;

  const sorted = [...memos].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <section className="page" onClick={() => setCtx(null)}>
      <div className="page-head">
        <PageTitle>STICKY NOTES</PageTitle>
        <EditableDesc k="memo-desc" def="自由拖曳配置 · 顏色／傾斜 · 撰寫權限選項" />
      </div>
      <div className="memo-layout">
        {/* 看板 — 儲存配置・順序，所有人看到相同結果 (4.6) */}
        <div className="memoboard" ref={boardRef}
          onContextMenu={e => { if (!(e.target as Element).closest('.postit')) setCtx(null); }}>
          {memos.map(m => (
            <div key={m.id}
              className={`postit ${focusId === m.id ? 'hl' : ''} ${canTouch(m) ? '' : 'ro'}`}
              style={{
                left: `${m.x}%`, top: `${m.y}%`, zIndex: m.z,
                transform: `rotate(${m.rot}deg)`, background: m.color, width: MEMO_SIZE_W[m.size],
              }}
              onPointerDown={e => onDown(e, m)}
              onContextMenu={e => onCtx(e, m)}>
              {settings.showAuthor && <b>{m.author}</b>}
              {m.text}
            </div>
          ))}
        </div>
        {/* 右側備忘錄列表 (v1.8) — 點擊後將看板中的備忘錄移至最上層 + 高亮 */}
        <div className="panel" style={{ padding: 12 }}>
          <h4 style={{ fontSize: 11, letterSpacing: '.14em', color: 'var(--faint)', padding: '4px 6px 10px' }}>MEMO LIST</h4>
          {sorted.map(m => (
            <div key={m.id} className="memo-list-item" onClick={() => focus(m.id)}
              onContextMenu={e => onCtx(e, m, true)}>
              <span className="cdot" style={{ background: m.color }} />
              <div style={{ minWidth: 0 }}>
                <b>{m.author} · {fmtMD(m.date)}</b>
                <p>{m.text}</p>
              </div>
            </div>
          ))}
          {canWrite && (
            <button className="btn btn-ghost" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
              onClick={openNew}>＋ MEMO</button>
          )}
        </div>
      </div>

      {/* 右鍵順序選單 — 向上／向下／移至最上層／移至最下層 + 修改／刪除（有權限者） */}
      {ctx && (
        <div className="ctx-menu on" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          {/* 順序項目僅在從看板開啟時顯示 — 列表中只顯示修改／刪除 */}
          {!ctx.list && (
            <>
              <button onClick={() => zOrder('up')}>向上</button>
              <button onClick={() => zOrder('down')}>向下</button>
              <div className="sep" />
              <button onClick={() => zOrder('top')}>移至最上層</button>
              <button onClick={() => zOrder('bottom')}>移至最下層</button>
              <div className="sep" />
            </>
          )}
          <button onClick={() => { const m = memos.find(x => x.id === ctx.id); if (m) openEdit(m); }}>修改</button>
          <button onClick={() => { const m = memos.find(x => x.id === ctx.id); if (m) remove(m); }}>刪除</button>
        </div>
      )}

      {/* 備忘錄新增／修改 Modal — 內容 + 顏色 + 尺寸 */}
      <Modal open={mOpen} onClose={() => setMOpen(false)} small title={mId ? '修改備忘錄' : '貼上備忘錄'} dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setMOpen(false)}>取消</button>
          <button className="btn btn-dark" onClick={save}>{mId ? '儲存' : '新增'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <KTextarea style={{ minHeight: 90 }} value={mText} onChange={e => setMText(e.target.value)} />
          <div className="memo-chips">
            {MEMO_COLORS.map(c => (
              <span key={c} className={`c ${mColor === c ? 'on' : ''}`} style={{ background: c }}
                onClick={() => setMColor(c)} />
            ))}
            <ColorField value={mColor} onChange={setMColor} />
          </div>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={mSize === 's' ? 'on' : ''} onClick={() => setMSize('s')}>較小</button>
            <button className={mSize === 'm' ? 'on' : ''} onClick={() => setMSize('m')}>一般</button>
            <button className={mSize === 'l' ? 'on' : ''} onClick={() => setMSize('l')}>較大</button>
          </div>
        </div>
      </Modal>
      {del.element}
    </section>
  );
}