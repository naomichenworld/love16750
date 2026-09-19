'use client';
// 行事曆（4.12）— 月曆（正方形區塊）＋右側 D-day／待辦事項（共用主頁 Widget 資料）＋分類
// 行程：標題・期間・分類・顏色・備註・公開範圍・每年重複 · 行程 → 升級為 D-day · 登錄權限選項
import React, { Suspense, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useMainStore } from '@/lib/mainStore';
import { useSched, SchedEvent, eventColor, eventOnDate } from '@/lib/schedStore';
import { DdayWidget, TodoWidget } from '@/components/main/widgets';
import { Modal, useConfirmDelete } from '@/components/ui/Modal';
import { KInput, KTextarea, KSelect, KCheck, KDate, KToggle } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { DragList } from '@/components/ui/DragList';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useToast } from '@/components/ui/Toast';
import { useMenuSettings } from '@/lib/menuStore';
import { useSectionParam } from '@/lib/sectionStore';

const MONTHS = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
const fmt = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

function CalInner() {
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  // 多個行事曆（v2.0 使用者要求）— 只顯示網址中的 ?s= 所指定的行事曆。
  // 分類也使用該行事曆的分類（如果沒有設定，就使用預設行事曆的分類）。
  const sec = useSectionParam('sched');
  const {
    st, loaded, addEvent, updateEvent, removeEvent,
    patchCat, addCat, removeCat, setCats, setAllowMember, reorderOn,
  } = useSched(sec.id);
  const { state: mainState, updateWidget } = useMainStore();
  const del = useConfirmDelete();
  const now = new Date();
  const [view, setView] = useState({ y: now.getFullYear(), m: now.getMonth() });
  // 右側卡片要顯示的日期（v2.0）— 初始為今天
  const [picked, setPicked] = useState(() => fmt(now.getFullYear(), now.getMonth(), now.getDate()));
  const [menuSet] = useMenuSettings();   // 月份顯示方式（v1.9 — 選單管理的行事曆項目）
  const [catMng, setCatMng] = useState(false);
  // 行程登錄／編輯 Modal
  const [evOpen, setEvOpen] = useState(false);
  const [evId, setEvId] = useState<string | null>(null);   // null = 新增
  const [f, setF] = useState({
    title: '', start: '', end: '', catId: '', color: '', useCatColor: true,
    memo: '', visibility: 'public' as SchedEvent['visibility'], yearly: false,
  });

  if (!loaded) return <section className="page" />;

  const canWrite = isAdmin || (st.allowMember && !!user);
  const canSee = (e: SchedEvent) =>
    isAdmin || e.visibility === 'public' || (e.visibility === 'member' && !!user);

  const todayStr = fmt(now.getFullYear(), now.getMonth(), now.getDate());
  const firstDow = new Date(view.y, view.m, 1).getDay();
  const dim = new Date(view.y, view.m + 1, 0).getDate();
  const prevDim = new Date(view.y, view.m, 0).getDate();
  const cells: { y: number; m: number; d: number; dimmed: boolean }[] = [];
  for (let i = firstDow - 1; i >= 0; i--) {
    const m = view.m === 0 ? 11 : view.m - 1;
    cells.push({ y: view.m === 0 ? view.y - 1 : view.y, m, d: prevDim - i, dimmed: true });
  }
  for (let d = 1; d <= dim; d++) cells.push({ y: view.y, m: view.m, d, dimmed: false });
  while (cells.length % 7 !== 0) {
    const idx = cells.length - (firstDow + dim) + 1;
    const m = view.m === 11 ? 0 : view.m + 1;
    cells.push({ y: view.m === 11 ? view.y + 1 : view.y, m, d: idx, dimmed: true });
  }

  const eventsOn = (date: string) => st.events.filter(e => canSee(e) && eventOnDate(e, date));
  // 右側卡片要顯示的日期 — 點擊月曆格子即可切換（v2.0）
  const pickedEvents = eventsOn(picked);

  const openNew = (date: string) => {
    if (!canWrite) return;
    setEvId(null);
    setF({ title: '', start: date, end: '', catId: st.cats[0]?.id ?? '', color: '', useCatColor: true, memo: '', visibility: 'public', yearly: false });
    setEvOpen(true);
  };
  const openEdit = (e: SchedEvent) => {
    if (!canWrite) return;
    setEvId(e.id);
    setF({
      title: e.title, start: e.start, end: e.end ?? '', catId: e.catId,
      color: e.color ?? '', useCatColor: !e.color, memo: e.memo ?? '',
      visibility: e.visibility, yearly: e.repeat === 'yearly',
    });
    setEvOpen(true);
  };
  const saveEvent = () => {
    if (!f.title.trim()) { toast('請輸入行程標題'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(f.start)) { toast('請選擇開始日期'); return; }
    const ev = {
      title: f.title.trim(), start: f.start, end: f.end || undefined,
      catId: f.catId, color: f.useCatColor ? undefined : f.color || undefined,
      memo: f.memo.trim() || undefined, visibility: f.visibility,
      repeat: (f.yearly ? 'yearly' : 'none') as SchedEvent['repeat'],
    };
    if (evId) updateEvent(evId, ev); else addEvent(ev);
    setEvOpen(false);
    toast('已儲存');
  };
  // 行程 → 升級為 D-day（4.12）— 加入主頁 D-DAY Widget 項目
  const promoteDday = () => {
    const w = mainState.widgets.find(x => x.type === 'dday');
    if (!w) return;
    const items = (w.settings.items as { title: string; date: string }[]) ?? [];
    updateWidget(w.id, { settings: { ...w.settings, items: [...items, { title: f.title.trim(), date: f.start }] } }, { persist: true });
    toast('已登錄為 D-day — 將顯示於主頁 Widget');
  };

  const ddayConf = mainState.widgets.find(w => w.type === 'dday');
  const todoConf = mainState.widgets.find(w => w.type === 'todo');

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'SCHEDULER' : sec.name}</PageTitle>
        <EditableDesc k="cal-desc" def="月曆 + 待辦事項 + D-day" />
      </div>

      <div className="cal-layout">
        {/* 僅限行動裝置 — 不顯示月曆，改為簡單列出即將到來的行程，最多 10 筆（v1.9 使用者確認） */}
        <div className="panel cal-mlist" style={{ padding: '6px 18px' }}>
          {(() => {
            const today = fmt(now.getFullYear(), now.getMonth(), now.getDate());
            const list = st.events
              .filter(canSee)
              .map(e => {
                let d = e.start;
                if (e.repeat === 'yearly') {
                  const thisYear = `${now.getFullYear()}-${e.start.slice(5)}`;
                  d = thisYear >= today ? thisYear : `${now.getFullYear() + 1}-${e.start.slice(5)}`;
                }
                return { e, d };
              })
              .filter(x => x.d >= today || (x.e.end && x.e.end >= today))
              .sort((a, b) => a.d.localeCompare(b.d))
              .slice(0, 10);
            return (
              <>
                {list.map(({ e, d }) => (
                  <div key={e.id} className="ev-row" onClick={() => openEdit(e)}>
                    <span className="dt">{d.slice(5).replace('-', '.')}{e.end ? ` ~ ${e.end.slice(5).replace('-', '.')}` : ''}</span>
                    <span className="tt">{e.title}</span>
                    <i style={{ background: eventColor(e, st.cats) }} />
                  </div>
                ))}
                {list.length === 0 && <p className="hint" style={{ padding: '10px 0' }}>目前沒有即將到來的行程</p>}
              </>
            );
          })()}
        </div>
        {/* 左：月曆 */}
        <div className="panel cal">
          <div className="cal-head">
            <button className="btn btn-ghost" style={{ padding: '6px 12px' }}
              onClick={() => setView(v => ({ y: v.m === 0 ? v.y - 1 : v.y, m: (v.m + 11) % 12 }))}>‹</button>
            {/* 顯示方式位於環境設定 > 選單管理的行事曆項目（v1.9） */}
            <b>{(menuSet.calTitle ?? 'en') === 'num'
              ? `${view.y}.${String(view.m + 1).padStart(2, '0')}`
              : `${MONTHS[view.m]} ${view.y}`}</b>
            <button className="btn btn-ghost" style={{ padding: '6px 12px' }}
              onClick={() => setView(v => ({ y: v.m === 11 ? v.y + 1 : v.y, m: (v.m + 1) % 12 }))}>›</button>
          </div>
          <div className="cal-grid">
            {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(w => <div key={w} className="dow">{w}</div>)}
            {cells.map((c, i) => {
              const date = fmt(c.y, c.m, c.d);
              const evs = eventsOn(date);
              return (
                <div key={i}
                  className={`cal-cell ${c.dimmed ? 'dim' : ''} ${date === todayStr ? 'today' : ''} ${date === picked ? 'picked' : ''}`}
                  /* 點擊格子不是開啟登錄視窗，而是選擇該日期 — 登錄與排序在右側卡片進行（v2.0） */
                  onClick={() => setPicked(date)}>
                  {c.d}
                  {/* 格子內最多只顯示上方 3 筆 — 其餘在右側卡片查看 */}
                  {evs.slice(0, 3).map(e => (
                    <div key={e.id} className="ev" style={{ background: `${eventColor(e, st.cats)}22`, color: eventColor(e, st.cats) }}
                      data-tip={`${e.title}${e.memo ? ` — ${e.memo}` : ''}`}
                      onClick={ev => { ev.stopPropagation(); setPicked(date); openEdit(e); }}>
                      {e.title}
                    </div>
                  ))}
                  {evs.length > 3 && <div className="ev more">＋{evs.length - 3}</div>}
                </div>
              );
            })}
          </div>
        </div>

        {/* 右：所選日期的行程／D-day／待辦事項（共用主頁 Widget 資料）／分類 */}
        <div className="cal-side" style={{ display: 'grid', alignContent: 'start' }}>
          {/* 所選日期的行程（v2.0 使用者確認）— 在這裡新增・調整順序，月曆只顯示上方 3 筆 */}
          <div className="panel widget">
            <h4>
              {picked.slice(5).replace('-', '月 ')}日行程
              {canWrite && <span className="more" onClick={() => openNew(picked)}>＋ 新增</span>}
            </h4>
            {pickedEvents.length > 0 ? (
              <DragList items={pickedEvents} keyOf={e => e.id} disabled={!canWrite}
                onReorder={next => reorderOn(next.map(e => e.id))}
                render={e => (
                  /* 標題在左側，分類顏色在最右側。
                     只有標題可以點擊 — 避免拖曳控制點放開時意外開啟編輯視窗（v2.0） */
                  <div className="dday-row" style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
                    {canWrite && <span className="drag-h">⠿</span>}
                    <span style={{
                      flex: 1, minWidth: 0, textAlign: 'left',
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: canWrite ? 'var(--cur-pointer,pointer)' : undefined,
                    }} onClick={() => openEdit(e)}>{e.title}</span>
                    <i style={{
                      width: 9, height: 9, borderRadius: '50%', flexShrink: 0,
                      background: eventColor(e, st.cats), fontStyle: 'normal',
                    }} />
                  </div>
                )} />
            ) : (
              <p className="hint" style={{ margin: '6px 0 0' }}>
                此日期沒有行程{canWrite ? ' — 使用 [＋ 新增] 登錄' : ''}
              </p>
            )}
          </div>
          {ddayConf && <DdayWidget conf={ddayConf} />}
          {todoConf && <TodoWidget conf={todoConf} />}
          <div className="panel widget">
            <h4>分類 {isAdmin && <span className="more" onClick={() => setCatMng(true)}>管理 ›</span>}</h4>
            {st.cats.map(c => (
              <div key={c.id} className="dday-row">
                <span><i style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: c.color, marginRight: 7, fontStyle: 'normal' }} />{c.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 行程登錄／編輯 Modal */}
      <Modal open={evOpen} onClose={() => setEvOpen(false)} title={evId ? '編輯行程' : '登錄行程'}
        dirty={!!f.title}
        actions={<>
          {evId && (
            <button className="btn btn-ghost" onClick={() =>
              del.ask(`確定要刪除行程「${f.title}」嗎？`, () => { removeEvent(evId); setEvOpen(false); })}>DELETE</button>
          )}
          <button className="btn btn-ghost" onClick={() => setEvOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveEvent}>{evId ? 'SAVE' : 'ADD'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <KInput placeholder="行程標題" value={f.title} onChange={e => setF(s => ({ ...s, title: e.target.value }))} />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KDate value={f.start} onChange={v => setF(s => ({ ...s, start: v }))} style={{ flex: 1 }} />
            <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
            <KDate value={f.end} onChange={v => setF(s => ({ ...s, end: v }))} style={{ flex: 1 }} placeholder="結束日期（選填）" />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect minWidth={130} value={f.catId} onChange={v => setF(s => ({ ...s, catId: v }))}
              options={st.cats.map(c => ({ value: c.id, label: c.label }))} />
            <KCheck label="使用分類顏色" checked={f.useCatColor}
              onChange={v => setF(s => ({ ...s, useCatColor: v }))} />
            {!f.useCatColor && <ColorField value={f.color || '#8a8f98'} onChange={hex => setF(s => ({ ...s, color: hex }))} />}
          </div>
          <KTextarea placeholder="備註（選填）" value={f.memo} onChange={e => setF(s => ({ ...s, memo: e.target.value }))} />
          <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect minWidth={120} value={f.visibility} onChange={v => setF(s => ({ ...s, visibility: v as SchedEvent['visibility'] }))}
              options={[
                { value: 'public', label: '完全公開' },
                { value: 'member', label: '會員公開' },
                { value: 'private', label: '僅自己可見' },
              ]} />
            <KCheck label="每年重複" checked={f.yearly} onChange={v => setF(s => ({ ...s, yearly: v }))} />
            {isAdmin && f.title.trim() && f.start && (
              <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 10.5, marginLeft: 'auto' }}
                onClick={promoteDday}>登錄為 D-day</button>
            )}
          </div>
        </div>
      </Modal>

      {/* 分類管理 Modal（管理員） */}
      <Modal open={catMng} onClose={() => setCatMng(false)} small title="分類管理"
        desc="名稱 · 顏色 · ⠿ 順序 — 登錄行程時選擇"
        actions={<button className="btn btn-dark" onClick={() => setCatMng(false)}>CLOSE</button>}>
        <DragList items={st.cats} keyOf={c => c.id} onReorder={setCats}
          render={c => (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
              <span className="drag-h">⠿</span>
              <KInput value={c.label} onChange={e => patchCat(c.id, { label: e.target.value })} />
              <ColorField value={c.color} onChange={hex => patchCat(c.id, { color: hex })} />
              <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 10.5, whiteSpace: 'nowrap' }}
                onClick={() => del.ask(`確定要刪除分類「${c.label}」嗎？`, () => removeCat(c.id),
                  '此分類的行程會保留，並以預設顏色顯示。')}>DELETE</button>
            </div>
          )} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }} onClick={addCat}>＋ ADD</button>
          <KToggle label="允許會員登錄行程" checked={st.allowMember} onChange={setAllowMember} />
        </div>
      </Modal>

      {del.element}
    </section>
  );
}

export default function CalPage() {
  // useSearchParams 需要 Suspense 邊界（Next App Router）
  return <Suspense fallback={<section className="page" />}><CalInner /></Suspense>;
}