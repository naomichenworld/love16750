'use client';
// 會員－角色權限編輯（第 3 版，v1.9）— 為其他角色賦予會員個別權限：
// 角色扮演遊玩（可以使用該角色發言）／可編輯（包含角色編輯權限）。
// v1.9 改版：不再列出所有會員，改為透過暱稱・ID 搜尋後加入，列表中只顯示擁有權限的會員。
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CharGrant } from '@/lib/charStore';
import { useMembers } from '@/lib/members';
import { KInput } from '@/components/ui/Kit';
import { useConfirmDelete } from '@/components/ui/Modal';

// 下拉選單最大高度 — 如果下方沒有足夠的空間，就向上顯示（maxHeight 180 + 內距）
const POP_H = 192;

export function GrantsEditor({ value, onChange }: {
  value: CharGrant[];
  onChange: (next: CharGrant[]) => void;
}) {
  const pool = useMembers().filter(p => p.id !== 'admin'); // 管理員始終擁有全部權限
  const del = useConfirmDelete();   // 解除權限也是無法復原的操作，因此需要經過警告
  const [q, setQ] = useState('');
  // 下拉選單使用 body portal（fixed）— 不會被卡片 overflow 截斷，下方空間不足時會向上顯示（v1.9 修正）
  const wrapRef = useRef<HTMLDivElement>(null);
  // 向上顯示時不計算 top，而是固定使用 bottom（v2.0 使用者指出的問題）。
  // 以前會以「輸入框上方 192px」的固定推算值設定 top，因此當結果只有一兩個時，
  // 列表會與輸入框隔得很遠，看起來像是從上方開始堆疊。
  // 將 bottom 貼在輸入框正上方後，不論項目數量多少，都會從下往上延伸。
  const [pos, setPos] = useState<{ left: number; width: number; top?: number; bottom?: number } | null>(null);
  const openAt = () => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < POP_H + 10;   // 下方空間不足 — 向上
    setPos({
      left: r.left,
      width: r.width,
      ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }),
    });
  };
  const open = pos !== null;
  const setOpen = (v: boolean) => (v ? openAt() : setPos(null));
  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  const granted = value
    .map(g => ({ ...g, member: pool.find(p => p.id === g.userId) }))
    .filter(g => g.member);
  const matches = pool.filter(p =>
    !value.some(g => g.userId === p.id)
    && (p.nickname.toLowerCase().includes(q.trim().toLowerCase())
      || p.id.toLowerCase().includes(q.trim().toLowerCase())));

  const setLevel = (userId: string, level: 'play' | 'edit') =>
    onChange([...value.filter(g => g.userId !== userId), { userId, level }]);
  const remove = (userId: string) => onChange(value.filter(g => g.userId !== userId));

  return (
    <div style={{ display: 'grid', gap: 9 }}>
      {/* 會員搜尋 — 暱稱或 ID（選取後以「角色扮演遊玩」權限加入） */}
      <div ref={wrapRef} style={{ position: 'relative' }}>
        <KInput placeholder="搜尋暱稱・ID" value={q}
          onChange={e => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} />
        {open && matches.length > 0 && typeof document !== 'undefined' && createPortal(
          <div style={{
            position: 'fixed', left: pos!.left, width: pos!.width, zIndex: 120,
            ...(pos!.bottom !== undefined ? { bottom: pos!.bottom } : { top: pos!.top }),
            background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 10,
            boxShadow: 'var(--sh-dd)', padding: 4, maxHeight: 180, overflow: 'auto',
          }}>
            {matches.map(p => (
              <button key={p.id} type="button"
                style={{
                  display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
                  padding: '7px 10px', borderRadius: 7, fontSize: 12.5, color: 'var(--ink)',
                }}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setLevel(p.id, 'play'); setQ(''); setOpen(false); }}>
                <span>{p.nickname}</span>
                <small style={{ color: 'var(--faint)' }}>{p.id}</small>
              </button>
            ))}
          </div>,
          document.body,
        )}
      </div>

      {/* 僅顯示已獲得權限的會員 */}
      {granted.map(g => (
        <div key={g.userId} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
          <span style={{ fontSize: 12.5 }}>
            {g.member!.nickname} <small style={{ color: 'var(--faint)' }}>{g.userId}</small>
          </span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <div className="mini-seg">
              <button className={g.level === 'play' ? 'on' : ''} onClick={() => setLevel(g.userId, 'play')}>角色扮演遊玩</button>
              <button className={g.level === 'edit' ? 'on' : ''} onClick={() => setLevel(g.userId, 'edit')}>可編輯</button>
            </div>
            <span className="fx" style={{ cursor: 'var(--cur-pointer,pointer)' }} data-tip="解除權限"
              onClick={() => del.ask(`確定要解除「${g.member!.nickname}」的權限嗎？`,
                () => remove(g.userId),
                '此會員將無法再使用此角色進行角色扮演或編輯。')}>✕</span>
          </div>
        </div>
      ))}
      {granted.length === 0 && (
        <p className="hint" style={{ margin: 0 }}>目前沒有已授予權限的會員 — 請在上方搜尋並加入</p>
      )}
      {del.element}
    </div>
  );
}