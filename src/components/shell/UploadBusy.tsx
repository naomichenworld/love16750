'use client';
// 圖片上傳中提示（v2.0 使用者發現）— Firebase 上傳速度較慢時，畫面沒有任何反應
// 使用者會再次按下上傳，導致同一張圖片被上傳多次的問題。
// 重複圖片本身由 blobStore 透過內容雜湊阻止，而這裡則負責顯示「目前正在上傳」。
import React from 'react';
import { useUploading } from '@/lib/blobStore';

export function UploadBusy() {
  const n = useUploading();
  if (n <= 0) return null;
  return (
    <div className="up-busy" role="status" aria-live="polite">
      <span className="up-spin" />
      圖片上傳中{n > 1 ? ` (${n}張)` : ''} — 請稍候
    </div>
  );
}