'use client';
// 新增遊玩紀錄 (4.16) — 頁面型登錄
import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, secStamp, secQuery , useSectionTitle } from '@/lib/sectionStore';
import { useLocalList, newId } from '@/lib/postStore';
import { PlayRecord, PLAYLOG_SEED } from '@/lib/galleryStore';
import { PlaylogForm } from '@/components/trpg/PlaylogForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function PlaylogNewPageInner() {
  // 從哪個區段進入 (v2.0) — 將新項目加入該列表
  const sec = useSectionParam('playlog');
  // 大字標題 — 如果是額外區段則使用該區段名稱，點擊後也回到該列表（v2.0 使用者回報）
  const tt = useSectionTitle('playlog', sec.id, 'ADD RECORD');
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [records, setRecords] = useLocalList<PlayRecord>('ohome.playlog.v1', PLAYLOG_SEED);

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>僅限管理員使用的頁面</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><EditableDesc k="playlog-new-desc" def="新增遊玩紀錄" /></div>
      <PlaylogForm initial={null} records={records}
        onCancel={() => router.push('/playlog' + secQuery('playlog', sec.id))}
        onSave={v => {
          setRecords([...records, { id: newId(), ...v, ...secStamp(sec.id) }]);
          toast('紀錄已新增');
          router.push('/playlog' + secQuery('playlog', sec.id));
        }} />
    </section>
  );
}

export default function PlaylogNewPage() {
  return <Suspense fallback={<section className="page" />}><PlaylogNewPageInner /></Suspense>;
}
