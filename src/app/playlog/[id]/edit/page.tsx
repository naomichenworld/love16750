'use client';
// 編輯遊玩紀錄 (4.16) — 頁面型編輯
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { useSectionTitle } from '@/lib/sectionStore';
import { PlayRecord, PLAYLOG_SEED } from '@/lib/galleryStore';
import { PlaylogForm } from '@/components/trpg/PlaylogForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

export default function PlaylogEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [records, setRecords, loaded] = useLocalList<PlayRecord>('ohome.playlog.v1', PLAYLOG_SEED);
  // 大字標題 — 如果是額外區段項目則使用該區段名稱，點擊後也回到該列表（v2.0 使用者回報）
  const tt = useSectionTitle('playlog', records.find(x => x.id === id)?.secId, 'EDIT RECORD');
  const r = records.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  if (!isAdmin || !r) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>找不到紀錄或沒有權限</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>{r.scenario}</p></div>
      <PlaylogForm initial={r} records={records}
        onCancel={() => router.push('/playlog')}
        onSave={v => {
          setRecords(records.map(x => (x.id === r.id ? { ...x, ...v, date: v.date, url: v.url, logId: v.logId, scenarioLink: v.scenarioLink } : x)));
          toast('已儲存');
          router.push('/playlog');
        }} />
    </section>
  );
}
