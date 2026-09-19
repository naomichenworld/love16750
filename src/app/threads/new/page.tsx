'use client';
// 感想串 — 開始新串（作品登錄，4.17 頁面型）
import { Suspense } from 'react';
import { useAuth } from '@/lib/auth';
import { useSectionParam, useSectionTitle } from '@/lib/sectionStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { ThreadForm } from '@/components/threads/ThreadForm';

function ThreadNewInner() {
  const { isAdmin } = useAuth();
  // 大字標題 — 如果從額外區段進入（?s=），使用該區段名稱，點擊後也回到該列表（v2.0 使用者回報）
  const sec = useSectionParam('threads');
  const tt = useSectionTitle('threads', sec.id, 'THREADS');
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>僅限管理員使用的頁面</p></div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <EditableDesc k="threads-new-desc" def="開始新串 — 登錄作品資訊後，就可以在串中繼續撰寫文章" />
      </div>
      <ThreadForm />
    </section>
  );
}

/** 因為需要讀取 ?s=，所以需要 Suspense 邊界（Next App Router） */
export default function ThreadNewPage() {
  return <Suspense fallback={<section className="page" />}><ThreadNewInner /></Suspense>;
}