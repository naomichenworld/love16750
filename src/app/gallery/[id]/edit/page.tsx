'use client';
// 圖片備份編輯（4.11）— 僅限作者或管理員
import React from 'react';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { BackupForm } from '@/components/backup/BackupForm';
import { PageTitle } from '@/components/ui/PageText';

export default function BackupEditPage() {
  const { id } = useParams<{ id: string }>();
  const { user, isAdmin } = useAuth();
  const [posts, , loaded] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  const p = posts.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  // 沒有 authorId 的文章 + 未登入時兩者都是 undefined，原本會因此通過判斷（v2.0 發現）
  if (!p || !(isAdmin || (!!p.authorId && p.authorId === user?.id))) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>EDIT</PageTitle><p>找不到文章，或沒有編輯權限</p></div>
      </section>
    );
  }
  return <BackupForm initial={p} />;
}