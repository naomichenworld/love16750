'use client';
// 套用自訂滑鼠游標（5.1 v1.1 · v1.9 動畫）— 將各狀態的已登錄圖片注入全域樣式。
// 未登錄的狀態使用預設游標作為 fallback · 全部關閉時移除樣式。
// .ani（Windows 動畫游標）會擷取影格並替換 CSS cursor 來播放（lib/aniCursor）。
// .cur 直接使用檔案內建的熱點（省略 CSS 座標）。
import { useEffect } from 'react';
import { useCursorSettings, CursorState } from '@/lib/cursorStore';
import { getBlob } from '@/lib/blobStore';
import { parseAni, isCur } from '@/lib/aniCursor';

// 狀態 → 全域 CSS 變數（v1.9）— globals.css·行內樣式中的 cursor:var(--cur-pointer,pointer) /
// var(--cur-grab,grab) 所有使用位置都會自動套用。透過列出選擇器無法涵蓋的 div+onClick 元素
// （Logo·通知鈴鐺·個人檔案等）也會由此變數涵蓋 — 未登錄狀態時使用 fallback 關鍵字運作。
const VAR_NAME: Partial<Record<CursorState, string>> = {
  default: '--cur-default', pointer: '--cur-pointer', grab: '--cur-grab', active: '--cur-active',
  // 尺寸調整 4 方向（v1.9）— .rs 控制點·拖曳中使用全域固定規則
  rsNwse: '--cur-rs-nwse', rsNesw: '--cur-rs-nesw', rsEw: '--cur-rs-ew', rsNs: '--cur-rs-ns',
};

// 狀態 → 套用選擇器（包含游標 fallback）
const RULES: Record<CursorState, { sel: string; fallback: string }> = {
  default: { sel: 'body, .page, .panel', fallback: 'auto' },
  pointer: {
    sel: [
      'a', 'button', 'label', '.btn', '.tag', '.pill', '.k-select', '.k-toggle', '.k-check', '.k-radio',
      '.rp-room', '.thr-item', '.memo-list-item', '.fc', '.g-item', '.char-card', '.rel-card',
      '.cm-card', '.dt-card', '.tc-card', '.list-item', '.brow', '.ap-row', '.ticket', '.more', '.cur',
    ].join(', '),
    fallback: 'pointer',
  },
  text: { sel: 'input, textarea, [contenteditable="true"], .re-content', fallback: 'text' },
  active: { sel: 'body:active, *:active', fallback: 'auto' },
  // .wgt 只有在編輯模式下才能拖曳 — 修正平常在 Banner 等 Widget 上會顯示 grab 的問題（v1.9）
  // 編輯模式下統一主區域整體使用 grab — 避免拖曳時經過內部元素導致游標跳動
  // 排除編輯控制點（.rs 尺寸調整 · .rr 傾斜）— 整體 grab 規則（!important）會蓋掉控制點游標，
  // 導致系統游標與自訂游標混合而顯示異常的問題（v1.9 使用者發現）
  grab: { sel: '.drag-h, .postit:not(.ro), [draggable="true"], body.edit-on .page-main-wrap, body.edit-on .page-main-wrap *:not(.rs):not(.rr)', fallback: 'grab' },
  // 尺寸調整 4 方向（v1.9 使用者要求）— nwse 是 Widget 右下角控制點，其餘是預留類別（未來使用位置）
  rsNwse: { sel: '.wgt .rs, .cur-rs-nwse', fallback: 'nwse-resize' },
  rsNesw: { sel: '.cur-rs-nesw', fallback: 'nesw-resize' },
  rsEw: { sel: '.cur-rs-ew', fallback: 'ew-resize' },
  rsNs: { sel: '.cur-rs-ns', fallback: 'ns-resize' },
};

interface AnimState { key: CursorState; urls: string[]; delays: number[] }

export function CursorLayer() {
  const [st] = useCursorSettings();

  useEffect(() => {
    const styleId = 'ohome-cursor-style';
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!st.enabled || Object.keys(st.states).length === 0) {
      styleEl?.remove();
      return;
    }
    let cancelled = false;
    const urls: string[] = [];
    const timers: number[] = [];
    (async () => {
      const staticParts: string[] = [];
      const anims: AnimState[] = [];
      for (const key of Object.keys(st.states) as CursorState[]) {
        const entry = st.states[key];
        if (!entry) continue;
        const blob = await getBlob(entry.imgId);
        if (!blob || cancelled) continue;
        const buf = await blob.arrayBuffer();
        if (cancelled) return;
        const ani = parseAni(buf);
        if (ani) {
          // 按步驟順序建立影格 URL 陣列 — 計時器會依照此順序替換游標
          const frameUrls = ani.frames.map(f => { const u = URL.createObjectURL(f); urls.push(u); return u; });
          anims.push({ key, urls: ani.steps.map(i => frameUrls[i]), delays: ani.delays });
        } else {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          const rule = RULES[key];
          // .cur 使用內建熱點 — 因為部分瀏覽器加上 CSS 座標後會忽略，所以省略
          const hs = isCur(buf) ? '' : ` ${entry.hx} ${entry.hy}`;
          staticParts.push(`${rule.sel}{cursor:url("${url}")${hs}, ${rule.fallback} !important}`);
          const vn = VAR_NAME[key];
          if (vn) staticParts.push(`:root{${vn}:url("${url}")${hs}, ${rule.fallback}}`);
        }
      }
      if (cancelled) return;
      if (!styleEl || !document.getElementById(styleId)) {
        styleEl = document.createElement('style');
        styleEl.id = styleId;
        document.head.appendChild(styleEl);
      }
      const stepIdx: Partial<Record<CursorState, number>> = {};
      const render = () => {
        const animParts = anims.flatMap(a => {
          const rule = RULES[a.key];
          const u = a.urls[stepIdx[a.key] ?? 0];
          const vn = VAR_NAME[a.key];
          return [
            `${rule.sel}{cursor:url("${u}"), ${rule.fallback} !important}`,
            ...(vn ? [`:root{${vn}:url("${u}"), ${rule.fallback}}`] : []),
          ];
        });
        styleEl!.textContent = [...staticParts, ...animParts].join('\n');
      };
      render();
      for (const a of anims) {
        if (a.urls.length < 2) continue;
        let i = 0;
        const tick = () => {
          if (cancelled) return;
          i = (i + 1) % a.urls.length;
          stepIdx[a.key] = i;
          render();
          timers.push(window.setTimeout(tick, a.delays[i] ?? 100));
        };
        timers.push(window.setTimeout(tick, a.delays[0] ?? 100));
      }
    })();
    return () => {
      cancelled = true;
      timers.forEach(t => clearTimeout(t));
      urls.forEach(u => URL.revokeObjectURL(u));
      document.getElementById(styleId)?.remove();
    };
  }, [st]);

  return null;
}