'use client';
// 角色登錄頁面（4.4）— 專用頁面（不是 Modal）
import React, { Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED } from '@/lib/charStore';
import { useSectionParam, secStamp, secQuery , useSectionTitle } from '@/lib/sectionStore';
import { CharEditForm } from '@/components/chars/CharEditForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function CharNewInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [chars, setChars, loaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const sec = useSectionParam('chars');   // 從哪個角色列表點擊進入（v2.0）
  // 大字標題 — 如果是額外區段就使用該區段名稱，點擊時也回到該列表（v2.0 使用者回報）
  const tt = useSectionTitle('chars', sec.id, 'ADD CHARACTER');

  if (!loaded) return <section className="page" />;
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>僅限管理員</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <EditableDesc k="chars-new-desc" def="角色登錄 — 第一張插圖作為代表圖片 · 分頁內容在專用編輯畫面中撰寫" />
      </div>
      <CharEditForm
        initial={null}
        existingIds={chars.flatMap(c => [c.id, ...(c.slug ? [c.slug] : [])])}
        onCancel={() => router.push('/chars' + secQuery('chars', sec.id))}
        onSave={c => {
          setChars([...chars, { ...c, ...secStamp(sec.id) }]);
          toast('角色已登錄');
          router.push(`/chars/${c.id}`);
        }}
      />
    </section>
  );
}

export default function CharNewPage() {
  // useSearchParams 需要 Suspense 邊界（Next App Router）
  return <Suspense fallback={<section className="page" />}><CharNewInner /></Suspense>;
}