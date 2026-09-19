'use client';
// TRPG 角色修改 (v1.9 — 頁面型)
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { TCharForm } from '@/components/trpg/TCharForm';

export default function TCharEditPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>TRPG CHARACTERS</PageTitle><p>僅限管理員使用的頁面</p></div>
      </section>
    );
  }
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>TRPG CHARACTERS</PageTitle>
        <EditableDesc k="tchars-edit-desc" def="角色修改" />
      </div>
      <TCharForm editId={id} />
    </section>
  );
}
