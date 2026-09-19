'use client';
// 委託註冊／修改共用表單（4.18）— 名稱／副標題／狀態／價格／截止標準／名額／詢問連結／
// 多張圖片（第一張 = 代表・縮圖）／說明（HTML+MD）／個別字型／頁面主題色
import React, { useState } from 'react';
import { CommItem, CommSettings, SlotMode, SlotShape, SLOT_CHARS, badgeStyle, CommFormField, CommFormFieldType } from '@/lib/commStore';
import { newId } from '@/lib/postStore';
import { useFonts, deVarFamily } from '@/lib/fontStore';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { KInput, KSelect, KStep, KCheck } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { useTheme } from '@/lib/ThemeProvider';
import { CropEditor, CropValue, CropImg } from '@/components/ui/CropEditor';
import { DragList } from '@/components/ui/DragList';
import { Lightbox } from '@/components/ui/Lightbox';
import { RichEditor } from '@/components/ui/RichEditor';
import { useConfirmDelete } from '@/components/ui/Modal';
import { fileDrop } from '@/lib/dnd';
import { useToast } from '@/components/ui/Toast';

export interface CommFormValue {
  name: string; sub: string; badgeId: string;
  priceMin: number; priceMax: number; deadlineNote: string;
  slotMode: SlotMode; slotTotal: number; slotUsed: number; slotShape: SlotShape; slotColor: string;
  contactUrl?: string;
  images: string[]; thumbCrop?: CropValue;
  descHtml: string; titleFontId: string; bodyFontId: string;
  themeMode: 'site' | 'custom'; themeColor?: string; themeTone?: 'dark' | 'light';
  form: CommFormField[];       // 委託表單（v1.9）
  formEnabled: boolean;
}

const FIELD_TYPE_LABEL: Record<CommFormFieldType, string> = {
  text: '文字', single: '單選', multi: '多選', image: '圖片附件',
};

interface ArtItem { id: string; ref?: string; url?: string; file?: File }

function ArtThumb({ item, crop, ratio }: { item: ArtItem; crop?: CropValue; ratio: string }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  return (
    <div style={{ width: 74, aspectRatio: ratio.replace(':', '/'), borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
      {src ? <CropImg src={src} crop={crop} /> : <div className="ph" style={{ position: 'absolute', inset: 0 }} />}
    </div>
  );
}

function FirstCrop({ item, aspect, crop, onClose, onApply }: {
  item: ArtItem; aspect: '3:4' | '4:3'; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  if (!src) return null;
  return <CropEditor open src={src} aspect={aspect} initial={crop} onClose={onClose} onApply={onApply} />;
}

export function CommForm({ initial, settings, onSave, onCancel }: {
  initial: CommItem | null;
  settings: CommSettings;
  onSave: (v: CommFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const del = useConfirmDelete();   // 刪除確認 Modal（v1.9 — 圖片・表單項目）
  const { fonts, familyOf } = useFonts();
  const isNew = !initial;
  const [name, setName] = useState(initial?.name ?? '');
  const [sub, setSub] = useState(initial?.sub ?? '');
  const [badgeId, setBadgeId] = useState(initial?.badgeId ?? settings.commBadges[0]?.id ?? 'open');
  const [priceMin, setPriceMin] = useState(String(initial?.priceMin ?? ''));
  const [priceMax, setPriceMax] = useState(String(initial?.priceMax ?? ''));
  const [deadlineNote, setDeadlineNote] = useState(initial?.deadlineNote ?? '');
  const [slotMode, setSlotMode] = useState<SlotMode>(initial?.slotMode ?? 'included');
  const [slotTotal, setSlotTotal] = useState(initial?.slotTotal ?? 3);
  const [slotUsed, setSlotUsed] = useState(initial?.slotUsed ?? 0);
  const [slotShape, setSlotShape] = useState<SlotShape>(initial?.slotShape ?? 'diamond');
  const [slotColor, setSlotColor] = useState(initial?.slotColor ?? '#a63a45');
  // 目前首頁的主色 — 「主色」按鈕會將這個值填入（v2.0 使用者要求）
  const { state: themeState } = useTheme();
  const accent = themeState.vars.accent;
  const [contactUrl, setContactUrl] = useState(initial?.contactUrl ?? '');
  const [arts, setArts] = useState<ArtItem[]>(() => (initial?.images ?? []).map(r => ({ id: newId(), ref: r })));
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [cropOpen, setCropOpen] = useState(false);
  const [lb, setLb] = useState<number | null>(null);   // 點擊圖片縮圖 → 查看原圖
  const [descHtml, setDescHtml] = useState(initial?.descHtml ?? '');
  const [titleFontId, setTitleFontId] = useState(initial?.titleFontId ?? 'serif');
  const [bodyFontId, setBodyFontId] = useState(initial?.bodyFontId ?? 'default');
  const [themeMode, setThemeMode] = useState<'site' | 'custom'>(initial?.themeMode ?? 'site');
  const [themeColor, setThemeColor] = useState(initial?.themeColor ?? '#4c6a8e');
  const [themeTone, setThemeTone] = useState<'dark' | 'light'>(initial?.themeTone ?? 'dark');
  // 委託表單（v1.9）— 文字／單選／多選／圖片項目建立器 + 啟用／停用
  const [form, setForm] = useState<CommFormField[]>(initial?.form ?? []);
  const [formEnabled, setFormEnabled] = useState(initial?.formEnabled ?? false);
  const patchField = (id: string, p: Partial<CommFormField>) =>
    setForm(fs => fs.map(f => (f.id === id ? { ...f, ...p } : f)));

  const addArts = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }));
    setArts(prev => {
      if (prev.length === 0) { setThumbCrop(undefined); setCropOpen(true); }
      return [...prev, ...items];
    });
  };

  const save = async () => {
    if (!name.trim()) { toast('請輸入委託名稱'); return; }
    const min = parseInt(priceMin.replace(/[^\d]/g, ''), 10) || 0;
    const max = parseInt(priceMax.replace(/[^\d]/g, ''), 10) || min;
    const images = await Promise.all(arts.map(a => (a.file ? putBlob(a.file) : Promise.resolve(a.ref!))));
    onSave({
      name: name.trim(), sub: sub.trim(), badgeId,
      priceMin: min, priceMax: max, deadlineNote: deadlineNote.trim(),
      slotMode, slotTotal, slotUsed, slotShape, slotColor,
      contactUrl: contactUrl.trim() || undefined,
      images, thumbCrop, descHtml,
      form,   // 即使問題為空也要保留 — 修正因篩選導致項目消失的問題（v1.9 使用者指出）
      formEnabled,
      titleFontId, bodyFontId,
      themeMode, themeColor: themeMode === 'custom' ? themeColor : undefined,
      themeTone: themeMode === 'custom' ? themeTone : undefined,
    });
  };

  return (
    <div className="write-grid">
      {/* 左：圖片 + 說明 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 13, alignContent: 'start' }}>
        <label className="k-label" style={{ margin: 0 }}>
          代表圖片 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 第一張是列表縮圖（{settings.ratio} 裁切）· 詳細檢視器中可切換查看 · ⠿ 順序</span>
        </label>
        {arts.length > 0 && (
          <DragList items={arts} keyOf={a => a.id} onReorder={setArts}
            render={(a, i) => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <div data-tip="點擊查看原圖" onClick={() => setLb(i)}
                  style={{ display: 'flex', flexShrink: 0, cursor: 'zoom-in' }}>
                  <ArtThumb item={a} crop={i === 0 ? thumbCrop : undefined} ratio={settings.ratio} />
                </div>
                {i === 0 ? (
                  <>
                    <span className="pill dark">代表 · 縮圖</span>
                    {/* 與旁邊的「代表 · 縮圖」徽章統一垂直高度（23px） */}
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, lineHeight: '13px' }}
                      onClick={() => setCropOpen(true)}>✂ 縮圖位置</button>
                  </>
                ) : <span className="pill">追加圖片</span>}
                <span className="fx" style={{ marginLeft: 'auto' }}
                  onClick={() => del.ask('確定要刪除這張圖片嗎？', () => setArts(l => l.filter(x => x.id !== a.id)))}>✕</span>
              </div>
            )} />
        )}
        <input id="cmArtsF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addArts(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
          onClick={() => document.getElementById('cmArtsF')?.click()}
          {...fileDrop(fl => addArts(fl))}>＋ ADD IMAGE</button>

        <label className="k-label" style={{ margin: '4px 0 0' }}>
          委託說明 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 可以在段落之間的任何位置插入圖片 · 禁止腳本</span>
        </label>
        <RichEditor value={descHtml} onChange={setDescHtml} placeholder="請撰寫委託說明" />

        {/* 委託表單（v1.9）— 申請時要接收的項目：文字／單選／多選／圖片附件 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '4px 0 0', flexWrap: 'wrap' }}>
          <label className="k-label" style={{ margin: 0 }}>
            委託表單 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 申請時要接收的項目 · ⠿ 順序</span>
          </label>
          <div className="mini-seg">
            <button className={formEnabled ? 'on' : ''} onClick={() => setFormEnabled(true)}>啟用</button>
            <button className={!formEnabled ? 'on' : ''} onClick={() => setFormEnabled(false)}>停用</button>
          </div>
        </div>
        {formEnabled && form.length > 0 && (
          <DragList items={form} keyOf={f => f.id} onReorder={setForm}
            render={f => (
              <div className="cmf-field" style={{ width: '100%' }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className="drag-h">⠿</span>
                  <KSelect minWidth={104} value={f.type}
                    onChange={v => patchField(f.id, {
                      type: v as CommFormFieldType,
                      options: v === 'single' || v === 'multi' ? (f.options?.length ? f.options : ['']) : undefined,
                    })}
                    options={(Object.keys(FIELD_TYPE_LABEL) as CommFormFieldType[])
                      .map(t => ({ value: t, label: FIELD_TYPE_LABEL[t] }))} />
                  <KInput placeholder="問題" value={f.label}
                    onChange={e => patchField(f.id, { label: e.target.value })} style={{ flex: 1, minWidth: 0 }} />
                  <span className="fx" onClick={() => {
                    const remove = () => setForm(fs => fs.filter(x => x.id !== f.id));
                    if (f.label.trim() || f.options?.some(o => o.trim())) {
                      del.ask('確定要刪除這個表單項目嗎？', remove, f.label.trim() ? `"${f.label}"` : undefined);
                    } else remove();
                  }}>✕</span>
                </div>
                <KInput placeholder="輔助說明（可選）" value={f.desc ?? ''}
                  onChange={e => patchField(f.id, { desc: e.target.value || undefined })}
                  style={{ marginTop: 7, fontSize: 12 }} />
                {(f.type === 'single' || f.type === 'multi') && (
                  <div style={{ display: 'grid', gap: 6, marginTop: 8, paddingLeft: 22 }}>
                    {(f.options ?? []).map((op, oi) => (
                      <div key={oi} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                        <span style={{ color: 'var(--faint)', fontSize: 12, flexShrink: 0 }}>
                          {f.type === 'single' ? '○' : '□'}
                        </span>
                        <KInput placeholder="選項" value={op}
                          onChange={e => patchField(f.id, {
                            options: f.options!.map((x, i) => (i === oi ? e.target.value : x)),
                          })} style={{ flex: 1, minWidth: 0, fontSize: 12 }} />
                        <span className="fx" style={{ fontSize: 10, padding: '2px 4px' }}
                          onClick={() => {
                            const remove = () => patchField(f.id, { options: f.options!.filter((_, i) => i !== oi) });
                            if (op.trim()) del.ask('確定要刪除這個選項嗎？', remove, `"${op}"`);
                            else remove();
                          }}>✕</span>
                      </div>
                    ))}
                    <button className="btn btn-ghost"
                      style={{ padding: '5px 12px', fontSize: 10.5, justifySelf: 'center', display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
                      onClick={() => patchField(f.id, { options: [...(f.options ?? []), ''] })}>＋ 新增選項</button>
                  </div>
                )}
                {/* 必填回答列 — 圖片附件時，在最右側設定單張／多張（v1.9） */}
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <KCheck label={<span style={{ fontSize: 11.5 }}>必填回答</span>}
                    checked={!!f.required} onChange={v => patchField(f.id, { required: v || undefined })} />
                  {f.type === 'image' && (
                    <div className="mini-seg" style={{ marginLeft: 'auto' }}>
                      <button className={!f.multiple ? 'on' : ''} onClick={() => patchField(f.id, { multiple: undefined })}>僅一張</button>
                      <button className={f.multiple ? 'on' : ''} onClick={() => patchField(f.id, { multiple: true })}>多張</button>
                    </div>
                  )}
                </div>
              </div>
            )} />
        )}
        {formEnabled && (
          <button className="btn btn-ghost"
            style={{ padding: '6px 13px', fontSize: 11, justifySelf: 'center', display: 'inline-flex', alignItems: 'center', lineHeight: 1 }}
            onClick={() => setForm(fs => [...fs, { id: newId(), type: 'text', label: '' }])}>＋ ADD FIELD</button>
        )}
      </div>

      {/* 右：資訊 + 儲存 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>基本</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="委託名稱" value={name} onChange={e => setName(e.target.value)}
              style={{ fontFamily: familyOf(titleFontId) }} />
            <KInput placeholder="副標題（可選）" value={sub} onChange={e => setSub(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KSelect minWidth={120} value={badgeId} onChange={setBadgeId}
                options={settings.commBadges.map(b => ({ value: b.id, label: b.label }))} />
              <span style={badgeStyle(settings.commBadges.find(b => b.id === badgeId), settings.badgeShape)}>
                {settings.commBadges.find(b => b.id === badgeId)?.label}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KInput placeholder="最低價格" value={priceMin} onChange={e => setPriceMin(e.target.value)} />
              <span style={{ color: 'var(--faint)' }}>–</span>
              <KInput placeholder="最高價格" value={priceMax} onChange={e => setPriceMax(e.target.value)} />
            </div>
            <KInput placeholder="截止日期標準文字" value={deadlineNote} onChange={e => setDeadlineNote(e.target.value)} />
            <KInput placeholder="詢問連結 URL（可選）" value={contactUrl} onChange={e => setContactUrl(e.target.value)} />
          </div>
        </div>

        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>名額（4.18）</h4>
          <div style={{ display: 'grid', gap: 10 }}>
            <div className="mini-seg">
              <button className={slotMode === 'shared' ? 'on' : ''} onClick={() => setSlotMode('shared')}>統合名額</button>
              <button className={slotMode === 'included' ? 'on' : ''} onClick={() => setSlotMode('included')}>個別 — 包含統合</button>
              <button className={slotMode === 'own' ? 'on' : ''} onClick={() => setSlotMode('own')}>個別 — 獨立</button>
            </div>
            <p className="hint" style={{ margin: 0 }}>
              {slotMode === 'shared' ? '直接使用全部名額（環境設定 > 委託）'
                : slotMode === 'included' ? '顯示剩餘 = min(個別剩餘, 統合剩餘)'
                  : '此委託的獨立名額'}
            </p>
            {slotMode !== 'shared' && (
              <div style={{ display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap' }}>
                <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>總數</span>
                <KStep value={slotTotal} min={1} max={30} onChange={setSlotTotal} />
                <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>已使用</span>
                <KStep value={slotUsed} min={0} max={slotTotal} onChange={setSlotUsed} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="mini-seg">
                {(Object.keys(SLOT_CHARS) as SlotShape[]).map(sh => (
                  <button key={sh} className={slotShape === sh ? 'on' : ''} onClick={() => setSlotShape(sh)}>
                    {SLOT_CHARS[sh].filled}{SLOT_CHARS[sh].empty}
                  </button>
                ))}
              </div>
              <span className="cp-lb">填充色</span>
              <ColorField value={slotColor} onChange={setSlotColor} />
              {/* 直接取得首頁主色（v2.0 使用者要求）— 複製目前的值填入。
                  如果設定為連動，之後修改主色時，已登錄的委託也會跟著變色，
                  導致「當時設定的顏色」消失，因此只取得目前顏色，之後各自獨立 */}
              <button type="button" className="btn btn-ghost"
                style={{ padding: '5px 11px', fontSize: 10.5, whiteSpace: 'nowrap' }}
                data-tip={`直接填入首頁主色（${accent}）`}
                onClick={() => setSlotColor(accent)}>主色</button>
            </div>
          </div>
        </div>

        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>字型・主題</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KSelect value={titleFontId} onChange={setTitleFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span> }))} />
            <p className="hint" style={{ margin: 0 }}>標題字型 — 詳細頁面大型標題</p>
            <KSelect value={bodyFontId} onChange={setBodyFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span> }))} />
            <p className="hint" style={{ margin: 0 }}>正文文字 — 說明文字</p>
            <div className="mini-seg">
              <button className={themeMode === 'site' ? 'on' : ''} onClick={() => setThemeMode('site')}>沿用首頁主題</button>
              <button className={themeMode === 'custom' ? 'on' : ''} onClick={() => setThemeMode('custom')}>輸入主題色</button>
            </div>
            {themeMode === 'custom' && (
              <>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <ColorField value={themeColor} onChange={setThemeColor} />
                  <div className="mini-seg">
                    <button className={themeTone === 'dark' ? 'on' : ''} onClick={() => setThemeTone('dark')}>深色感</button>
                    <button className={themeTone === 'light' ? 'on' : ''} onClick={() => setThemeTone('light')}>淺色感</button>
                  </div>
                </div>
                <span className="hint" style={{ margin: 0 }}>進入詳細頁面時切換整套色彩配置 · 離開後恢復原本主題</span>
              </>
            )}
          </div>
        </div>

        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'ADD' : 'SAVE'}
          </button>
        </div>
      </div>

      {arts[0] && cropOpen && (
        <FirstCrop item={arts[0]} aspect={settings.ratio} crop={thumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setThumbCrop(c); setCropOpen(false); }} />
      )}
      {/* 查看圖片原圖 — 尚未儲存的檔案使用 url，已儲存的使用 ref（Lightbox 兩者皆可處理） */}
      {lb !== null && (
        <Lightbox srcs={arts.map(a => a.url ?? a.ref ?? '')} index={lb} onClose={() => setLb(null)} />
      )}
      {del.element}
    </div>
  );
}