'use client';
// 卡片網格/表格編輯模式拖曳排序 (v1.9)
// 拖曳中即時重新排列 — 經過的位置會即時空出位置，其他項目會被推開
// 可以直接看到項目最後會插入哪裡（規格第 6 章 DnD UI 要求：呈現 placeholder 展開的感覺）。
// 如果正在使用篩選/搜尋而只顯示部分項目，會將目前顯示的順序放到前面，其餘項目接在後面。
import { useRef, useState, type DragEvent, type CSSProperties } from 'react';

export function useCardSort<T>(shown: T[], save: (nextShown: T[]) => void, enabled: boolean) {
  const dragIdx = useRef<number | null>(null);
  const [draggingIdx, setDraggingIdx] = useState<number | null>(null);

  const end = () => { dragIdx.current = null; setDraggingIdx(null); };

  const props = (i: number): Record<string, unknown> => {
    if (!enabled) return {};
    return {
      draggable: true,
      onDragStart: (e: DragEvent) => {
        dragIdx.current = i;
        setDraggingIdx(i);
        try { e.dataTransfer?.setData('text/plain', ''); } catch { /* 忽略 */ }
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
      },
      onDragOver: (e: DragEvent) => {
        e.preventDefault();
        const from = dragIdx.current;
        if (from == null || from === i) return;
        // 即時重新排列 — 拖曳項目移動到這個位置，並讓原本的位置空出來
        const next = [...shown];
        const [moved] = next.splice(from, 1);
        next.splice(i, 0, moved);
        dragIdx.current = i;
        setDraggingIdx(i);
        save(next);
      },
      onDrop: (e: DragEvent) => { e.preventDefault(); end(); },
      onDragEnd: end,
      style: {
        cursor: 'var(--cur-grab,grab)',
        outline: draggingIdx === i ? '2px solid var(--accent)' : '1.5px dashed rgba(201,106,115,.55)',
        outlineOffset: 3,
        opacity: draggingIdx === i ? 0.35 : undefined,
        transition: 'opacity .12s',
      } as CSSProperties,
    };
  };

  return props;
}

/** 部分顯示（篩選・搜尋）中的排序儲存 — 將目前顯示的順序放到前面，其餘維持原本順序接在後面 */
export function mergeOrder<T extends { id: string }>(all: T[], reorderedShown: T[]): T[] {
  const shownIds = new Set(reorderedShown.map(x => x.id));
  return [...reorderedShown, ...all.filter(x => !shownIds.has(x.id))];
}