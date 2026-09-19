'use client';
// TRPG 角色詳細頁（v1.9）— 左側大圖片（原圖／立繪，表情切換在此處）＋右側資訊・說明
import React, { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { TrpgChar, TCHAR_SEED, faceCrop } from '@/lib/tcharStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { Lightbox } from '@/components/ui/Lightbox';
import { ConfirmModal } from '@/components/ui/Modal';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

// 詳細頁主體（使用者確認）：單一印章 = 1:1 裁切 · 立繪印章 = 原始全身圖（維持原比例）
import { useBlobUrl } from '@/lib/blobStore';

function StandingImg({ imgId, ph }: { imgId?: string; ph: string }) {
  const url = useBlobUrl(imgId);
  if (!url) return <div className={`ph ${ph}`} style={{ position: 'absolute', inset: 0 }} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="" style={{ maxWidth: '100%', display: 'block' }} />;
}

export default function TCharDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [tchars, setTchars, loaded] = useLocalList<TrpgChar>('ohome.tchars.v1', TCHAR_SEED);
  const [faceIdx, setFaceIdx] = useState(0);
  const [delAsk, setDelAsk] = useState(false);
  const [lbOpen, setLbOpen] = useState(false);

  const c = tchars.find(x => x.id === id);
  if (!loaded) return <section className="page" />;
  if (!c) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>TRPG CHARACTERS</PageTitle><p>找不到角色</p></div>
      </section>
    );
  }

  const face = c.faces[Math.min(faceIdx, c.faces.length - 1)] ?? c.faces[0];

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>TRPG CHARACTERS</PageTitle>
        <EditableDesc k="tchars-detail-desc" def="點擊表情縮圖即可切換圖片" />
        <div className="head-actions">
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push(`/tchars/${c.id}/edit`)}>EDIT</button>}
          {isAdmin && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      <div className="tcd-layout">
        {/* 左側 — 目前表情原圖（立繪則顯示全身），點擊後放大 */}
        <div className="panel" style={{ padding: 14 }}>
          {c.imgMode === 'standing' ? (
            /* 立繪印章 — 維持全身原圖比例（點擊放大） */
            <div className="tcd-img" style={{
              aspectRatio: 'auto', minHeight: 260, display: 'grid', placeItems: 'center',
              cursor: face?.imgId ? 'zoom-in' : undefined,
            }}
              onClick={() => { if (face?.imgId) setLbOpen(true); }}>
              <StandingImg imgId={face?.imgId} ph={face?.ph ?? c.ph} />
            </div>
          ) : (
            /* 單一印章 — 1:1 規格 */
            <div className="tcd-img" style={{ cursor: face?.imgId ? 'zoom-in' : undefined }}
              onClick={() => { if (face?.imgId) setLbOpen(true); }}>
              <CroppedBlobImg fileRef={face?.imgId} crop={faceCrop(c, face)} ph={face?.ph ?? c.ph} />
            </div>
          )}
          {/* 表情切換 — 1:1 縮圖（立繪使用共用裁切位置） */}
          {c.faces.length > 1 && (
            <div className="tc-faces" style={{ marginTop: 10 }}>
              {c.faces.map((f, i) => (
                <div key={f.id} className={`fc ${i === faceIdx ? 'on' : ''}`}
                  data-tip={f.label || undefined}
                  onClick={() => setFaceIdx(i)}>
                  <CroppedBlobImg fileRef={f.imgId} crop={faceCrop(c, f)} ph={f.ph ?? c.ph} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右側 — 資訊＋說明 */}
        <div className="panel" style={{ padding: 24 }}>
          <h2 style={{ fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            {c.name}
            {c.role && <span className="pill dark">{c.role}</span>}
            {face?.label && c.faces.length > 1 && (
              <span className="pill" style={{ marginLeft: 'auto' }}>{face.label}</span>
            )}
          </h2>
          <div style={{ display: 'grid', gap: 7, padding: '12px 0', borderBottom: '1px dashed var(--line)', fontSize: 12.5 }}>
            {c.scenario && (
              <div style={{ display: 'flex', gap: 10 }}>
                <b style={{ minWidth: 70, color: 'var(--faint)', fontWeight: 600 }}>Scenario</b>{c.scenario}
              </div>
            )}
            {c.rule && (
              <div style={{ display: 'flex', gap: 10 }}>
                <b style={{ minWidth: 70, color: 'var(--faint)', fontWeight: 600 }}>Rule</b>{c.rule}
              </div>
            )}
            {c.role && (
              <div style={{ display: 'flex', gap: 10 }}>
                <b style={{ minWidth: 70, color: 'var(--faint)', fontWeight: 600 }}>Role</b>{c.role}
              </div>
            )}
          </div>
          {c.desc ? (
            <div className="post-body" style={{ fontSize: 13, paddingTop: 14 }}
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(c.desc) }} />
          ) : (
            <p className="hint" style={{ paddingTop: 14 }}>目前沒有說明</p>
          )}
        </div>
      </div>

      {lbOpen && face?.imgId && (
        <Lightbox srcs={c.faces.filter(f => f.imgId).map(f => f.imgId!)}
          index={c.faces.filter(f => f.imgId).findIndex(f => f.id === face.id)}
          onClose={() => setLbOpen(false)} />
      )}

      <ConfirmModal open={delAsk} title={`確定要刪除「${c.name}」嗎？`}
        body="刪除的角色無法復原。"
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setTchars(tchars.filter(x => x.id !== c.id)); router.push('/tchars'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}
