'use client';
// TRPG 角色列表（v1.9 新增）— 1:1 代表印章卡片 · 點擊後進入詳細頁（表情切換在詳細頁）
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { TrpgChar, TCHAR_SEED, faceCrop } from '@/lib/tcharStore';
import { SearchBar } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { useConfirmDelete } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

export default function TCharsPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const del = useConfirmDelete();
  const [tchars, setTchars, loaded] = useLocalList<TrpgChar>('ohome.tchars.v1', TCHAR_SEED);
  const [q, setQ] = useState('');

  const query = q.trim().toLowerCase();
  const shown = tchars.filter(c => !query
    || c.name.toLowerCase().includes(query)
    || c.scenario.toLowerCase().includes(query)
    || c.rule.toLowerCase().includes(query)
    || c.role.toLowerCase().includes(query));

  // 編輯模式卡片拖曳排序（v1.9）— 因為是 Hook，所以必須放在 early return 之前
  const sort = useCardSort(shown, next => setTchars(mergeOrder(tchars, next)), editOn && isAdmin);

  if (!loaded) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>TRPG CHARACTERS</PageTitle>
        <EditableDesc k="tchars-desc" def="1:1 印章卡片 — 點擊後可以查看表情與介紹" />
        <div className="head-actions">
          <SearchBar placeholder="搜尋名稱・劇本・規則・角色" onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/tchars/new')}>＋ ADD</button>}
        </div>
      </div>

      <div className="tc-grid">
        {shown.map((c, i) => {
          const face = c.faces[0]; // 代表印章 = 第一個表情
          return (
            <div key={c.id} className="panel tc-card" {...sort(i)}
              style={{ cursor: 'var(--cur-pointer,pointer)', ...(sort(i) as { style?: React.CSSProperties }).style }}
              onClick={() => { if (!editOn) router.push(`/tchars/${c.id}`); }}>
              <div className="main" style={{ cursor: 'var(--cur-pointer,pointer)' }}>
                <CroppedBlobImg fileRef={face?.imgId} crop={faceCrop(c, face)} ph={face?.ph ?? c.ph} />
                {isAdmin && (
                  <div className="th-actions hv-actions">
                    <button onClick={e => { e.stopPropagation(); router.push(`/tchars/${c.id}/edit`); }}>EDIT</button>
                    <button className="del" onClick={e => {
                      e.stopPropagation();
                      del.ask(`確定要刪除「${c.name}」嗎？`, () => setTchars(tchars.filter(x => x.id !== c.id)));
                    }}>DELETE</button>
                  </div>
                )}
              </div>
              <div className="bd">
                <b className="nm">
                  {c.name}
                  {c.role && <span className="pill dark">{c.role}</span>}
                </b>
                <small className="meta">{[c.scenario, c.rule].filter(Boolean).join(' · ')}</small>
                {c.desc && (
                  <div className="desc">
                    {/* 移除標籤後的普通文字 — 省略為 2 行（完整說明請在詳細頁查看） */}
                    {c.desc.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim()}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
          {query ? '沒有搜尋結果' : '目前沒有已登錄的角色'}
        </div>
      )}
      {del.element}
    </section>
  );
}
