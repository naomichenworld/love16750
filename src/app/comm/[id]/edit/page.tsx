'use client';
// 委託編輯（4.18）— 頁面型
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { CommItem, COMM_SEED, useCommSettings } from '@/lib/commStore';
import { CommForm } from '@/components/comm/CommForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

export default function CommEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems, loaded] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings] = useCommSettings();
  const c = items.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  if (!isAdmin || !c) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>COMMISSION</PageTitle><p>找不到委託，或沒有權限</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle>EDIT COMMISSION</PageTitle><p>{c.name}</p></div>
      <CommForm initial={c} settings={settings}
        onCancel={() => router.push(`/comm/${c.id}`)}
        onSave={v => {
          setItems(items.map(x => (x.id === c.id ? { ...x, ...v } : x)));
          toast('已儲存');
          router.push(`/comm/${c.id}`);
        }} />
    </section>
  );
}