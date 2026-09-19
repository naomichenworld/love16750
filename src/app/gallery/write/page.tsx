'use client';
// 圖片備份撰寫頁（4.11）— 使用共用表單（BackupForm），編輯則使用 /backup/[id]/edit
import React from 'react';
import { BackupForm } from '@/components/backup/BackupForm';

export default function BackupWritePage() {
  return <BackupForm initial={null} />;
}