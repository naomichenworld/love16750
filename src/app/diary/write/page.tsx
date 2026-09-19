'use client';
// 日記撰寫（4.14）— 頁面型
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import { DiaryPost, DIARY_SEED, Mood, MOOD_SEED } from '@/lib/diaryStore';
import { DiaryForm } from '@/components/diary/DiaryForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

export default function DiaryWritePage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [posts, setPosts] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  const [moods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>DIARY</PageTitle><p>只有管理員可以撰寫日記</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle>WRITE DIARY</PageTitle><EditableDesc k="diary-write-desc" def="日記撰寫" /></div>
      <DiaryForm initial={null} moods={moods}
        onCancel={() => router.push('/diary')}
        onSave={v => {
          const p: DiaryPost = { id: newId(), ...v };
          setPosts([p, ...posts]);
          toast('日記已登錄');
          router.push('/diary');
        }} />
    </section>
  );
}