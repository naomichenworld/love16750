'use client';
// Widget 設定共用編輯器（第 5 章「Widget」分類 · 與主頁 Widget 管理 Modal 共用）
// 因為更新的是同一個 mainStore，所以無論從主頁修改還是從環境設定修改，都會立即互相同步
import React, { useEffect, useState } from 'react';
import { WidgetConf, useMainStore, decoSlides, DecoSlide } from '@/lib/mainStore';
import { KInput, KTextarea, KCheck, KStep, KDate } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { CropEditor, CropValue, CropImg, CroppedBlobImg } from '@/components/ui/CropEditor';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';
import { useConfirmDelete } from '@/components/ui/Modal';
import { normalizeInternalLink } from '@/lib/link';
import { KSelect } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { useFonts } from '@/lib/fontStore';

/* ---------- MEMO · 自由文字 — settings.text（+ freetext：字型・大小・顏色・對齊，v1.9） ---------- */
export function TextSettingEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const { fonts, familyOf } = useFonts();
  const isFree = conf.type === 'freetext';
  const s = conf.settings as { text?: string; fontId?: string; size?: number; color?: string; align?: 'left' | 'center' | 'right'; bold?: boolean };
  const [draft, setDraft] = useState(s);
  // 從其他地方（例如主頁 Modal）儲存後會同步反映
  useEffect(() => setDraft({ ...s }), [conf.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = JSON.stringify(draft) !== JSON.stringify(s);
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <KTextarea value={draft.text ?? ''} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))} />
      {isFree && (
        <>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect minWidth={170} value={draft.fontId ?? 'default'}
              onChange={v => setDraft(d => ({ ...d, fontId: v }))}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> }))} />
            <span className="cp-lb">大小</span>
            <KStep value={draft.size ?? 15} min={10} max={64} step={1} suffix="px"
              onChange={v => setDraft(d => ({ ...d, size: v }))} />
            <span className="cp-lb">文字顏色</span>
            <ColorField value={draft.color ?? '#5d636d'} onChange={hex => setDraft(d => ({ ...d, color: hex }))} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div className="mini-seg">
              {(['left', 'center', 'right'] as const).map(a => (
                <button key={a} className={(draft.align ?? 'left') === a ? 'on' : ''}
                  onClick={() => setDraft(d => ({ ...d, align: a }))}>
                  {a === 'left' ? '左側' : a === 'center' ? '中央' : '右側'}
                </button>
              ))}
            </div>
            <KCheck label="粗體" checked={!!draft.bold} onChange={v => setDraft(d => ({ ...d, bold: v }))} />
          </div>
        </>
      )}
      <button className="btn btn-dark" style={{ justifySelf: 'end', opacity: dirty ? 1 : 0.5 }} disabled={!dirty}
        onClick={() => updateWidget(conf.id, { settings: { ...conf.settings, ...draft } }, { persist: true })}>
        儲存
      </button>
    </div>
  );
}

/* ---------- D-DAY — settings.items: {title, date, plusOne?}[] ---------- */
// plusOne：將開始日算作第 1 天的紀念日計數（+1 Day — 情侶紀念日等，當天 = D+1）
export interface DdaySetItem { title: string; date: string; plusOne?: boolean }

export function DdayEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const toast = useToast();
  const { fonts, familyOf } = useFonts();
  const items = (conf.settings.items as DdaySetItem[]) ?? [];
  // 'default' 是字型庫中的實際字型 id（預設 Pretendard），不能作為虛假的 sentinel 使用 —
  // 未指定時直接使用已存在的鎖定字型 'serif'（預設襯線字型）作為預設值（v2.0 使用者發現）
  const fontId = (conf.settings.fontId as string | undefined) ?? 'serif';
  const color = conf.settings.color as string | undefined;
  const set = (next: DdaySetItem[]) =>
    updateWidget(conf.id, { settings: { ...conf.settings, items: next } }, { persist: true });
  const setMeta = (patch: Record<string, unknown>) =>
    updateWidget(conf.id, { settings: { ...conf.settings, ...patch } }, { persist: true });
  const [nt, setNt] = useState('');
  const [nd, setNd] = useState('');

  const add = () => {
    if (!nt.trim()) { toast('請輸入標題'); return; }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nd)) { toast('請以 YYYY-MM-DD 格式輸入日期'); return; }
    set([...items, { title: nt.trim(), date: nd }]);
    setNt(''); setNd('');
  };

  return (
    <div>
      <DragList
        items={items}
        keyOf={it => `${it.title}|${it.date}`}
        onReorder={set}
        render={(it, i) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
            <span className="drag-h">⠿</span>
            <KInput value={it.title} placeholder="標題"
              onChange={e => set(items.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} />
            <KDate value={it.date} style={{ maxWidth: 122 }}
              onChange={v => set(items.map((x, j) => (j === i ? { ...x, date: v } : x)))} />
            <span data-tip="將開始日算作第 1 天的紀念日計數 — 當天為 D+1（例如情侶紀念日）">
              <KCheck label="+1D" checked={!!it.plusOne}
                onChange={v => set(items.map((x, j) => (j === i ? { ...x, plusOne: v } : x)))} />
            </span>
            <button className="btn btn-ghost" style={{ height: 24, padding: '0 11px', fontSize: 10.5, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}
              onClick={() => set(items.filter((_, j) => j !== i))}>DELETE</button>
          </div>
        )}
      />
      {items.length === 0 && <p className="hint">目前沒有已登錄的 D-day</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <KInput placeholder="標題" value={nt} onChange={e => setNt(e.target.value)} />
        <KDate value={nd} style={{ maxWidth: 122 }} onChange={setNd} />
        <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }} onClick={add}>＋ ADD</button>
      </div>
      <p className="hint" style={{ marginTop: 6 }}>+1D — 將開始日算作第 1 天的紀念日計數（當天 = D+1）</p>
      {/* 日期顯示（D-2・D+3 等）的字型・顏色（v2.0 使用者要求）— 標題文字沿用正文的字型 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px dashed var(--line)' }}>
        <span className="cp-lb">日期顯示字型</span>
        <KSelect minWidth={150} value={fontId}
          onChange={v => setMeta({ fontId: v })}
          options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> }))} />
        <span className="cp-lb">顏色</span>
        <ColorField value={color ?? '#e6ebf2'} onChange={hex => setMeta({ color: hex })} />
      </div>
    </div>
  );
}

/* ---------- TO-DO — settings.items: {text, done}[] ---------- */
export interface TodoSetItem { text: string; done: boolean }

export function TodoEditor({ conf }: { conf: WidgetConf }) {
  const { updateWidget } = useMainStore();
  const [newText, setNewText] = useState('');
  const items = (conf.settings.items as TodoSetItem[]) ?? [];
  const set = (next: TodoSetItem[]) =>
    updateWidget(conf.id, { settings: { ...conf.settings, items: next } }, { persist: true });

  const add = () => {
    if (!newText.trim()) return;
    set([...items, { text: newText.trim(), done: false }]);
    setNewText('');
  };

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <KInput placeholder="新的待辦事項" value={newText} onChange={e => setNewText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add(); }} />
        <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }} onClick={add}>ADD</button>
      </div>
      <DragList
        items={items}
        keyOf={it => `${it.text}`}
        onReorder={set}
        render={(it, i) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 4px', borderBottom: '1px dashed var(--line)' }}>
            <span className="drag-h">⠿</span>
            <KCheck checked={it.done} onChange={v => set(items.map((x, j) => (j === i ? { ...x, done: v } : x)))} />
            <span style={{ fontSize: 13, textDecoration: it.done ? 'line-through' : undefined, color: it.done ? 'var(--faint)' : undefined }}>{it.text}</span>
            {/* 固定為 24px 偶數高度 + flex 垂直置中（v1.9 使用者回饋） */}
            <button className="btn btn-ghost" style={{ marginLeft: 'auto', height: 24, padding: '0 11px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center' }}
              onClick={() => set(items.filter((_, j) => j !== i))}>DELETE</button>
          </div>
        )}
      />
      {items.length === 0 && <p className="hint">目前沒有待辦事項</p>}
    </div>
  );
}

/* (v1.9) 圖片 Widget 已統一為裝飾圖片（deco — 上傳・裁切・連結），因此移除 */

/* ---------- 裝飾圖片 — settings: slides[] / interval / rounded / fit ----------
   不需要面板，只放入圖片作為裝飾用途。保留原圖 + 位置裁切（依目前 Widget 比例）。
   加入多張後會依序切換成投影片（v2.0）— 連結可以個別設定。 */

/** 單張場景的位置裁切 — 載入儲存的原圖後，依目前 Widget 比例調整 */
function DecoCrop({ sl, ratio, onClose, onApply }: {
  sl: DecoSlide; ratio: number; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const src = useBlobUrl(sl.imgId);
  if (!src) return null;
  return <CropEditor open src={src} aspect={ratio} aspectLabel="目前 Widget 比例" initial={sl.crop} onClose={onClose} onApply={onApply} />;
}

export function DecoEditor({ conf, onClose }: { conf: WidgetConf; onClose?: () => void }) {
  const { updateWidget } = useMainStore();
  const toast = useToast();
  const del = useConfirmDelete();   // 刪除一律經過警告 Modal（v1.9）
  const [cropFor, setCropFor] = useState<string | null>(null);   // 正在調整位置的場景 id
  const [swapFor, setSwapFor] = useState<string | null>(null);   // 圖片替換目標（null = 新增）
  const rounded = (conf.settings.rounded as boolean) ?? true;
  const fit = (conf.settings.fit as 'cover' | 'contain') ?? 'cover';   // 填滿／維持比例（v1.9 使用者要求）
  const sec = (conf.settings.interval as number) ?? 5;
  const ratio = (conf.w ?? 240) / (conf.h ?? 240);
  const slides = decoSlides(conf.settings);
  const inputId = `decoF-${conf.id}`;

  const set = (patch: Record<string, unknown>) =>
    updateWidget(conf.id, { settings: { ...conf.settings, ...patch } }, { persist: true });
  // 儲存為列表時，清除過去只有一張圖片的舊值 — 如果兩邊都保留，會無法判斷哪一個才是真正的資料
  const setSlides = (list: DecoSlide[]) =>
    set({ slides: list, imgId: undefined, crop: undefined, link: undefined });
  const patchSlide = (id: string, p: Partial<DecoSlide>) =>
    setSlides(slides.map(x => (x.id === id ? { ...x, ...p } : x)));

  const row = (sl: DecoSlide, i: number) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '7px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
      {slides.length > 1 && <span className="drag-h">⠿</span>}
      {/* 點擊即可將此場景的圖片替換成其他圖片 */}
      <div style={{ width: 84, aspectRatio: String(ratio), borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
        onClick={() => { setSwapFor(sl.id); document.getElementById(inputId)?.click(); }}>
        <CroppedBlobImg fileRef={sl.imgId} crop={fit === 'contain' ? undefined : sl.crop} ph="" />
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1, minWidth: 0 }}>
        {/* 即使貼上完整網址，也會移除網站 Origin 並轉成相對路徑（v1.9） */}
        <KInput placeholder="連結（可選 — 點擊後前往）" value={sl.link ?? ''}
          onChange={e => patchSlide(sl.id, { link: normalizeInternalLink(e.target.value) || undefined })} />
        {fit === 'cover' && (
          <button className="btn btn-ghost" style={{ height: 24, padding: '0 9px', fontSize: 10, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center' }}
            onClick={() => setCropFor(sl.id)}>✂ 位置</button>
        )}
      </div>
      <button className="btn btn-ghost" style={{ height: 24, padding: '0 11px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center' }}
        onClick={() => del.ask(`${i + 1}번째 이미지를 위젯에서 빼시겠습니까?`,
          () => setSlides(slides.filter(x => x.id !== sl.id)),
          '원본 파일은 지워지지 않습니다.')}>DELETE</button>
    </div>
  );

  const cropTarget = slides.find(x => x.id === cropFor);

  return (
    <div style={{ display: 'grid', gap: 9 }}>
      <input id={inputId} type="file" accept="image/*" multiple style={{ display: 'none' }}
        onChange={async e => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          const target = swapFor;
          setSwapFor(null);
          if (!files.length) return;
          if (target) {
            // 替換 — 因為需要重新調整位置，所以清除裁切並立即開啟調整畫面
            patchSlide(target, { imgId: await putBlob(files[0]), crop: undefined });
            if (fit === 'cover') setCropFor(target);
            toast('圖片已替換');
            return;
          }
          const added: DecoSlide[] = [];
          for (const f of files) added.push({ id: `d${Date.now().toString(36)}-${slides.length + added.length}`, imgId: await putBlob(f) });
          setSlides([...slides, ...added]);
          // 如果只加入一張，就接著讓使用者調整位置
          if (added.length === 1 && fit === 'cover') setCropFor(added[0].id);
          toast(added.length > 1 ? `已新增 ${added.length} 張圖片` : '圖片已儲存 — 請調整位置');
        }} />

      {slides.length === 0
        ? (
          <div className="ph" style={{ width: 160, aspectRatio: String(ratio), borderRadius: 8, border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
            onClick={() => { setSwapFor(null); document.getElementById(inputId)?.click(); }}>
            <span style={{ fontSize: 9 }}>IMAGE</span>
          </div>
        )
        : <DragList items={slides} keyOf={sl => sl.id} onReorder={setSlides} render={row} />}

      {/* 顯示方式（v1.9 使用者要求）— 填滿（填滿 Widget 且可能裁切）／維持比例（不裁切，但可能產生留白） */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cp-lb">顯示</span>
        <div className="mini-seg">
          <button className={fit === 'cover' ? 'on' : ''} onClick={() => set({ fit: undefined })}>填滿（可能裁切）</button>
          <button className={fit === 'contain' ? 'on' : ''} onClick={() => set({ fit: 'contain' })}>維持比例（不裁切）</button>
        </div>
        {/* 只有有多張可切換圖片時才詢問間隔 */}
        {slides.length > 1 && (
          <>
            <span className="cp-lb">切換間隔</span>
            <KStep value={sec} min={2} max={60} suffix="秒" onChange={v => set({ interval: v })} />
          </>
        )}
      </div>

      {/* 直接指定尺寸（v2.0 使用者要求）— 留空時會像現在一樣配合位置（Grid 儲存格） */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className="cp-lb">尺寸</span>
        <KInput placeholder="寬度 px（留空則自動）" value={String((conf.settings.wPx as number | undefined) ?? '')}
          onChange={e => { const n = parseInt(e.target.value, 10); set({ wPx: Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : undefined }); }}
          style={{ width: 140 }} />
        <span style={{ color: 'var(--faint)', fontSize: 11 }}>×</span>
        <KInput placeholder="高度 px（留空則自動）" value={String((conf.settings.hPx as number | undefined) ?? '')}
          onChange={e => { const n = parseInt(e.target.value, 10); set({ hPx: Number.isFinite(n) && n > 0 ? Math.min(n, 2000) : undefined }); }}
          style={{ width: 140 }} />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={() => { setSwapFor(null); document.getElementById(inputId)?.click(); }}>＋ 新增圖片</button>
        <KCheck label="圓角" checked={rounded} onChange={v => set({ rounded: v })} />
        {onClose && <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={onClose}>CLOSE</button>}
      </div>

      <p className="hint" style={{ margin: 0 }}>
        原圖不會被裁切，只會儲存位置・縮放 — 修改 Widget 尺寸後，可以使用 [✂ 位置] 重新調整。
        加入多張圖片後會依照上方順序切換，點擊縮圖即可替換該場景的圖片
      </p>

      {cropTarget && (
        <DecoCrop sl={cropTarget} ratio={ratio}
          onClose={() => setCropFor(null)}
          onApply={c => { patchSlide(cropTarget.id, { crop: c }); setCropFor(null); }} />
      )}
      {del.element}
    </div>
  );
}

/* ---------- 投影片 Banner — settings.slides / settings.interval ---------- */
// 圖片：上傳（imgId，保留 IndexedDB 原圖）+ 位置裁切（crop — 使用比例座標，因此即使 Banner 尺寸改變也能重現，
// 原圖絕對不會裁切 · 位置隨時可以重新調整）。舊版本 img(URL) 也持續支援渲染。
export interface BannerSlide {
  id: string; img: string; cap: string; sub: string; link: string; cls?: string;
  imgId?: string; crop?: CropValue;
}

interface SlideDraft extends BannerSlide { file?: File; localUrl?: string }

/** 投影片預覽 — 新檔案 / 已儲存 Blob / URL / 預設佔位圖依序處理 */
function SlidePreview({ d }: { d: SlideDraft }) {
  if (d.localUrl) return <CropImg src={d.localUrl} crop={d.crop} />;
  if (d.imgId) return <CroppedBlobImg fileRef={d.imgId} crop={d.crop} ph="" />;
  if (d.img) {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={d.img} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      </div>
    );
  }
  return <div className={`ph ${d.cls ?? ''}`} style={{ position: 'absolute', inset: 0 }}><span style={{ fontSize: 8 }}>BANNER</span></div>;
}

/** 使用已儲存 Blob 作為來源的位置裁切編輯器 — 框架比例 = 目前 Banner 的實際比例 */
function SlideCrop({ d, ratio, onClose, onApply }: {
  d: SlideDraft; ratio: number; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(d.imgId);
  const src = d.localUrl ?? loaded;
  if (!src) return null;
  return <CropEditor open src={src} aspect={ratio} aspectLabel="目前 Banner 比例" initial={d.crop} onClose={onClose} onApply={onApply} />;
}

/** 沒有已儲存投影片時 Banner Widget 顯示的展示用預設內容（編輯器也會以此作為預填起點） */
/** Banner 預設投影片 — 不帶展示文字的空白投影片一張（v1.9 使用者發現：部署版本仍遺留假資料未清除）
 * 沒有圖片時會顯示「SLIDE BANNER 01」佔位圖，之後可以在 MANAGE 中填入內容。 */
export const DEMO_SLIDES: BannerSlide[] = [
  { id: 's1', img: '', cap: '', sub: '', link: '', cls: '' },
];

export function BannerEditor({ conf, onSaved, onClose }: {
  conf: WidgetConf; onSaved?: () => void;
  onClose?: () => void;   // 在 Modal 中使用時，會在 SAVE 右側顯示 CLOSE 按鈕
}) {
  const { updateWidget } = useMainStore();
  const toast = useToast();
  const del = useConfirmDelete();   // 投影片刪除警告 Modal（v1.9 — 所有刪除都會顯示警告 Modal）
  const stored = (conf.settings.slides as BannerSlide[]) ?? [];
  const saved = stored.length > 0 ? stored : DEMO_SLIDES;
  const [draft, setDraft] = useState<SlideDraft[]>(() => saved.map(x => ({ ...x })));
  const [interval, setIntervalSec] = useState((conf.settings.interval as number) ?? 4);
  const [cropFor, setCropFor] = useState<string | null>(null);   // 正在調整位置的投影片 id
  const [fileFor, setFileFor] = useState<string | null>(null);   // 檔案選擇目標投影片 id

  // 目前 Banner 的實際比例 — 編輯模式中若修改過尺寸就使用該值（Widget 固定尺寸），預設為 610×210
  const bannerRatio = (conf.w ?? 610) / (conf.h ?? 210);

  const patch = (id: string, p: Partial<SlideDraft>) =>
    setDraft(list => list.map(x => (x.id === id ? { ...x, ...p } : x)));

  const row = (d: SlideDraft) => (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
      <span className="drag-h">⠿</span>
      {/* 圖片上傳預覽 — 點擊後選擇圖片，原圖不裁切，只儲存位置值 */}
      <div style={{ width: 96, aspectRatio: String(bannerRatio), borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
        onClick={() => { setFileFor(d.id); document.getElementById('bnSlideF')?.click(); }}>
        <SlidePreview d={d} />
      </div>
      <div style={{ display: 'grid', gap: 6, flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <KInput placeholder="標題文字" value={d.cap} onChange={e => patch(d.id, { cap: e.target.value })} />
          <KInput placeholder="說明" value={d.sub} onChange={e => patch(d.id, { sub: e.target.value })} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* 即使貼上完整網址，也會移除網站 Origin 並轉成 /rels/… 相對路徑（v1.9） */}
          <KInput placeholder="連結（可選）" value={d.link} onChange={e => patch(d.id, { link: normalizeInternalLink(e.target.value) })} />
          {(d.localUrl || d.imgId) && (
            <>
              <button className="btn btn-ghost" style={{ padding: '4px 9px', fontSize: 10, whiteSpace: 'nowrap' }}
                onClick={() => setCropFor(d.id)}>✂ 位置</button>
              <button className="btn btn-ghost" style={{ padding: '4px 9px', fontSize: 10, whiteSpace: 'nowrap' }}
                onClick={() => patch(d.id, { file: undefined, localUrl: undefined, imgId: undefined, crop: undefined })}>移除圖片</button>
            </>
          )}
        </div>
      </div>
      <button className="btn btn-ghost" style={{ height: 24, padding: '0 11px', fontSize: 10.5, display: 'inline-flex', alignItems: 'center' }}
        onClick={() => del.ask(`確定要刪除投影片${d.cap ? `「${d.cap}」` : ''}嗎？`,
          () => setDraft(list => list.filter(x => x.id !== d.id)),
          '刪除必須按下 [SAVE] 才會確定。')}>DELETE</button>
    </div>
  );

  const cropTarget = draft.find(x => x.id === cropFor);

  return (
    <div>
      <input id="bnSlideF" type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => {
          const f = e.target.files?.[0];
          if (f && fileFor) { patch(fileFor, { file: f, localUrl: URL.createObjectURL(f), crop: undefined }); setCropFor(fileFor); }
          e.target.value = ''; setFileFor(null);
        }} />
      <DragList items={draft} keyOf={d => d.id} onReorder={setDraft} render={row} />
      <p className="hint" style={{ marginTop: 8 }}>
        圖片會以原圖形式儲存，只會記錄<b>顯示位置・縮放</b> — 即使在編輯模式中修改 Banner 尺寸，原圖也不會被裁切，可以隨時使用 [✂ 位置] 重新調整
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, flexWrap: 'wrap', gap: 8 }}>
        <button className="btn btn-ghost" onClick={() =>
          setDraft(list => [...list, { id: `s-${Date.now().toString(36)}`, img: '', cap: '', sub: '', link: '' }])}>
          ＋ ADD SLIDE
        </button>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>切換間隔</span>
          <KStep value={interval} min={2} max={30} suffix="秒" onChange={setIntervalSec} />
          <button className="btn btn-dark" onClick={async () => {
            const slides: BannerSlide[] = await Promise.all(
              draft.filter(d => d.cap || d.img || d.imgId || d.file).map(async d => ({
                id: d.id, img: d.img, cap: d.cap, sub: d.sub, link: d.link, cls: d.cls,
                imgId: d.file ? await putBlob(d.file) : d.imgId,
                crop: d.crop,
              })));
            updateWidget(conf.id, { settings: { ...conf.settings, slides, interval } }, { persist: true });
            toast('Banner 已儲存');
            onSaved?.();
          }}>SAVE</button>
          {onClose && <button className="btn btn-ghost" onClick={onClose}>CLOSE</button>}
        </div>
      </div>

      {cropTarget && (
        <SlideCrop d={cropTarget} ratio={bannerRatio}
          onClose={() => setCropFor(null)}
          onApply={c => { patch(cropTarget.id, { crop: c }); setCropFor(null); }} />
      )}
      {del.element}
    </div>
  );
}