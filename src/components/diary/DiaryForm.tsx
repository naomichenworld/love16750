'use client';
// 日記撰寫／編輯共用表單（4.14）— 標題 · 日期 · 心情 · 內容（MD）· 圖片 · 公開範圍
import React, { useState } from 'react';
import { DiaryPost, Mood, moodTint } from '@/lib/diaryStore';
import { Visibility } from '@/lib/charStore';
import { newId } from '@/lib/postStore';
import { KInput, KTextarea, KSelect, KDate } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { useConfirmDelete } from '@/components/ui/Modal';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';

export interface DiaryFormValue {
  title: string; date: string; moodId: string; body: string;
  imgIds: string[]; visibility: Visibility;
}

interface ImgItem { id: string; ref?: string; url?: string; file?: File }

function ImgThumb({ item }: { item: ImgItem }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  // eslint-disable-next-line @next/next/no-img-element
  return src ? <img src={src} alt="" style={{ width: 64, height: 48, objectFit: 'cover', borderRadius: 6 }} /> : null;
}

export function DiaryForm({ initial, moods, onSave, onCancel }: {
  initial: DiaryPost | null;
  moods: Mood[];
  onSave: (v: DiaryFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const isNew = !initial;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [date, setDate] = useState(initial?.date ?? todayStr);
  const [moodId, setMoodId] = useState(initial?.moodId ?? moods[0]?.id ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [imgs, setImgs] = useState<ImgItem[]>(() => (initial?.imgIds ?? []).map(r => ({ id: newId(), ref: r })));
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const del = useConfirmDelete();   // 圖片移除也會經過警告

  const save = async () => {
    if (!title.trim()) { toast('請輸入標題'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) { toast('請以 YYYY-MM-DD 格式輸入日期'); return; }
    const imgIds = await Promise.all(imgs.map(i => (i.file ? putBlob(i.file) : Promise.resolve(i.ref!))));
    onSave({ title: title.trim(), date, moodId, body, imgIds, visibility });
  };

  return (
    <div className="write-grid">
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 12, alignContent: 'start' }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <KInput placeholder="標題" value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
          <KDate value={date} onChange={setDate} style={{ maxWidth: 130 }} />
        </div>
        <div>
          <label className="k-label" style={{ marginBottom: 6 }}>心情</label>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {moods.map(m => (
              <button key={m.id}
                className="mood-pick"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 13px', borderRadius: 999,
                  border: `1.5px solid ${moodId === m.id ? m.color : 'var(--line)'}`,
                  background: moodId === m.id ? moodTint(m.color) : 'transparent',
                  fontSize: 12, transition: '.15s',
                }}
                onClick={() => setMoodId(m.id)}>
                <span style={{ color: m.color }}>{m.icon}</span> {m.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="k-label" style={{ marginBottom: 6 }}>內容 — 支援 Markdown</label>
          <KTextarea value={body} onChange={e => setBody(e.target.value)} style={{ minHeight: 180 }} />
        </div>
        <label className="k-label" style={{ margin: 0 }}>圖片（可選）— 依序顯示於正文下方 · ⠿ 調整順序</label>
        {imgs.length > 0 && (
          <DragList items={imgs} keyOf={i => i.id} onReorder={setImgs}
            render={i => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <ImgThumb item={i} />
                <span className="fx" style={{ marginLeft: 'auto' }}
                  onClick={() => del.ask('要移除這張圖片嗎？',
                    () => setImgs(l => l.filter(x => x.id !== i.id)))}>✕</span>
              </div>
            )} />
        )}
        <input id="dyImgF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => {
            const list = e.target.files;
            if (list) setImgs(prev => [...prev, ...Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }))]);
            e.target.value = '';
          }} />
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
          onClick={() => document.getElementById('dyImgF')?.click()}>＋ ADD IMAGE</button>
      </div>

      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>公開範圍</h4>
          <KSelect value={visibility} onChange={v => setVisibility(v as Visibility)}
            options={[
              { value: 'public', label: '完全公開' },
              { value: 'member', label: '會員公開' },
              { value: 'private', label: '僅自己可見' },
            ]} />
          <p className="hint" style={{ marginTop: 8 }}>私密日記絕對不會顯示在主頁的「最近日記」Widget 中</p>
        </div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'POST' : 'SAVE'}
          </button>
        </div>
      </div>
      {del.element}
    </div>
  );
}