'use client';
// EditableDesc 注入
// 角色列表（4.4）— 一行 5 個 · 3:4 縮圖（套用裁切）· 專用字體 · ＋ ADD CHARACTER
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, charPath } from '@/lib/charStore';
import { backend, isServerMode } from '@/lib/backend';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { SearchBar, FitText } from '@/components/ui/Kit';
import { CroppedBlobImg } from '@/components/ui/CropEditor';

import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

function CharsInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const { editOn } = useMainStore();
  const [charsAll, setCharsAll] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  // 多個角色列表（v2.0 使用者要求）— 只顯示網址 ?s= 所指向的列表
  const sec = useSectionParam('chars');
  const chars = filterSection(charsAll, sec.id);
  // 儲存時只替換這個列表的位置 — 即使直接傳入篩選後的列表，也不會刪除其他列表
  const setChars = sectionSetter(charsAll, sec.id, setCharsAll);
  const [q, setQ] = useState('');

  /* 編輯權限文件自我修復（v2.0 Fork 回報 —「明明給了權限，卻拒絕該會員的儲存」）。
     在更新之前授予的權限，文件中沒有規則所讀取的平面列表（editorIds），因此即使加入最新規則，
     伺服器仍然會持續拒絕該會員儲存。管理員開啟此列表時，會在伺服器重新計算具有權限角色的
     editorIds — 每個工作階段 1 次，靜默執行。 */
  useEffect(() => {
    if (!isAdmin || !isServerMode()) return;
    const withGrants = charsAll.filter(c => c.grants?.some(g => g.level === 'edit'));
    if (!withGrants.length) return;
    try {
      if (sessionStorage.getItem('ohome.editorids.healed') === '1') return;
      sessionStorage.setItem('ohome.editorids.healed', '1');
    } catch { /* 忽略 */ }
    void backend()?.refreshVis('characters', withGrants as unknown as { id: string }[], null)
      .catch(() => { /* 忽略 — 下個工作階段再次執行 */ });
  }, [isAdmin, charsAll]);

  const visible = chars
    .filter(c => c.own)
    .filter(c => isAdmin || c.visibility === 'public')
    .filter(c => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.sub.includes(q));

  // 編輯模式下拖曳卡片排序（v1.9）
  const sort = useCardSort(visible, next => setChars(mergeOrder(chars, next)), editOn && isAdmin);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'CHARACTERS' : sec.name}</PageTitle>
        <EditableDesc k="chars-desc" def="管理員的自設角色列表 · 3:4 頭像縮圖 · 點擊後前往個人資料" />
        <div className="head-actions">
          <SearchBar onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/chars/new' + secQuery('chars', sec.id))}>＋ ADD CHARACTER</button>}
        </div>
      </div>
      <div className="g5 chars-grid">
        {visible.map((c, i) => {
          const priv = c.visibility === 'private';
          const sp = sort(i) as { style?: React.CSSProperties };
          return (
            <div key={c.id} className="char-card" {...sort(i)}
              style={{ ...(priv ? { opacity: .45 } : undefined), ...sp.style }}
              onClick={() => { if (!editOn) router.push(charPath(c)); }}>
              <div className="thumb" style={{ position: 'relative' }}>
                <CroppedBlobImg fileRef={c.arts?.[0] ?? c.thumbId} crop={c.thumbCrop} ph={c.thumbClass}
                  label={priv ? '비공개' : '3:4'} />
              </div>
              <div className="nm">
                {/* 列表中統一使用預設字體 — 個別名稱字體只在詳細頁面使用（使用者確認）。
                    長名稱會縮小以符合單行顯示，不會拆成兩行 */}
                <b style={{ minWidth: 0, flex: 1 }}><FitText>{c.name}</FitText></b>
                <i style={{ background: c.color }} />
              </div>
            </div>
          );
        })}
        {visible.length === 0 && (
          <p style={{ gridColumn: '1/-1', textAlign: 'center', color: 'var(--page-desc)', fontSize: 13, padding: 40 }}>
            沒有可顯示的角色
          </p>
        )}
      </div>
    </section>
  );
}

export default function CharsPage() {
  // useSearchParams 需要 Suspense 邊界（Next App Router）
  return <Suspense fallback={<section className="page" />}><CharsInner /></Suspense>;
}