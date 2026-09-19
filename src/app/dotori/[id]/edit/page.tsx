'use client';
// 橡果編輯（4.15）— 頁面型編輯
import React from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { useSectionTitle } from '@/lib/sectionStore';
import { DotoriItem, DOTORI_SEED } from '@/lib/galleryStore';
import { DotoriForm } from '@/components/trpg/DotoriForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

export default function DotoriEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems, loaded] = useLocalList<DotoriItem>('ohome.dotori.v1', DOTORI_SEED);
  // 大字標題 — 如果是額外區段項目就使用該區段名稱，點擊時也回到該列表（v2.0 使用者回報）
  const tt = useSectionTitle('dotori', items.find(x => x.id === id)?.secId, 'EDIT DOTORI');
  const it = items.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  if (!isAdmin || !it) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>找不到項目，或沒有權限</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>{it.name}</p></div>
      <DotoriForm initial={it}
        onCancel={() => router.push('/dotori')}
        onSave={v => {
          setItems(items.map(x => (x.id === it.id ? { ...x, ...v } : x)));
          toast('已儲存');
          router.push('/dotori');
        }} />
    </section>
  );
}
