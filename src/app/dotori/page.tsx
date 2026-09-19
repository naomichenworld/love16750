'use client';
// TRPG 橡果（4.15）— 劇本願望清單 · 4 欄卡片網格 · 狀態篩選分頁 · 從卡片切換狀態
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useLocalList } from '@/lib/postStore';
import {
  DotoriItem, DotoriStatus, DOTORI_SEED, DOTORI_STATUS_KEYS, useTrpgSettings, dotoriBadgeStyle,
} from '@/lib/galleryStore';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { OrderMenu, orderNoOf, moveToOrder } from '@/components/ui/OrderMenu';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { ConfirmModal } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

type Tab = 'all' | DotoriStatus;

function DotoriPageInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [itemsAll, setItemsAll, loaded] = useLocalList<DotoriItem>('ohome.dotori.v1', DOTORI_SEED);
  // 多個區段（v2.0）— 只顯示網址中的 ?s= 所指向的區段
  const sec = useSectionParam('dotori');
  const items = filterSection(itemsAll, sec.id);
  // 儲存時只替換此區段的位置 — 即使直接傳入篩選後的列表，也不會刪除其他區段
  const setItems = sectionSetter(itemsAll, sec.id, setItemsAll);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [delFor, setDelFor] = useState<DotoriItem | null>(null);
  const [statusFor, setStatusFor] = useState<string | null>(null);   // 狀態切換彈窗目前開啟的卡片 id
  const [trpgSet] = useTrpgSettings(); // 狀態標籤・徽章顏色（環境設定 > TRPG）
  const { editOn } = useMainStore();

  // 篩選分頁 — 標籤可在環境設定 TRPG 分頁中修改（v1.9）
  const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: '전체' },
    ...DOTORI_STATUS_KEYS.map(k => ({ key: k as Tab, label: trpgSet.statuses[k].label })),
  ];

  const query = q.trim().toLowerCase();
  const shown = items
    .filter(it => (tab === 'all' ? it.status !== 'done' : it.status === tab)) // 已完成的項目在全部中隱藏（4.15）
    .filter(it => !query
      || it.name.toLowerCase().includes(query)
      || it.writer.toLowerCase().includes(query)
      || it.tags.some(t => t.toLowerCase().includes(query)));

  const countOf = (t: Tab) =>
    items.filter(it => (t === 'all' ? it.status !== 'done' : it.status === t)).length;

  const setStatus = (id: string, s: DotoriStatus) =>
    setItems(items.map(x => (x.id === id ? { ...x, status: s } : x)));

  // 編輯模式下拖曳卡片排序（v1.9）— 因為是 Hook，所以必須放在 early return 之前。
  // 排序以 `shown` 的完整列表為基準處理，並將以完整列表為基準的位置傳給卡片（如下）—
  // 如果傳入頁面內的位置，第 2 頁就會移動錯誤的卡片（v2.0 分頁）
  const sort = useCardSort(shown, next => setItems(mergeOrder(items, next)), editOn && isAdmin);

  // 列表變長後分頁（v2.0 使用者要求 — 每頁 12 個）
  const PER_DT = 12;
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(shown.length / PER_DT));
  const cur = Math.min(page, pages);          // 因分頁・搜尋而變少導致頁面消失時，拉回最後一頁
  const start = (cur - 1) * PER_DT;
  useEffect(() => { setPage(1); }, [tab, query]);

  /* 依編號移動位置（v2.0 使用者要求）— 有分頁後就無法將第 1 頁的項目拖到第 3 頁。
     編號不儲存，而是根據位置產生（10、20、30 …），改變排列後就會自動更新。 */
  const [ordFor, setOrdFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const ordIdx = ordFor ? shown.findIndex(it => it.id === ordFor.id) : -1;
  const applyOrder = (wanted: number) => {
    if (ordIdx >= 0) setItems(mergeOrder(items, moveToOrder(shown, ordIdx, wanted)));
    setOrdFor(null);
  };

  if (!loaded) return <section className="page" />;

  return (
    <section className="page" onClick={() => setStatusFor(null)}>
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'DOTORI' : sec.name}</PageTitle>
        <EditableDesc k="dotori-desc" def="儲存想要遊玩的劇本 — 像橡果一樣收集起來" />
      </div>

      {/* 狀態篩選分頁 + 搜尋・ADD — 篩選列靠右對齊（v1.9 使用者要求） */}
      <div className="toolrow" style={{ marginBottom: 16 }}>
        <div className="tag-row">
          {TABS.map(t => (
            <div key={t.key} className={`tag ${tab === t.key ? 'on' : ''}`} onClick={() => setTab(t.key)}>
              {t.label} <small>{countOf(t.key)}</small>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar placeholder="搜尋劇本・作者・標籤" onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/dotori/new' + secQuery('dotori', sec.id))}>＋ ADD</button>}
        </div>
      </div>

      <div className="dt-grid">
        {shown.slice(start, start + PER_DT).map((it, si) => {
          const i = start + si;   // 排序以完整列表的位置為基準
          return (
          <div key={it.id} className="panel dt-card" {...sort(i)}
            style={{ cursor: isAdmin ? 'pointer' : undefined, ...(sort(i) as { style?: React.CSSProperties }).style }}
            onContextMenu={e => {
              if (!isAdmin) return;
              e.preventDefault();
              setOrdFor({ id: it.id, x: e.clientX, y: e.clientY });
            }}
            onClick={() => { if (isAdmin && !editOn) router.push(`/dotori/${it.id}/edit`); }}>
            <div className="th">
              <CroppedBlobImg fileRef={it.imgId} crop={it.thumbCrop} ph={it.ph} />
              {/* 徽章 — 只有空頭支票・日程確定，顯示於圖片右上角（4.15） */}
              {(it.status === 'pledge' || it.status === 'confirmed') && (
                <span className="dt-badge" style={dotoriBadgeStyle(trpgSet.statuses[it.status])}>
                  {trpgSet.statuses[it.status].label}
                </span>
              )}
              {isAdmin && (
                <div className="hv-actions dt-actions" onClick={e => e.stopPropagation()}>
                  <button onClick={() => setStatusFor(s => (s === it.id ? null : it.id))}>STATUS</button>
                  <button className="del" onClick={() => setDelFor(it)}>DELETE</button>
                </div>
              )}
              {/* 狀態切換彈窗 — 只有點擊 [狀態] 時顯示（預設 UI 中不顯示） */}
              {statusFor === it.id && (
                <div className="dt-status-pop" onClick={e => e.stopPropagation()}>
                  {DOTORI_STATUS_KEYS.map(s => (
                    <button key={s} className={it.status === s ? 'on' : ''}
                      onClick={() => { setStatus(it.id, s); setStatusFor(null); }}>
                      {trpgSet.statuses[s].label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="bd">
              {/* 名稱點擊 = 劇本連結（新分頁） · 卡片點擊 = 編輯（管理員） */}
              <b className={`nm ${it.link ? 'has-link' : ''}`}
                onClick={e => { if (it.link) { e.stopPropagation(); window.open(it.link, '_blank'); } }}
                data-tip={it.link ? '開啟劇本連結（新分頁）' : undefined}>
                {it.name}
              </b>
              <small className="meta">
                {[it.writer, it.rule, it.people].filter(Boolean).join(' · ')}
              </small>
              {/* 即使沒有標籤也保留這一行 — 避免因標籤有無而導致卡片 Key 改變（v2.0 使用者要求） */}
              <div className="kw-row">
                {it.tags.map(t => <span key={t} className="pill">{t}</span>)}
              </div>
            </div>
          </div>
          );
        })}
      </div>
      {/* 分頁器置中，數量顯示於最右側（v2.0 — 與其他列表相同方式） */}
      {shown.length > PER_DT && (
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
          <span />
          <Pager page={cur} total={pages} onChange={setPage} />
          <small style={{ color: 'var(--faint)', fontSize: 10.5, justifySelf: 'end' }}>共 {shown.length} 個</small>
        </div>
      )}
      {shown.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 13, color: 'var(--faint)' }}>
            {query ? '沒有搜尋結果' : '此分頁中沒有橡果'}
          </p>
        </div>
      )}

      {/* 右鍵 > 順序編號（v2.0 使用者要求） */}
      {ordFor && ordIdx >= 0 && (
        <OrderMenu at={ordFor} current={orderNoOf(ordIdx)} total={shown.length}
          onApply={applyOrder} onClose={() => setOrdFor(null)} />
      )}

      <ConfirmModal open={delFor !== null} title="確定要刪除橡果嗎？"
        body={`"${delFor?.name}" — 刪除後將無法復原。`}
        onClose={() => setDelFor(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setItems(items.filter(x => x.id !== delFor!.id)); setDelFor(null); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelFor(null) },
        ]} />
    </section>
  );
}

/** 讀取 ?s=，因此需要 Suspense 邊界（Next App Router） */
export default function DotoriPage() {
  return <Suspense fallback={<section className="page" />}><DotoriPageInner /></Suspense>;
}