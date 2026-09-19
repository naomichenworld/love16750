'use client';
// EditableDesc 注入
// 自設關係列表 (4.5) — 4:3 橫向縮圖 · 公開範圍 3 階段 · 成員顏色圓點
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Relation, REL_SEED, Character, CHAR_SEED, relPath } from '@/lib/charStore';
import { SearchBar } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

export default function RelsPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const { editOn } = useMainStore();
  const [rels, setRels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [q, setQ] = useState('');

  const colorOf = (id: string) => chars.find(c => c.id === id)?.color ?? '#666';
  const visible = rels
    .filter(r => isAdmin || r.visibility !== 'private')
    .filter(r => !q || r.name.toLowerCase().includes(q.toLowerCase()));

  // 編輯模式下的卡片拖曳排序 (v1.9)
  const sort = useCardSort(visible, next => setRels(mergeOrder(rels, next)), editOn && isAdmin);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>RELATIONS</PageTitle>
        <EditableDesc k="rels-desc" def="自設關係列表 · 4:3 橫向縮圖 · 公開範圍：完全公開/會員公開/僅自己可見" />
        <div className="head-actions">
          <SearchBar onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/rels/new')}>＋ ADD RELATION</button>}
        </div>
      </div>
      <div className="g3 rels-grid">
        {visible.map((r, i) => {
          const memberLocked = r.visibility === 'member' && !user;
          const priv = r.visibility === 'private';
          const sp = sort(i) as { style?: React.CSSProperties };
          return (
            <div key={r.id} className="rel-card" {...sort(i)}
              style={{ ...(priv ? { opacity: .45 } : undefined), ...sp.style }}
              onClick={() => {
                if (editOn) return;
                if (memberLocked) { toast('會員公開 — 登入後才能查看'); return; }
                router.push(relPath(r));
              }}>
              <div className="thumb" style={{ position: 'relative' }}>
                <CroppedBlobImg fileRef={r.thumbId} crop={r.thumbCrop} ph={r.thumbClass}
                  label={priv ? '僅自己可見' : memberLocked ? '會員公開' : '4:3'} />
              </div>
              <div className="nm">
                {/* 列表中統一使用預設字體 — 個別名稱字體僅在詳細頁面使用 */}
                <b>
                  {r.name}
                  {r.visibility === 'member' && <span className="pill" style={{ marginLeft: 6 }}>會員</span>}
                </b>
                <span>
                  {priv ? '僅顯示給管理員'
                    : memberLocked ? '登入後才能查看'
                    : `${r.catchphrase.replace(/ /g, '')} · ${r.members.length}人`}
                </span>
                {r.members.length > 0 && (
                  <div className="who">
                    {r.members.map(m => <i key={m.charId} style={{ background: colorOf(m.charId) }} />)}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}