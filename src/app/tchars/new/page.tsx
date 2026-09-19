'use client';
// TRPG 角色登錄 (v1.9 — 頁面型)
import { useAuth } from '@/lib/auth';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { TCharForm } from '@/components/trpg/TCharForm';

export default function TCharNewPage() {
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>TRPG CHARACTERS</PageTitle><p>僅限管理員</p></div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>TRPG CHARACTERS</PageTitle>
        <EditableDesc k="tchars-new-desc" def="角色登錄 — 各表情圖片與 1:1 縮圖位置" />
      </div>
      <TCharForm />
    </section>
  );
}
