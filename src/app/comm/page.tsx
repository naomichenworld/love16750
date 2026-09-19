'use client';
// 委託列表（4.18）— 3 欄圖庫 · 以圖庫為單位的縮圖比例 · 狀態標籤 · 顯示全部名額
import React, { Suspense, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useLocalList } from '@/lib/postStore';
import {
  CommItem, COMM_SEED, useCommSettings, badgeStyle, fmtPrice, slotView, SLOT_CHARS, slotCount, slotTip,
} from '@/lib/commStore';
import { SearchBar, Tip, KStep } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';

function CommListPageInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const [itemsAll, setItemsAll, loaded] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  // 多個區段（v2.0）— 只顯示網址的 ?s= 所指向的區段
  const sec = useSectionParam('comm');
  const items = filterSection(itemsAll, sec.id);
  // 儲存時只替換這個區段的位置 — 即使直接傳入篩選後的列表，也不會刪除其他區段
  const setItems = sectionSetter(itemsAll, sec.id, setItemsAll);
  const [settings, patchSettings, setLoaded] = useCommSettings();
  const [q, setQ] = useState('');
  const [slotOpen, setSlotOpen] = useState(false);   // 管理員 — 點擊 SLOT 時直接開啟管理 Modal（v1.9）
  // Modal 草稿 — 必須按下 OK 才會套用，CANCEL／關閉時捨棄
  const [dTotal, setDTotal] = useState(0);
  const [dUsed, setDUsed] = useState(0);
  const openSlot = () => { setDTotal(settings.totalSlot); setDUsed(settings.totalUsed); setSlotOpen(true); };
  const applySlot = () => { patchSettings({ totalSlot: dTotal, totalUsed: Math.min(dUsed, dTotal) }); setSlotOpen(false); };

  const query = q.trim().toLowerCase();
  const shown = items.filter(c => !query
    || c.name.toLowerCase().includes(query) || c.sub.toLowerCase().includes(query));
  const totalRemain = Math.max(0, settings.totalSlot - settings.totalUsed);
  // 編輯模式下拖曳卡片排序（v1.9）— 因為是 Hook，所以必須放在 early return 之前
  const sort = useCardSort(shown, next => setItems(mergeOrder(items, next)), editOn && isAdmin);

  if (!loaded || !setLoaded) return <section className="page" />;

  return (
    <section className="page">
      <div className="page-head head-stack">
        <PageTitle>{sec.id === 'main' ? 'COMMISSION' : sec.name}</PageTitle>
        <EditableDesc k="comm-desc" def="繪圖委託說明 · 招募" />
        {/* 右側堆疊：名額（上）+ 搜尋・登錄（下）— 因為放在標題旁邊，不會與列表拉開距離（使用者確認） */}
        <div className="head-actions stack">
          <Tip tip={isAdmin ? '名額管理' : `目前剩餘名額為 ${totalRemain} 個`}>
            <span className="cm-total-slot" style={isAdmin ? { cursor: 'var(--cur-pointer,pointer)' } : undefined}
              onClick={() => { if (isAdmin) openSlot(); }}>
              SLOT {settings.totalUsed}/{settings.totalSlot}
            </span>
          </Tip>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <SearchBar placeholder="搜尋委託" onSearch={setQ} />
            {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/comm/new' + secQuery('comm', sec.id))}>＋ ADD COMMISSION</button>}
          </div>
        </div>
      </div>

      {/* 因右側堆疊透過 translateY 向下移動，所以讓網格也向下移動以維持間距
          （margin 會與 page-head 的 margin-bottom 抵銷，因此使用 padding） */}
      <div className="cm-grid" style={{ paddingTop: 16 }}>
        {shown.map((c, i) => {
          const badge = settings.commBadges.find(b => b.id === c.badgeId);
          const sv = slotView(c, settings);
          return (
            <div key={c.id} className="panel cm-card" {...sort(i)}
              onClick={() => { if (!editOn) router.push(`/comm/${c.id}`); }}>
              <div className="th" style={{ aspectRatio: settings.ratio.replace(':', '/') }}>
                <CroppedBlobImg fileRef={c.images[0]} crop={c.thumbCrop} ph={c.ph} />
                {badge && <span className="cm-badge" style={badgeStyle(badge, settings.badgeShape)}>{badge.label}</span>}
              </div>
              <div className="bd">
                <b className="nm">{c.name}</b>
                <small className="sub">{c.sub}</small>
                <div className="price">
                  ₩{fmtPrice(c.priceMin)}{c.priceMax > c.priceMin && ` – ₩${fmtPrice(c.priceMax)}`}
                </div>
                {/* 名額數字依照環境設定中選擇的「已填滿／剩餘」基準顯示（v2.0） */}
                <div className="slotline">
                  <Tip tip={slotTip(sv, settings)}>
                    <small className="slot" style={{ color: c.slotColor }}>
                      {SLOT_CHARS[c.slotShape].filled} {slotCount(sv, settings)}/{sv.total}
                    </small>
                  </Tip>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && (
        <div className="panel" style={{ textAlign: 'center', padding: 48 }}>
          <p style={{ fontSize: 13, color: 'var(--faint)' }}>{query ? '沒有搜尋結果' : '目前沒有已登錄的委託'}</p>
        </div>
      )}

      {/* 全部名額管理 — 點擊 SLOT 顯示（管理員，與環境設定的委託分頁使用相同數值 · 必須按下 OK 才會套用） */}
      <Modal open={slotOpen} onClose={() => setSlotOpen(false)} small title="名額管理"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setSlotOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={applySlot}>OK</button>
        </>}>
        <div style={{ display: 'grid', gap: 12, marginTop: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <b style={{ fontSize: 12.5 }}>全部名額</b>
            <KStep value={dTotal} min={1} max={50}
              onChange={v => { setDTotal(v); setDUsed(u => Math.min(u, v)); }} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <b style={{ fontSize: 12.5 }}>使用中</b>
            <KStep value={dUsed} min={0} max={dTotal} onChange={setDUsed} />
          </div>
          <small style={{ color: 'var(--faint)', fontSize: 11, textAlign: 'right' }}>
            剩餘名額 {Math.max(0, dTotal - dUsed)} 個
          </small>
        </div>
      </Modal>
    </section>
  );
}

/** 因為需要讀取 ?s=，所以需要 Suspense 邊界（Next App Router） */
export default function CommListPage() {
  return <Suspense fallback={<section className="page" />}><CommListPageInner /></Suspense>;
}