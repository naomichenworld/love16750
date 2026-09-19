'use client';
// 申請者註冊／修改共用表單（4.18）— 置中的單一面板・內容使用 Rich Editor・
// CANCEL／儲存按鈕位於面板右下方
import React, { useRef, useState } from 'react';
import { Applicant, CommItem, CommSettings, applyVis, APPLY_VIS_LABEL } from '@/lib/commStore';
import { useMembers } from '@/lib/members';
import { putBlob } from '@/lib/blobStore';
import { fileDrop } from '@/lib/dnd';
import { KInput, KSelect, KDate } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { useToast } from '@/components/ui/Toast';

export function ApplicantForm({ initial, comms, settings, onSave, onCancel }: {
  initial: Applicant | null;
  comms: CommItem[];
  settings: CommSettings;
  onSave: (v: Omit<Applicant, 'id'>) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const isNew = !initial;
  const [deadline, setDeadline] = useState(initial?.deadline ?? '');
  const [badgeId, setBadgeId] = useState(initial?.badgeId ?? settings.applyBadges[0]?.id ?? 'wait');
  const [name, setName] = useState(initial?.name ?? '');
  const [nameOpen, setNameOpen] = useState(String(initial?.nameOpen ?? 1));
  const [source, setSource] = useState(initial?.source ?? '');
  const [appliedDate, setAppliedDate] = useState(initial?.appliedDate ?? '');
  const [commId, setCommId] = useState(initial?.commId ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [contentVis, setContentVis] = useState<'private' | 'self' | 'public'>(
    initial ? applyVis(initial) : 'private');
  // 允許本人查看 — 指定會員（搜尋後從下拉選單選擇）
  const pool = useMembers();
  const [selfId, setSelfId] = useState(initial?.selfId ?? '');
  const [selfQ, setSelfQ] = useState(() => pool.find(p => p.id === initial?.selfId)?.nickname ?? '');
  const [selfOpen, setSelfOpen] = useState(false);
  // 收到的申請表 HTML（可選）— 儲存至 blob
  const [submitFileId, setSubmitFileId] = useState<string | undefined>(initial?.submitFileId);
  const [submitFileName, setSubmitFileName] = useState('');
  const htmlRef = useRef<HTMLInputElement>(null);
  const pickHtml = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { toast('申請表檔案最多只能上傳 20MB'); return; }
    setSubmitFileId(await putBlob(f));
    setSubmitFileName(f.name);
    toast('申請表檔案已附加');
  };
  const selfMatches = pool.filter(p =>
    !selfQ.trim() || p.nickname.toLowerCase().includes(selfQ.trim().toLowerCase())
    || p.id.toLowerCase().includes(selfQ.trim().toLowerCase()));

  const save = () => {
    if (!name.trim()) { toast('請輸入申請者顯示名稱'); return; }
    onSave({
      deadline: deadline || undefined, badgeId, name: name.trim(),
      nameOpen: Math.max(0, parseInt(nameOpen, 10) || 0),
      source: source.trim() || undefined,
      appliedDate: appliedDate || undefined, commId: commId || undefined,
      content, contentVis, allowSelf: contentVis === 'self', // allowSelf 用於舊版本相容
      selfId: contentVis === 'self' ? (selfId || undefined) : undefined,
      submitFileId,
    });
  };

  return (
    <div className="panel" style={{ maxWidth: 620, margin: '0 auto', padding: 26, display: 'grid', gap: 13 }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label className="k-label" style={{ marginBottom: 5 }}>截止日（可選）</label>
          <KDate value={deadline} onChange={setDeadline} style={{ width: '100%' }} />
        </div>
        <div>
          <label className="k-label" style={{ marginBottom: 5 }}>申請日（可選）</label>
          <KDate value={appliedDate} onChange={setAppliedDate} style={{ width: '100%' }} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div style={{ flex: 1 }}>
          {/* 儲存完整名稱 — 對沒有權限的人只顯示設定的公開字數，其餘以 * 遮罩 */}
          <label className="k-label" style={{ marginBottom: 5 }}>申請者名稱 — 僅管理員顯示完整名稱</label>
          <KInput value={name} onChange={e => setName(e.target.value)} />
        </div>
        <div style={{ width: 110 }}>
          <label className="k-label" style={{ marginBottom: 5 }}>公開字數</label>
          <KInput value={nameOpen} onChange={e => setNameOpen(e.target.value.replace(/[^\d]/g, ''))}
            style={{ textAlign: 'center' }} />
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <div>
          <label className="k-label" style={{ marginBottom: 5 }}>進行狀態</label>
          <KSelect value={badgeId} onChange={setBadgeId}
            options={settings.applyBadges.map(b => ({ value: b.id, label: b.label }))} />
        </div>
        <div>
          <label className="k-label" style={{ marginBottom: 5 }}>申請委託</label>
          <KSelect value={commId} onChange={setCommId} placeholder="不選擇"
            options={[{ value: '', label: '不選擇' }, ...comms.map(cm => ({ value: cm.id, label: cm.name }))]} />
        </div>
      </div>
      <div>
        <label className="k-label" style={{ marginBottom: 5 }}>來源（可選）— 接受委託的地方</label>
        <KInput value={source} onChange={e => setSource(e.target.value)} />
      </div>
      <div>
        <label className="k-label" style={{ marginBottom: 5 }}>內容</label>
        <RichEditor value={content} onChange={setContent} placeholder="請填寫申請內容" />
      </div>
      {/* 收到的申請表 HTML（可選，v1.9）— 如果將以委託表單收到的檔案上傳至此，就能在列表中查看 */}
      <div>
        <label className="k-label" style={{ marginBottom: 5 }}>申請表 HTML（可選）</label>
        <input ref={htmlRef} type="file" accept=".html,text/html" style={{ display: 'none' }}
          onChange={e => { pickHtml(e.target.files?.[0]); e.target.value = ''; }} />
        {submitFileId ? (
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="pill dark">HTML</span>
            <small style={{ color: 'var(--sub)', fontSize: 12 }}>{submitFileName || '已附加的申請表'}</small>
            <span className="fx" onClick={() => { setSubmitFileId(undefined); setSubmitFileName(''); }}>✕</span>
          </div>
        ) : (
          <button className="btn btn-ghost" style={{ padding: '6px 13px', fontSize: 11 }}
            onClick={() => htmlRef.current?.click()}
            {...fileDrop(fl => pickHtml(fl[0]))}>↑ 選擇檔案</button>
        )}
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div>
          <label className="k-label" style={{ marginBottom: 5 }}>內容公開範圍</label>
          <KSelect value={contentVis} onChange={v => setContentVis(v as 'private')}
            options={[
              { value: 'private', label: APPLY_VIS_LABEL.private },
              { value: 'self', label: APPLY_VIS_LABEL.self },
              { value: 'public', label: APPLY_VIS_LABEL.public },
            ]} />
        </div>
        {/* 允許本人查看 — 搜尋並選擇哪位會員是本人（v1.9） */}
        {contentVis === 'self' && (
          <div style={{ flex: 1, minWidth: 180, position: 'relative' }}>
            <label className="k-label" style={{ marginBottom: 5 }}>本人（會員搜尋）</label>
            <KInput value={selfQ}
              onChange={e => { setSelfQ(e.target.value); setSelfId(''); setSelfOpen(true); }}
              onFocus={() => setSelfOpen(true)}
              onBlur={() => setTimeout(() => setSelfOpen(false), 150)} />
            {selfId && (
              <small style={{ position: 'absolute', right: 8, top: 33, fontSize: 10.5, color: 'var(--accent)', fontWeight: 700 }}>✓</small>
            )}
            {selfOpen && selfMatches.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, marginTop: 4,
                background: 'var(--panel-solid)', border: '1px solid var(--line)', borderRadius: 10,
                boxShadow: 'var(--sh-dd)', padding: 4, maxHeight: 180, overflow: 'auto',
              }}>
                {selfMatches.map(p => (
                  <button key={p.id} type="button"
                    style={{
                      display: 'flex', justifyContent: 'space-between', width: '100%', textAlign: 'left',
                      padding: '7px 10px', borderRadius: 7, fontSize: 12.5,
                      background: selfId === p.id ? 'var(--btn-dark,#1d2025)' : undefined,
                      color: selfId === p.id ? 'var(--btn-dark-fg,#fff)' : 'var(--ink)',
                    }}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setSelfId(p.id); setSelfQ(p.nickname); setSelfOpen(false); }}>
                    <span>{p.nickname}</span>
                    <small style={{ color: selfId === p.id ? 'inherit' : 'var(--faint)' }}>{p.id}</small>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
      {/* 按鈕 — 位於面板右下方 */}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
        <button className="btn btn-ghost" onClick={onCancel}>CANCEL</button>
        <button className="btn btn-accent" style={{ padding: '9px 26px' }} onClick={save}>
          {isNew ? 'ADD' : 'SAVE'}
        </button>
      </div>
    </div>
  );
}