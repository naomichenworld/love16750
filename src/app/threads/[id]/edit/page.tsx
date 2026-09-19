'use client';
// 感想串 — 作品資訊修改（4.17 頁面型）
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { ThreadWork, THREAD_SEED } from '@/lib/threadStore';
import { useSectionTitle } from '@/lib/sectionStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { ThreadForm } from '@/components/threads/ThreadForm';

export default function ThreadEditPage() {
  const { id } = useParams<{ id: string }>();
  const { isAdmin } = useAuth();
  // 大字標題 — 如果正在修改的感想串屬於額外區段，就使用該區段名稱，點擊後也回到該列表（v2.0 使用者回報）。
  // 修改網址中沒有 ?s=，因此從感想串自身的所屬區段（secId）讀取
  const [works] = useLocalList<ThreadWork>('ohome.threads.v1', THREAD_SEED);
  const tt = useSectionTitle('threads', works.find(w => w.id === id)?.secId, 'THREADS');
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
        <EditableDesc k="threads-edit-desc" def="作品資訊修改" />
      </div>
      <ThreadForm editId={id} />
    </section>
  );
}