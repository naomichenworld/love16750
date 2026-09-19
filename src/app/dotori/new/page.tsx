'use client';
// 橡果登錄（4.15）— 頁面型登錄
import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, secStamp, secQuery , useSectionTitle } from '@/lib/sectionStore';
import { useLocalList, newId } from '@/lib/postStore';
import { DotoriItem, DOTORI_SEED } from '@/lib/galleryStore';
import { DotoriForm } from '@/components/trpg/DotoriForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function DotoriNewPageInner() {
  // 從哪個區段點擊進入（v2.0）— 將新項目加入該列表
  const sec = useSectionParam('dotori');
  // 大字標題 — 如果是額外區段就使用該區段名稱，點擊時也回到該列表（v2.0 使用者回報）
  const tt = useSectionTitle('dotori', sec.id, 'ADD DOTORI');
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [items, setItems] = useLocalList<DotoriItem>('ohome.dotori.v1', DOTORI_SEED);

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>僅限管理員的頁面</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><EditableDesc k="dotori-new-desc" def="登錄想要遊玩的劇本" /></div>
      <DotoriForm initial={null}
        onCancel={() => router.push('/dotori' + secQuery('dotori', sec.id))}
        onSave={v => {
          const it: DotoriItem = {
            id: newId(), ...v, link: v.link, ph: 'cool', date: new Date().toISOString(),
          };
          setItems([{ ...it, ...secStamp(sec.id) }, ...items]);
          toast('橡果已登錄');
          router.push('/dotori' + secQuery('dotori', sec.id));
        }} />
    </section>
  );
}

export default function DotoriNewPage() {
  return <Suspense fallback={<section className="page" />}><DotoriNewPageInner /></Suspense>;
}