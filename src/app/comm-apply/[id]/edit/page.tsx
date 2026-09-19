'use client';
// 신청자 수정 (4.18) — 페이지형 · 삭제 포함
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Applicant, APPLY_SEED, CommItem, COMM_SEED, useCommSettings } from '@/lib/commStore';
import { ApplicantForm } from '@/components/comm/ApplicantForm';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

export default function ApplicantEditPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [apps, setApps, loaded] = useLocalList<Applicant>('ohome.commapply.v1', APPLY_SEED);
  const [comms] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings] = useCommSettings();
  const [delAsk, setDelAsk] = useState(false);
  const a = apps.find(x => x.id === id);

  if (!loaded) return <section className="page" />;
  if (!isAdmin || !a) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>APPLICANTS</PageTitle><p>신청을 찾을 수 없거나 권한이 없습니다</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>EDIT APPLICANT</PageTitle><p>{a.name}</p>
        <div className="head-actions">
          <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>
        </div>
      </div>
      <ApplicantForm initial={a} comms={comms} settings={settings}
        onCancel={() => router.push('/comm-apply')}
        onSave={v => {
          setApps(apps.map(x => (x.id === a.id ? { ...x, ...v } : x)));
          toast('저장되었습니다');
          router.push('/comm-apply');
        }} />
      <ConfirmModal open={delAsk} title="신청을 삭제하시겠습니까?"
        body={`"${a.name}" — 삭제하면 복구할 수 없습니다.`}
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setApps(apps.filter(x => x.id !== a.id)); router.push('/comm-apply'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}
