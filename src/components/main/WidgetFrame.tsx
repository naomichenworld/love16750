'use client';
// Widget 框架（4.0 編輯模式）— 拖曳移動・右下角調整大小・右鍵調整重疊順序・點擊阻擋
// 沿用原型的編輯模型：保留網格配置，使用 transform 偏移 + 固定大小（px）進行操作
import React, { useEffect, useRef, useState } from 'react';
import { WidgetConf, useMainStore } from '@/lib/mainStore';
import { ConfirmModal } from '@/components/ui/Modal';

export function WidgetFrame({ conf, mobileOrder, children, className, style, onCtx }: {
  conf: WidgetConf;
  mobileOrder: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onCtx: (id: string, x: number, y: number) => void;
}) {
  const { editOn, gridOn, updateWidget } = useMainStore();
  // 主頁始終使用固定畫布（v1.9 — 移除響應式選項，只有 PC／行動版兩種）— 儲存的大小始終維持
  const useSize = true;
  const ref = useRef<HTMLDivElement>(null);
  // Shift+拖曳中央對齊時，如果寬度不是 20px 的倍數而無法剛好置中時的提示（v1.9 使用者要求）
  const [centerAsk, setCenterAsk] = useState<{ w: number; canvasW: number; grow: number; shrink: number } | null>(null);

  // 進入編輯模式時固定大小（v1.8 — Widget 大小獨立）
  // 直接固定目前渲染出的大小 — 進入編輯模式本身不會讓 Widget 移動或變大
  // （網格對齊絕對由網格吸附負責，因此這裡不進行 10px 四捨五入）
  useEffect(() => {
    if (!editOn || !ref.current) return;
    if (conf.w == null || conf.h == null) {
      const r = ref.current.getBoundingClientRect();
      if (r.width > 2) {
        updateWidget(conf.id, {
          w: Math.max(160, Math.round(r.width)),
          h: Math.max(80, Math.round(r.height)),
        });
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editOn]);

  // PC 絕對配置（v1.9 使用者確認）— 有 ax/ay 時使用畫布絕對座標渲染。
  // 因為沒有文件流，所以拖曳・調整大小時不會把其他 Widget 推開，不符合時就會重疊。
  const abs = conf.ax != null && conf.ay != null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!editOn || e.button !== 0) return;
    const t = e.target as HTMLElement;
    // body portal（設定 Modal・Select 彈窗・Color Picker 等）會以 React Tree 形式冒泡進來 — 不是拖曳開始（v1.9）
    if (!ref.current?.contains(t)) return;
    if (t.closest('.rs') || t.closest('.rr')) return;
    e.preventDefault();
    document.body.classList.add('drag-move');   // 拖曳期間固定全域游標 — 避免游標跳動（v1.9）
    const sx = e.clientX, sy = e.clientY;
    if (abs) {
      // 絕對座標移動 — 網格原點 = 畫布左上角，因此吸附計算也很簡單
      const bx = conf.ax!, by = conf.ay!;
      // Shift+拖曳 = 對齊畫布水平正中央（v1.9 使用者要求）
      const canvasW = (ref.current?.closest('.main-grid') as HTMLElement | null)?.clientWidth ?? 0;
      const myW = () => conf.w ?? Math.round(ref.current?.getBoundingClientRect().width ?? 0);
      let centered = false;
      const mv = (ev: PointerEvent) => {
        const nx = bx + (ev.clientX - sx), ny = by + (ev.clientY - sy);
        const snap = gridOn && !conf.freeMove;   // freeMove（忽略網格）即使網格開啟也可以自由配置
        if (ev.shiftKey && canvasW > 0) {
          centered = true;
          const cx = (canvasW - myW()) / 2;
          updateWidget(conf.id, {
            ax: snap ? Math.round(cx / 10) * 10 : Math.round(cx),
            ay: snap ? Math.round(ny / 10) * 10 : ny,
          });
          return;
        }
        centered = false;
        if (snap) updateWidget(conf.id, { ax: Math.round(nx / 10) * 10, ay: Math.round(ny / 10) * 10 });
        else updateWidget(conf.id, { ax: nx, ay: ny });
      };
      const up = () => {
        document.body.classList.remove('drag-move');
        window.removeEventListener('pointermove', mv);
        window.removeEventListener('pointerup', up);
        // 如果要在網格（10px）中剛好置中，（畫布寬度 - 寬度）必須是 20 的倍數 — 否則會偏移 5px
        if (centered && gridOn && !conf.freeMove && canvasW > 0) {
          const w = myW();
          const r = (((canvasW - w) % 20) + 20) % 20;
          if (r !== 0) setCenterAsk({ w, canvasW, grow: r, shrink: 20 - r });
        }
      };
      window.addEventListener('pointermove', mv);
      window.addEventListener('pointerup', up);
      return;
    }
    // （遷移前的備援）流式配置 + transform 偏移
    const bx = conf.tx, by = conf.ty;
    const gr = ref.current?.closest('.main-grid')?.getBoundingClientRect();
    const r0 = ref.current?.getBoundingClientRect();
    const natX = gr && r0 ? r0.left - bx - gr.left : 0;
    const natY = gr && r0 ? r0.top - by - gr.top : 0;
    const mv = (ev: PointerEvent) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      if (gridOn && !conf.freeMove) {
        updateWidget(conf.id, {
          tx: Math.round((natX + bx + dx) / 10) * 10 - natX,
          ty: Math.round((natY + by + dy) / 10) * 10 - natY,
        });
      } else {
        updateWidget(conf.id, { tx: bx + dx, ty: by + dy });
      }
    };
    const up = () => { document.body.classList.remove('drag-move'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  // 傾斜（v1.9 使用者要求 — 圖片・自由文字）— 拖曳左上角控制點，以 Widget 中心為基準旋轉
  const rotatable = conf.type === 'deco' || conf.type === 'freetext';
  const onRotDown = (e: React.PointerEvent) => {
    if (!editOn) return;
    e.stopPropagation(); e.preventDefault();
    const r = ref.current!.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    const base = conf.rot ?? 0;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx);
    document.body.classList.add('drag-move');
    const mv = (ev: PointerEvent) => {
      let deg = base + (Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180 / Math.PI;
      deg = gridOn && !conf.freeMove ? Math.round(deg / 5) * 5 : Math.round(deg);
      if (deg > 180) deg -= 360;
      if (deg < -180) deg += 360;
      updateWidget(conf.id, { rot: deg === 0 ? undefined : deg });
    };
    const up = () => { document.body.classList.remove('drag-move'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  // 調整大小 — 因為是絕對配置，不會重新排列流式配置，因此即時套用也不會推開其他 Widget（v1.9）
  const onResizeDown = (e: React.PointerEvent) => {
    if (!editOn) return;
    e.stopPropagation(); e.preventDefault();
    document.body.classList.add('drag-rs');   // 調整大小期間固定全域游標（v1.9）
    const r = ref.current!.getBoundingClientRect();
    const sx = e.clientX, sy = e.clientY;
    // 絕對網格吸附：即使左上角不在網格上，也會讓「右／下方邊角」落在畫布網格上
    const gr = ref.current!.closest('.main-grid')?.getBoundingClientRect();
    const absL = abs ? conf.ax! : (gr ? r.left - gr.left : 0);
    const absT = abs ? conf.ay! : (gr ? r.top - gr.top : 0);
    const mv = (ev: PointerEvent) => {
      const dw = ev.clientX - sx, dh = ev.clientY - sy;
      let w = r.width + dw, h = r.height + dh;
      if (gridOn && !conf.freeMove) {
        w = Math.round((absL + w) / 10) * 10 - absL;
        h = Math.round((absT + h) / 10) * 10 - absT;
      }
      updateWidget(conf.id, { w: Math.max(160, w), h: Math.max(80, h) });
    };
    const up = () => { document.body.classList.remove('drag-rs'); window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  return (
    <div
      ref={ref}
      data-wid={conf.id}
      className={`wgt ${useSize && conf.w != null ? 'sized' : ''} ${conf.mOff ? 'wgt-hide-m' : ''} ${className ?? ''}`}
      style={{
        ...style,
        order: mobileOrder,
        // 絕對配置（v1.9）— PC 畫布沒有流式配置。行動版 CSS 會恢復為 static 以堆疊渲染
        // 傾斜（rot）會與 transform 合併 — 行動版堆疊時由 CSS 解除（v1.9）
        ...(abs
          ? {
            position: 'absolute' as const, left: conf.ax, top: conf.ay, margin: 0,
            transform: conf.rot ? `rotate(${conf.rot}deg)` : undefined,
          }
          : {
            transform: [
              conf.tx || conf.ty ? `translate(${conf.tx}px, ${conf.ty}px)` : '',
              conf.rot ? `rotate(${conf.rot}deg)` : '',
            ].join(' ').trim() || undefined,
          }),
        width: useSize && conf.w != null ? conf.w : undefined,
        height: useSize && conf.h != null ? conf.h : undefined,
        zIndex: conf.z,
      }}
      onPointerDown={onPointerDown}
      onContextMenu={e => {
        if (!editOn) return;
        if (!ref.current?.contains(e.target as Node)) return;   // 設定 Modal 內右鍵維持原樣
        e.preventDefault();
        onCtx(conf.id, e.clientX, e.clientY);
      }}
      // 編輯模式中阻擋點擊（v1.8）— 但 body portal（設定 Modal 等）的點擊會通過（v1.9）
      onClickCapture={e => {
        if (!editOn) return;
        const t = e.target as HTMLElement;
        if (!ref.current?.contains(t)) return;
        if (t.closest('.rs') || t.closest('.rr')) return;
        e.stopPropagation(); e.preventDefault();
      }}
    >
      {children}
      {/* Shift+拖曳中央對齊 — 寬度不合而偏移 5px 時，可選擇水平要往哪一側調整（v1.9 使用者要求） */}
      <ConfirmModal open={centerAsk !== null}
        title="要剛好置中，必須調整水平尺寸"
        body={centerAsk
          ? `因為網格是 10px 單位，目前水平尺寸（${centerAsk.w}px）會從中央偏移 5px。要將水平尺寸往哪個方向調整？`
          : undefined}
        onClose={() => setCenterAsk(null)}
        buttons={[
          {
            label: `水平 +${centerAsk?.grow ?? 10}px`, kind: 'dark',
            onClick: () => {
              if (centerAsk) {
                const w = centerAsk.w + centerAsk.grow;
                updateWidget(conf.id, { w, ax: (centerAsk.canvasW - w) / 2 }, { persist: true });
              }
              setCenterAsk(null);
            },
          },
          {
            label: `水平 −${centerAsk?.shrink ?? 10}px`, kind: 'ghost',
            onClick: () => {
              if (centerAsk) {
                const w = Math.max(160, centerAsk.w - centerAsk.shrink);
                updateWidget(conf.id, { w, ax: (centerAsk.canvasW - w) / 2 }, { persist: true });
              }
              setCenterAsk(null);
            },
          },
          { label: '維持原樣', kind: 'ghost', onClick: () => setCenterAsk(null) },
        ]} />
      <span className="rs" data-tip="拖曳調整大小" onPointerDown={onResizeDown} />
      {rotatable && (
        <span className="rr" data-tip="拖曳調整傾斜・雙擊 = 重設"
          onPointerDown={onRotDown}
          onDoubleClick={() => updateWidget(conf.id, { rot: undefined })} />
      )}
    </div>
  );
}