// 檔案拖放通用 props（v1.9）— 可以在任何上傳按鈕・區域使用 {...fileDrop(fn)} 來套用
import type { DragEvent } from 'react';

export function fileDrop(onFiles: (files: FileList) => void) {
  return {
    onDragOver: (e: DragEvent) => { e.preventDefault(); },
    onDrop: (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) onFiles(e.dataTransfer.files);
    },
  };
}