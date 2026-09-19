'use client';
// 委託登錄（4.18）— 頁面型
import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, secStamp, secQuery , useSectionTitle } from '@/lib/sectionStore';
import { useLocalList, newId } from '@/lib/postStore';
import { CommItem, COMM_SEED, useCommSettings } from '@/lib/commStore';
import { CommForm } from '@/components/comm/CommForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function CommNewPageInner() {
  // 從哪個區段點擊進入（v2.0）— 將新項目加入該列表
  const sec = useSectionParam('comm');
  // 大字標題 — 如果是額外區段就使用該區段名稱，點擊時也回到該列表（v2.0 使用者回報）
  const tt = useSectionTitle('comm', sec.id, 'ADD COMMISSION');
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings] = useCommSettings();

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>僅限管理員的頁面</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><EditableDesc k="comm-new-desc" def="委託登錄" /></div>
      <CommForm initial={null} settings={settings}
        onCancel={() => router.push('/comm' + secQuery('comm', sec.id))}
        onSave={v => {
          const c: CommItem = { id: newId(), ...v, ph: 'cool', date: new Date().toISOString() };
          setItems([{ ...c, ...secStamp(sec.id) }, ...items]);
          toast('委託已登錄');
          router.push(`/comm/${c.id}`);
        }} />
    </section>
  );
}

export default function CommNewPage() {
  return <Suspense fallback={<section className="page" />}><CommNewPageInner /></Suspense>;
}