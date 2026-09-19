'use client';
// 首頁（4.0 Widget 系統）— 固定元素（Banner・會員資訊視窗）＋自由配置 Widget＋編輯模式
import React, { useEffect, useState } from 'react';
import { useMainStore, WidgetConf, WidgetType, WIDGET_META, MULTI_TYPES, widgetLabel } from '@/lib/mainStore';
import { WidgetFrame } from '@/components/main/WidgetFrame';
import { renderWidget } from '@/components/main/widgets';
import { MemberBox } from '@/components/main/MemberBox';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { KRadio } from '@/components/ui/Kit';
import { useToast } from '@/components/ui/Toast';

const ADDABLE: WidgetType[] = ['banner', 'memo', 'dday', 'todo', 'upcoming', 'freetext', 'deco', 'diary', 'latest', 'apply'];   // banner: 可新增多個（v2.0 使用者要求）
/** 有內容設定 Modal 的 Widget — 顯示右鍵「設定」的對象（v1.9） */
const EDITABLE: WidgetType[] = ['banner', 'memo', 'dday', 'todo', 'freetext', 'deco', 'apply'];

export default function MainPage() {
  const { state, editOn, gridOn, updateWidget, addWidget, removeWidget } = useMainStore();
  const toast = useToast();
  const [ctx, setCtx] = useState<{ id: string; x: number; y: number } | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [addType, setAddType] = useState<WidgetType>('freetext');
  const [addCol, setAddCol] = useState<'1' | '2' | '3'>('3');
  const [delAsk, setDelAsk] = useState<WidgetConf | null>(null);   // 右鍵刪除警告（v1.9）

  // 新增 Widget — 由上方選單的 [＋ Widget] 按鈕（位於網格切換左側）透過事件開啟（v1.9 使用者確認）
  useEffect(() => {
    const open = () => setAddOpen(true);
    window.addEventListener('ohome-add-widget', open);
    return () => window.removeEventListener('ohome-add-widget', open);
  }, []);

  // 開啟 Modal 時，如果目前選擇的類型已經新增，則一律改為可自由使用的文字 Widget（v1.9）
  useEffect(() => {
    if (!addOpen) return;
    if (!MULTI_TYPES.includes(addType) && state.widgets.some(w => w.type === addType)) setAddType('freetext');
  }, [addOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const enabled = state.widgets.filter(w => w.enabled);
  const byCol = (c: 1 | 2 | 3) => enabled.filter(w => w.col === c);
  const mOrder = (id: string) => {
    const i = state.mobileOrder.indexOf(id);
    return i === -1 ? 99 : i;
  };

  // 右鍵調整重疊順序（v1.8）— 在具有 z 的 Widget 之間移動
  const zOp = (mode: 'top' | 'bottom' | 'up' | 'down') => {
    if (!ctx) return;
    const all = enabled.filter(w => w.z != null);
    const me = enabled.find(w => w.id === ctx.id);
    if (!me) return;
    const zs = all.map(w => w.z!) ;
    const cur = me.z ?? 0;
    if (mode === 'top') updateWidget(me.id, { z: (zs.length ? Math.max(...zs) : 0) + 1 });
    if (mode === 'bottom') updateWidget(me.id, { z: Math.max(0, (zs.length ? Math.min(...zs) : 1) - 1) });
    if (mode === 'up') {
      const hi = zs.filter(z => z > cur);
      if (hi.length) {
        const nz = Math.min(...hi);
        const other = all.find(w => w.z === nz)!;
        updateWidget(other.id, { z: cur });
        updateWidget(me.id, { z: nz });
      }
    }
    if (mode === 'down') {
      const lo = zs.filter(z => z < cur);
      if (lo.length) {
        const nz = Math.max(...lo);
        const other = all.find(w => w.z === nz)!;
        updateWidget(other.id, { z: cur });
        updateWidget(me.id, { z: nz });
      }
    }
    setCtx(null);
  };

  const frame = (w: WidgetConf, className?: string) => (
    <WidgetFrame key={w.id} conf={w} mobileOrder={mOrder(w.id)} className={className}
      onCtx={(id, x, y) => {
        // 右鍵時賦予 z 預設值（使其成為可調整重疊順序的對象）
        if (state.widgets.find(v => v.id === id)?.z == null) {
          const zs = enabled.map(v => v.z ?? 0);
          updateWidget(id, { z: Math.max(...zs, 0) + 1 });
        }
        setCtx({ id, x, y });
      }}>
      {renderWidget(w)}
    </WidgetFrame>
  );

  // PC 絕對定位（v1.9 使用者確認）— 所有 Widget 都有絕對座標時進入 Canvas 模式：
  // 沒有文件流（允許重疊・彼此不會推開）。沒有座標的已儲存資料會由下方 effect
  // 將原本的欄位流渲染位置快照一次後進行遷移。手機則由 CSS 恢復為流式堆疊。
  const absMode = enabled.length > 0 && enabled.every(w => w.ax != null && w.ay != null);
  const gridRef = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (absMode) return;
    const t = setTimeout(() => {
      const gr = gridRef.current?.getBoundingClientRect();
      if (!gr || gr.width < 100) return;   // 手機／尚未測量的狀態下不進行快照
      enabled.forEach(w => {
        if (w.ax != null) return;
        const el = document.querySelector(`[data-wid="${w.id}"]`);
        if (!el) return;
        const r = el.getBoundingClientRect();
        updateWidget(w.id, {
          ax: Math.round(r.left - gr.left), ay: Math.round(r.top - gr.top),
          w: w.w ?? Math.max(160, Math.round(r.width)), h: w.h ?? Math.max(80, Math.round(r.height)),
          tx: 0, ty: 0,
        }, { persist: true });
      });
    }, 250);   // 字體・圖片載入後，在穩定的版面配置中進行測量
    return () => clearTimeout(t);
  }, [absMode, enabled.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const canvasH = absMode
    ? Math.max(400, ...enabled.map(w => (w.ay ?? 0) + (w.h ?? 200))) + 40
    : undefined;

  return (
    <section className="page page-main-wrap" onClick={() => setCtx(null)}>
      <div ref={gridRef} className={`main-grid ${absMode ? 'abs' : ''} ${gridOn ? 'gridlines' : ''}`}
        style={{ marginTop: 12, ...(canvasH ? { height: canvasH } : {}) }}>
        {absMode ? (
          /* 絕對定位 Canvas — 所有 Widget 都是直接子元素，座標各自使用 ax/ay */
          enabled.map(w =>
            w.type === 'member'
              ? <WidgetFrame key={w.id} conf={w} mobileOrder={-1} onCtx={(id, x, y) => setCtx({ id, x, y })}><MemberBox /></WidgetFrame>
              : frame(w, w.type === 'menu' ? 'wgt-hide-pc' : undefined))
        ) : (
          <>
            {/* （遷移前的一次性）原本的欄位流渲染 — 位置快照後切換為絕對定位 */}
            <div>
              {byCol(1).map(w => frame(w, w.type === 'menu' ? 'wgt-hide-pc' : undefined))}
            </div>
            <div>
              {byCol(2).map(w =>
                w.type === 'banner' ? frame(w) : null
              )}
              <div className="g2" style={{ marginTop: 10 }}>
                {byCol(2).filter(w => w.type !== 'banner').map(w => frame(w))}
              </div>
            </div>
            <div>
              {byCol(3).map(w =>
                w.type === 'member'
                  ? <WidgetFrame key={w.id} conf={w} mobileOrder={-1} onCtx={(id, x, y) => setCtx({ id, x, y })}><MemberBox /></WidgetFrame>
                  : frame(w)
              )}
            </div>
          </>
        )}
      </div>

      {/* 右鍵 Context Menu（重疊順序 v1.8 · 忽略網格 v1.9 · 設定・刪除 v1.9 使用者確認） */}
      {ctx && (() => {
        const me = enabled.find(w => w.id === ctx.id);
        if (!me) return null;
        return (
          <div className="ctx-menu on" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
            {/* 顯示是哪個 Widget — 可重複新增的 Widget 以編號區分（v1.9） */}
            <div className="ctx-ttl">{widgetLabel(state.widgets, me)}</div>
            <div className="sep" />
            <button onClick={() => zOp('top')}>移到最上層</button>
            <button onClick={() => zOp('up')}>上移</button>
            <button onClick={() => zOp('down')}>下移</button>
            <button onClick={() => zOp('bottom')}>移到最下層</button>
            {/* 讓文字・圖片等裝飾元素不受網格限制，自由配置（v1.9 使用者確認） */}
            <button onClick={() => { updateWidget(me.id, { freeMove: !me.freeMove }); setCtx(null); }}>
              {me.freeMove ? '套用網格' : '忽略網格'}
            </button>
            {(EDITABLE.includes(me.type) || !me.fixed) && <div className="sep" />}
            {/* 內容編輯 — 即使在編輯模式中，也可以透過右鍵開啟設定 Modal（v1.9 使用者確認） */}
            {EDITABLE.includes(me.type) && (
              <button onClick={() => {
                window.dispatchEvent(new CustomEvent('ohome-widget-edit', { detail: { id: me.id } }));
                setCtx(null);
              }}>設定</button>
            )}
            {!me.fixed && (
              <button className="danger" onClick={() => { setDelAsk(me); setCtx(null); }}>刪除 Widget</button>
            )}
          </div>
        );
      })()}

      {/* Widget 刪除警告（v1.9 — 所有刪除都會顯示警告 Modal） */}
      <ConfirmModal open={delAsk !== null}
        title={`「${delAsk ? widgetLabel(state.widgets, delAsk) : ''}」Widget 要刪除嗎？`}
        body="Widget 會從首頁刪除。刪除必須在結束編輯時選擇「儲存後結束」才會確認；選擇「不儲存直接結束」則會恢復。"
        onClose={() => setDelAsk(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { if (delAsk) removeWidget(delAsk.id); setDelAsk(null); toast('Widget 已刪除 — 結束編輯時儲存後才會確認'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(null) },
        ]} />

      {/* Widget 新增 Modal（4.0 · 防止重複 v1.9 — 只有圖片・自由文字可以新增多個） */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} small
        title="新增 Widget" desc="選擇類型與配置欄位 — 已新增的 Widget 無法再次新增（圖片・自由文字除外）"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            if (!MULTI_TYPES.includes(addType) && state.widgets.some(w => w.type === addType)) return;
            const id = addWidget(addType, Number(addCol) as 1 | 2 | 3);
            setAddOpen(false);
            toast('Widget 已新增 — 可以從右鍵選單進行設定・刪除');
            // 新增位置可能在畫面外（欄位底部），因此捲動到新的 Widget（v1.9 使用者回饋）
            setTimeout(() => document.querySelector(`[data-wid="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
          }}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 7, marginBottom: 14 }}>
          {ADDABLE.map(t => {
            const taken = !MULTI_TYPES.includes(t) && state.widgets.some(w => w.type === t);
            return (
              <KRadio key={t} name="wgt-type" value={t} current={addType} disabled={taken}
                onChange={v => setAddType(v as WidgetType)}
                label={<span>
                  <b style={{ fontSize: 12.5 }}>{WIDGET_META[t].title}</b>{' '}
                  <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{WIDGET_META[t].desc}</small>
                  {taken && <span className="pill" style={{ marginLeft: 6 }}>已新增</span>}
                  {MULTI_TYPES.includes(t) && <span className="pill" style={{ marginLeft: 6 }}>可重複新增</span>}
                </span>} />
            );
          })}
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          <KRadio name="wgt-col" value="1" current={addCol} onChange={v => setAddCol(v as '1')} label="左側欄" />
          <KRadio name="wgt-col" value="2" current={addCol} onChange={v => setAddCol(v as '2')} label="中央" />
          <KRadio name="wgt-col" value="3" current={addCol} onChange={v => setAddCol(v as '3')} label="右側欄" />
        </div>
      </Modal>
    </section>
  );
}