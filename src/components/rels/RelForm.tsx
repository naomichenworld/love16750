'use client';
// 自設關係註冊／修改共用表單（4.5）— 類型（配對／多人）· 名稱／正文文字字型 · 標語 · 公開範圍 ·
// 多張圖片註冊（第一張 = 代表 · 列表縮圖 4:3 裁切）· 註冊時與我的角色連動
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Character, Relation, Visibility, RelCpTag, RelMember, auMember, auStyle, fullShadow } from '@/lib/charStore';
import { ColorField } from '@/components/ui/ColorField';
import { isValidSlug, slugify } from '@/lib/link';
import { CP_LABEL } from '@/lib/relqStore';
import { newId } from '@/lib/postStore';
import { useFonts, deVarFamily } from '@/lib/fontStore';
import { putBlob, getBlob, useBlobUrl } from '@/lib/blobStore';
import { KInput, KSelect, KCheck, KStep } from '@/components/ui/Kit';
import { CropEditor, CropValue, CropImg } from '@/components/ui/CropEditor';
import { DragList } from '@/components/ui/DragList';
import { Lightbox } from '@/components/ui/Lightbox';
import { useConfirmDelete } from '@/components/ui/Modal';
import { fileDrop } from '@/lib/dnd';
import { useToast } from '@/components/ui/Toast';

export interface RelFormValue {
  slug?: string;             // 頁面網址 /rels/{slug}（v1.9 — 新增註冊時，留空則自動使用 id）
  name: string;
  catchphrase: string;
  kind: 'pair' | 'multi';
  visibility: Visibility;
  fontId: string;
  bodyFontId: string;
  arts: string[];            // 第一張 = 代表 = 列表縮圖原始圖片
  thumbCrop?: CropValue;
  headerImgId?: string;      // 標頭圖片（v1.5 — 全寬模糊 + 淡出）
  headerCrop?: CropValue;    // 標頭位置裁切（原始圖片無損）
  headerRemoved?: boolean;   // 標頭移除狀態（v1.9 — AU 編輯時用於儲存「明確沒有」）
  themeFollow?: boolean;     // AU 編輯：true 表示沿用原本（base）頁面主題（v1.9）
  illuBg?: string;           // 全身／插畫切換開關背景色（v1.9 — 未指定：主題）
  illuOn?: string;           // 全身／插畫切換開關選取色（未指定：主色）
  nameColor?: string;        // 自設名稱（Hero 標題）文字顏色（v1.9 使用者要求 — 未指定：主題）
  cpColor?: string;          // 標語文字顏色（未指定：主題）
  cpTagBg?: string;          // CP/NCP 徽章背景色（v2.0 使用者要求）
  cpTagFg?: string;          // CP/NCP 徽章文字顏色
  nameShadowColor?: string;  // 自設名稱陰影顏色（v2.0 使用者要求）
  nameShadow?: number;       // 自設名稱陰影強度 %
  headerBgG1?: string;       // 沒有標頭圖片時的背景漸層（v2.0 使用者要求）
  headerBgG2?: string;
  headerBgAngle?: number;
  pageBgG1?: string;         // 整個頁面的背景漸層（v2.0 使用者要求）
  pageBgG2?: string;
  pageBgAngle?: number;
  themeMode: 'site' | 'custom'; // 頁面主題 — 與首頁相同／獨立主題色（4.18 方式）
  themeColor?: string;          // 獨立主題色（custom 時）
  themeTone?: 'dark' | 'light'; // 主題色的深色／淺色感
  cp: RelCpTag;              // CP/NCP（v1.9）— 各 AU 的 CP/NCP 由 AU 管理另外指定
  fulls?: Record<string, string | undefined>;  // 每位成員的全身圖片（v1.9 — charId → blob id）
  fullScales?: Record<string, number>;         // 全身大小 %（滾輪調整）
  fullOffsets?: Record<string, { x: number; y: number }>; // 全身位置偏移 %（拖曳，v1.9）
  quotes?: Record<string, string>;                              // Hero 左／右一句話文字（v2.0）
  nameSizes?: Record<string, number>;                           // 成員卡片名稱大小 px（v2.0）
  nameBolds?: Record<string, boolean>;                          // 成員卡片名稱粗體（v2.0 — 預設開啟）
  quoteColors?: Record<string, { fg?: string; mark?: string }>; // Hero 台詞文字／引號顏色（配對，v1.9）
  fullFront?: string;                          // 顯示在前方的角色 id
  auName?: string;           // AU 專用自設名稱（v2.0 使用者要求 — 僅 AU 編輯時）
  qaHide?: boolean;          // 隱藏問答回答（v2.0 使用者要求）
  pickedCharIds: string[];   // 註冊時要連動的我的角色（修改模式下為空陣列）
}

interface FullDraft { ref?: string; file?: File; url?: string }

/** 全身預覽圖片一張（v1.9 操作改版 — 使用者確認）
 *  · 拖曳 = 移動位置（水平・垂直）  · 滾輪 = 大小（維持比例）  · 右鍵 = 前後順序選單
 *  配置與詳細頁 FullImg 相同（以父層 fb 框為基準，下方置中 + 偏移）— 預覽 = 實際效果 */
function FullPrevImg({ draft, scale, offX, offY, name, shadow, onScale, onOffset, onLayer }: {
  draft?: FullDraft; scale: number; offX: number; offY: number; name: string; shadow?: string;
  onScale: (v: number) => void;
  onOffset: (x: number, y: number) => void;
  onLayer: (front: boolean) => void;
}) {
  const loaded = useBlobUrl(draft?.ref);
  const src = draft?.url ?? loaded;
  const drag = React.useRef<{ x: number; y: number; ox: number; oy: number; bw: number; bh: number } | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menu]);
  // 滾輪 = 大小 — React onWheel 是 passive，因此 preventDefault 會被忽略，頁面也會一起捲動（v1.9 修正）
  // → 使用 {passive:false} 註冊原生監聽器，在圖片上阻止預設滾輪行為
  const imgRef = React.useRef<HTMLImageElement>(null);
  const wheelState = React.useRef({ scale, onScale });
  wheelState.current = { scale, onScale };
  useEffect(() => {
    const el = imgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { scale: s, onScale: fn } = wheelState.current;
      fn(Math.max(40, Math.min(160, Math.round(s - Math.sign(e.deltaY) * 4))));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);
  if (!src) return null;
  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={src} alt={name}
        style={{
          position: 'absolute', bottom: `${offY}%`, left: `calc(50% + ${offX}%)`, transform: 'translateX(-50%)',
          height: `${scale}%`, maxWidth: 'none', cursor: 'var(--cur-grab,grab)',
          userSelect: 'none', touchAction: 'none',
          filter: shadow,
        }}
        draggable={false}
        onPointerDown={e => {
          if (e.button !== 0) return;
          e.preventDefault();
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          const box = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          drag.current = { x: e.clientX, y: e.clientY, ox: offX, oy: offY, bw: box.width, bh: box.height };
        }}
        onPointerMove={e => {
          const d = drag.current;
          if (!d) return;
          const nx = d.ox + ((e.clientX - d.x) / d.bw) * 100;
          const ny = d.oy - ((e.clientY - d.y) / d.bh) * 100;
          onOffset(Math.max(-80, Math.min(80, Math.round(nx))), Math.max(-60, Math.min(80, Math.round(ny))));
        }}
        onPointerUp={() => { drag.current = null; }}
        onContextMenu={e => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY }); }} />
      {menu && createPortal(
        <div style={{
          position: 'fixed', left: menu.x, top: menu.y, zIndex: 130,
          background: 'var(--panel-solid,#fff)', border: '1px solid var(--line)', borderRadius: 9,
          boxShadow: 'var(--sh-dd)', padding: 4, display: 'grid', minWidth: 92,
        }} onMouseDown={e => e.stopPropagation()}>
          <button style={{ padding: '7px 12px', fontSize: 12, borderRadius: 6, textAlign: 'left' }}
            onClick={() => { onLayer(true); setMenu(null); }}>向前</button>
          <button style={{ padding: '7px 12px', fontSize: 12, borderRadius: 6, textAlign: 'left' }}
            onClick={() => { onLayer(false); setMenu(null); }}>向後</button>
        </div>,
        document.body,
      )}
    </>
  );
}

interface ArtItem { id: string; ref?: string; url?: string; file?: File }

function ArtThumb({ item, crop }: { item: ArtItem; crop?: CropValue }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  if (!src) return <div className="ph" style={{ width: '100%', height: '100%' }} />;
  return <CropImg src={src} crop={crop} />;
}

export function RelForm({ initial, auId, myChars, memberNames, existingIds, onSave, onCancel }: {
  initial: Relation | null;          // null = 新增註冊
  auId?: string;                     // AU 編輯模式（v1.9）— 圖片・標語・全身圖片皆屬於此 AU
  myChars: Character[];
  memberNames?: Record<string, string>;  // 成員 charId → 名稱（全身區段顯示）
  existingIds?: string[];            // 頁面網址重複檢查用（v1.9 — 新增註冊）
  onSave: (v: RelFormValue) => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const del = useConfirmDelete();   // 刪除確認 Modal（v1.9 — 圖片・全身圖片）
  const { fonts, familyOf } = useFonts();
  const isNew = !initial;
  const auObj = auId ? initial?.aus.find(a => a.id === auId) : undefined;

  const [kind, setKind] = useState<'pair' | 'multi'>(initial?.kind ?? 'pair');
  const [name, setName] = useState(initial?.name ?? '');
  // 頁面網址 /rels/{slug} — 新增時留空則自動使用 id。修改時也可以變更（v2.0 使用者要求）
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [catchphrase, setCatchphrase] = useState(auObj ? auObj.catchphrase : (initial?.catchphrase ?? ''));
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [cp, setCp] = useState<RelCpTag>(initial?.cp ?? 'cp');   // CP/NCP（v1.9）
  // AU 編輯時優先使用該 AU 設定的字型（v2.0 使用者回報 — AU 字型原本沒有分開）
  const [fontId, setFontId] = useState((auObj?.fontId ?? initial?.fontId) ?? 'serif');
  const [bodyFontId, setBodyFontId] = useState((auObj?.bodyFontId ?? initial?.bodyFontId) ?? 'default');
  const [picked, setPicked] = useState<string[]>([]);
  const [arts, setArts] = useState<ArtItem[]>(() => {
    const refs = auObj ? (auObj.arts ?? []) : (initial?.arts ?? (initial?.thumbId ? [initial.thumbId] : []));
    return refs.map(r => ({ id: newId(), ref: r }));
  });
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [cropOpen, setCropOpen] = useState(false);
  const [lb, setLb] = useState<number | null>(null);   // 點擊圖片縮圖 → 查看原圖
  const [headerFile, setHeaderFile] = useState<File | null>(null);
  const [headerUrl, setHeaderUrl] = useState('');
  const [headerRemoved, setHeaderRemoved] = useState(false);
  // AU 編輯模式 — 從該 AU 的標頭開始（不複製 base 的標頭，v1.9 AU 各自完全分離）
  const initHeaderId = auObj ? (auObj.headerImgId ?? undefined) : initial?.headerImgId;
  const initHeaderCrop = auObj ? auObj.headerCrop : initial?.headerCrop;
  const [headerCrop, setHeaderCrop] = useState<CropValue | undefined>(initHeaderCrop);
  const [headerCropOpen, setHeaderCropOpen] = useState(false);
  // 頁面主題（v1.9 各 AU）— AU 編輯：沿用原本（base）或使用此 AU 專用主題
  const [themeFollow, setThemeFollow] = useState<boolean>(auObj ? auObj.theme === undefined : false);
  const [themeMode, setThemeMode] = useState<'site' | 'custom'>(
    (auObj?.theme?.mode ?? initial?.themeMode) ?? 'site');
  const [themeColor, setThemeColor] = useState((auObj?.theme?.color ?? initial?.themeColor) ?? '#c9a86a');
  const [themeTone, setThemeTone] = useState<'dark' | 'light'>((auObj?.theme?.tone ?? initial?.themeTone) ?? 'dark');
  // 顏色・背景可以各 AU 分別設定（v2.0 使用者要求）— 編輯 AU 時優先讀取該 AU 已設定的值，
  // 如果沒有設定，則沿用自設關係的值。取消勾選後會從 AU 中刪除並恢復為自設關係的值。
  const st = initial ? auStyle(initial, auObj) : undefined;
  // 全身／插畫切換開關顏色（v1.9）— 未直接指定時使用主題・主色
  const [illuCustom, setIlluCustom] = useState(!!(st?.illuBg || st?.illuOn));
  const [illuBg, setIlluBg] = useState(st?.illuBg ?? '#1d2025');
  const [illuOn, setIlluOn] = useState(st?.illuOn ?? '#a63a45');
  // 自設名稱・標語文字顏色（v1.9 使用者要求）— 未直接指定時使用主題色
  const [txtCustom, setTxtCustom] = useState(!!(st?.nameColor || st?.cpColor));
  const [nameColor, setNameColor] = useState(st?.nameColor ?? '#e8eaee');
  const [cpColor, setCpColor] = useState(st?.cpColor ?? '#8a8f98');
  // CP/NCP 徽章顏色（v2.0 使用者要求）— 未指定時使用預設 pill 顏色
  const [tagCustom, setTagCustom] = useState(!!(st?.cpTagBg || st?.cpTagFg));
  const [cpTagBg, setCpTagBg] = useState(st?.cpTagBg ?? '#eef0f2');
  const [cpTagFg, setCpTagFg] = useState(st?.cpTagFg ?? '#5d636d');
  // 陰影（v2.0）— 顏色・強度。會同時套用於自設名稱與全身圖片（使用者要求）。未指定時維持原本效果
  const [shadowCustom, setShadowCustom] = useState(!!(st?.nameShadowColor || st?.nameShadow));
  const [nameShadowColor, setNameShadowColor] = useState(st?.nameShadowColor ?? '#000000');
  const [nameShadow, setNameShadow] = useState(st?.nameShadow ?? 100);
  // 沒有標頭圖片時使用的背景漸層（v2.0 使用者要求）— 與設計分頁的背景設定相同方式（兩種顏色 + 角度）
  const [headerBgCustom, setHeaderBgCustom] = useState(!!(st?.headerBgG1 || st?.headerBgG2));
  const [headerBgG1, setHeaderBgG1] = useState(st?.headerBgG1 ?? '#3a4150');
  const [headerBgG2, setHeaderBgG2] = useState(st?.headerBgG2 ?? '#1a1d22');
  const [headerBgAngle, setHeaderBgAngle] = useState(st?.headerBgAngle ?? 180);
  // 整個頁面的背景（v2.0 使用者要求）— 與設計分頁的網站背景相同方式（兩種顏色 + 角度）
  const [pageBgCustom, setPageBgCustom] = useState(!!(st?.pageBgG1 || st?.pageBgG2));
  const [pageBgG1, setPageBgG1] = useState(st?.pageBgG1 ?? '#2b3038');
  const [pageBgG2, setPageBgG2] = useState(st?.pageBgG2 ?? '#121418');
  const [pageBgAngle, setPageBgAngle] = useState(st?.pageBgAngle ?? 180);
  const [charQuery, setCharQuery] = useState('');
  // 全身圖片（v1.9 — 配對・修改模式）— AU 編輯時使用該 AU 的全身圖片
  const pairMembers = !isNew && (initial!.kind ? initial!.kind === 'pair' : initial!.members.length === 2)
    ? initial!.members.slice(0, 2) : [];
  const [fulls, setFulls] = useState<Record<string, FullDraft>>(() => {
    const o: Record<string, FullDraft> = {};
    for (const m of pairMembers) {
      const ref = auObj ? auObj.fulls?.[m.charId] : m.fullImgId;
      if (ref) o[m.charId] = { ref };
    }
    return o;
  });
  // 如果正在編輯 AU，優先讀取該 AU 設定的值（v2.0 使用者發現 — 以前只讀自設關係共用值，
  // 導致在 AU 中修改的內容也會直接出現在其他 AU）。若未設定，則使用自設關係的預設值。
  const mOf = (m: RelMember) => (auObj ? auMember(m, auObj) : m);
  const [fullScales, setFullScales] = useState<Record<string, number>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).fullScale ?? 90])));
  // 全身位置偏移 %（v1.9 — 透過拖曳移動，與詳細頁使用相同座標系）
  const [fullOffsets, setFullOffsets] = useState<Record<string, { x: number; y: number }>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, { x: mOf(m).fullOffX ?? 0, y: mOf(m).fullOffY ?? 0 }])));
  // Hero 左／右一句話 — 之前只有顏色，沒有可以修改文字的欄位（v2.0 使用者發現）
  const [quotes, setQuotes] = useState<Record<string, string>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).quote ?? ''])));
  // 成員卡片名稱大小（v2.0）— 卡片寬度較窄，每個名稱需要適合的大小
  const [nameSizes, setNameSizes] = useState<Record<string, number>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).nameSize ?? 17])));
  // 名稱粗體（v2.0 使用者要求）— 某些字型使用粗體時較突兀，因此可以關閉。預設為粗體
  const [nameBolds, setNameBolds] = useState<Record<string, boolean>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, mOf(m).nameBold ?? true])));
  // Hero 台詞文字／引號顏色（配對，v1.9）
  const [quoteColors, setQuoteColors] = useState<Record<string, { fg?: string; mark?: string }>>(
    () => Object.fromEntries(pairMembers.map(m => [m.charId, { fg: mOf(m).quoteColor, mark: mOf(m).quoteMarkColor }])));
  // AU 專用自設名稱（v2.0 使用者要求）— 留空則沿用自設關係名稱
  const [auName, setAuName] = useState(auObj?.name ?? '');
  // 隱藏問答回答（v2.0 使用者要求）— 保留問題，只隱藏回答內容
  const [qaHide, setQaHide] = useState(!!initial?.qaHide);
  // 全身圖片前後順序也分 AU 儲存（v2.0）— 避免在 AU 修改前後順序時影響原本與其他 AU
  const [fullFront, setFullFront] = useState<string | undefined>(auObj?.fullFront ?? initial?.fullFront);

  // 我的角色連動列表 — 已選角色一定顯示，其餘依搜尋篩選，最多顯示 6 人
  const q = charQuery.trim().toLowerCase();
  const pickedChars = myChars.filter(c => picked.includes(c.id));
  const restChars = myChars.filter(c =>
    !picked.includes(c.id) && (!q || c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q)));
  const shownChars = [...pickedChars, ...restChars].slice(0, Math.max(6, pickedChars.length));
  const hiddenCount = pickedChars.length + restChars.length - shownChars.length;

  const maxPick = kind === 'pair' ? 2 : 6;

  const togglePick = (id: string, v: boolean) => {
    setPicked(list => {
      if (!v) return list.filter(x => x !== id);
      if (list.length >= maxPick) {
        toast(kind === 'pair' ? '配對最多只能連動 2 人' : '多人關係最多只能有 6 人（4.5）');
        return list;
      }
      return [...list, id];
    });
  };

  const addArts = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }));
    setArts(prev => {
      if (prev.length === 0) { setThumbCrop(undefined); setCropOpen(true); } // 第一張 → 縮圖裁切（6.1）
      return [...prev, ...items];
    });
  };

  const save = async () => {
    if (!name.trim()) { toast('請輸入自設關係名稱'); return; }
    // 頁面網址（v1.9 / 修改也可以變更 v2.0）— 有效性・重複檢查
    if (slug && slug !== (initial?.slug ?? '')) {
      if (!isValidSlug(slug)) { toast('網址只能使用英文字母小寫・數字・連字號'); return; }
      if (existingIds?.includes(slug)) { toast('此網址已被使用 — 請輸入其他網址'); return; }
    }
    const artIds = await Promise.all(arts.map(a => (a.file ? putBlob(a.file) : Promise.resolve(a.ref!))));
    onSave({
      // 修改時設定的網址會作為別名（v2.0）— 新增時 rels/new 會使用此值作為 id
      slug: slug.trim() || undefined,
      name: name.trim().toUpperCase(),
      catchphrase: catchphrase.trim(),
      kind, visibility, fontId, bodyFontId,
      arts: artIds,
      thumbCrop,
      headerImgId: headerFile ? await putBlob(headerFile) : (headerRemoved ? undefined : initHeaderId),
      headerCrop: headerRemoved ? undefined : headerCrop,
      headerRemoved,
      themeFollow,
      illuBg: illuCustom ? illuBg : undefined,
      illuOn: illuCustom ? illuOn : undefined,
      nameColor: txtCustom ? nameColor : undefined,
      cpColor: txtCustom ? cpColor : undefined,
      nameShadowColor: shadowCustom ? nameShadowColor : undefined,
      nameShadow: shadowCustom ? nameShadow : undefined,
      headerBgG1: headerBgCustom ? headerBgG1 : undefined,
      headerBgG2: headerBgCustom ? headerBgG2 : undefined,
      headerBgAngle: headerBgCustom ? headerBgAngle : undefined,
      pageBgG1: pageBgCustom ? pageBgG1 : undefined,
      pageBgG2: pageBgCustom ? pageBgG2 : undefined,
      pageBgAngle: pageBgCustom ? pageBgAngle : undefined,
      cpTagBg: tagCustom ? cpTagBg : undefined,
      cpTagFg: tagCustom ? cpTagFg : undefined,
      themeMode,
      themeColor: themeMode === 'custom' ? themeColor : undefined,
      themeTone: themeMode === 'custom' ? themeTone : undefined,
      cp,
      auName: auObj ? auName.trim() : undefined,
      qaHide: qaHide || undefined,
      fulls: pairMembers.length
        ? Object.fromEntries(await Promise.all(pairMembers.map(async m => {
          const d = fulls[m.charId];
          return [m.charId, d ? (d.file ? await putBlob(d.file) : d.ref) : undefined] as const;
        })))
        : undefined,
      fullScales: pairMembers.length ? fullScales : undefined,
      fullOffsets: pairMembers.length ? fullOffsets : undefined,
      quotes: pairMembers.length ? quotes : undefined,
      nameSizes: pairMembers.length ? nameSizes : undefined,
      nameBolds: pairMembers.length ? nameBolds : undefined,
      quoteColors: pairMembers.length ? quoteColors : undefined,
      fullFront,
      pickedCharIds: picked,
    });
  };

  return (
    <div className="write-grid">
      {/* 左：類型 · 我的角色連動（註冊時）· 圖片 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 14, alignContent: 'start' }}>
        <div>
          <label className="k-label">類型</label>
          {isNew ? (
            <div className="mini-seg">
              <button className={kind === 'pair' ? 'on' : ''} onClick={() => { setKind('pair'); setPicked(p => p.slice(0, 2)); }}>
                配對（2 人）
              </button>
              <button className={kind === 'multi' ? 'on' : ''} onClick={() => setKind('multi')}>
                多人關係（3 人以上）
              </button>
            </div>
          ) : (
            /* 註冊後無法變更類型（v1.9）— 版面・資料結構不同，切換時會產生不明確的情況 */
            <span className="pill dark">{kind === 'pair' ? '配對（2 人）' : '多人關係（3 人以上）'}</span>
          )}
          <p className="hint">
            {kind === 'pair'
              ? '左右卡片 + 中央插畫（全身重疊／1 張插畫）版面'
              : '成員列表型版面 · 最多 6 人（4.5）'}
          </p>
        </div>

        {isNew && (
          <div>
            <label className="k-label">我的角色連動 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 已選 {picked.length}/{maxPick} 人</span></label>
            {myChars.length > 6 && (
              <KInput placeholder="搜尋角色" value={charQuery} onChange={e => setCharQuery(e.target.value)}
                style={{ marginBottom: 8 }} />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {shownChars.map(c => (
                <div key={c.id}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                    border: `1.5px solid ${picked.includes(c.id) ? 'var(--accent)' : 'var(--line)'}`,
                    borderRadius: 8, transition: '.15s',
                  }}>
                  <KCheck checked={picked.includes(c.id)} onChange={v => togglePick(c.id, v)}
                    label={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                      <i style={{ width: 11, height: 11, borderRadius: '50%', background: c.color, fontStyle: 'normal' }} />
                      <b style={{ fontSize: 12.5 }}>{c.name}</b>
                      <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{c.sub}</small>
                    </span>} />
                </div>
              ))}
              {myChars.length === 0 && <p className="hint">沒有已註冊的角色 — 請先註冊角色</p>}
              {myChars.length > 0 && shownChars.length === 0 && <p className="hint">沒有搜尋結果</p>}
            </div>
            {hiddenCount > 0 && <p className="hint" style={{ marginTop: 6 }}>另外 {hiddenCount} 人 — 請透過搜尋尋找</p>}
            <p className="hint">其他人的角色可在自設關係詳細頁面透過［＋ 新增成員］註冊</p>
          </div>
        )}

        {/* 多張圖片註冊 — 第一張 = 代表 · 列表縮圖（4:3 裁切） */}
        <label className="k-label" style={{ margin: 0 }}>
          {auObj ? `圖片 — ${auObj.label} AU 插畫` : '圖片'} <span style={{ fontWeight: 400, color: 'var(--faint)' }}>
            {auObj ? '— 選擇此 AU 時顯示的中央插畫' : '— 第一張為代表 · 列表縮圖從第一張以 4:3 裁切 · 詳細插畫模式中可切換查看'}</span>
        </label>
        {arts.length > 0 && (
          <DragList items={arts} keyOf={a => a.id} onReorder={setArts}
            render={(a, i) => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <div data-tip="點擊查看原圖" onClick={() => setLb(i)}
                  style={{ width: 84, aspectRatio: '4/3', borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'zoom-in' }}>
                  <ArtThumb item={a} crop={i === 0 ? thumbCrop : undefined} />
                </div>
                {i === 0 ? (
                  <>
                    <span className="pill dark">代表 · 縮圖</span>
                    {/* 與旁邊的「代表 · 縮圖」徽章垂直尺寸統一（23px） */}
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, lineHeight: '13px' }}
                      onClick={() => setCropOpen(true)}>✂ 縮圖裁切</button>
                  </>
                ) : (
                  <span className="pill">追加圖片</span>
                )}
                <span className="fx" style={{ marginLeft: 'auto' }}
                  onClick={() => del.ask('確定要刪除這張圖片嗎？', () => setArts(l => l.filter(x => x.id !== a.id)))}>✕</span>
              </div>
            )} />
        )}
        <input id="relArtsF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addArts(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
          onClick={() => document.getElementById('relArtsF')?.click()}
          {...fileDrop(fl => addArts(fl))}>
          ＋ ADD ART {arts.length === 0 && '（新增第一張時指定縮圖裁切）'}
        </button>

        {/* 全身圖片（v1.9）— 配對左右角色，預覽中拖曳 = 位置 · 滾輪 = 大小 · 右鍵 = 前後 */}
        {pairMembers.length > 0 && (
          <>
            <label className="k-label" style={{ margin: 0 }}>
              {auObj ? `全身圖片 — ${auObj.label} AU` : '全身圖片'} <span style={{ fontWeight: 400, color: 'var(--faint)' }}>
                — 中央全身模式的左右角色 · 預覽中拖曳＝位置、滾輪＝大小、右鍵＝前後</span>
            </label>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {pairMembers.map(m => {
                const d = fulls[m.charId];
                const nm = memberNames?.[m.charId] ?? m.charId;
                return (
                  <div key={m.charId} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <b style={{ fontSize: 12 }}>{nm}</b>
                    <label className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, cursor: 'var(--cur-pointer,pointer)' }}
                      {...fileDrop(fl => { const f = fl[0]; if (f) setFulls(o => ({ ...o, [m.charId]: { file: f, url: URL.createObjectURL(f) } })); })}>
                      {d ? '替換' : '↑ 上傳'}
                      <input type="file" accept="image/*" style={{ display: 'none' }}
                        onChange={e => {
                          const f = e.target.files?.[0]; e.target.value = '';
                          if (f) setFulls(o => ({ ...o, [m.charId]: { file: f, url: URL.createObjectURL(f) } }));
                        }} />
                    </label>
                    {d && (
                      <span className="fx" onClick={() => del.ask(`要刪除 ${nm} 的全身圖片嗎？`, () => setFulls(o => {
                        const n = { ...o }; delete n[m.charId]; return n;
                      }))}>✕</span>
                    )}
                  </div>
                );
              })}
            </div>
            {Object.keys(fulls).length > 0 && (
              /* 與實際顯示相同的比例（3/4.1）· 相同配置（fb 左右框）— 在此調整的大小與詳細頁完全一致（v1.9） */
              <div style={{
                position: 'relative', width: '100%', maxWidth: 340, margin: '0 auto', aspectRatio: '3/4.1', borderRadius: 10,
                overflow: 'hidden', background: 'linear-gradient(180deg,#262b33,#181b20)', border: '1px solid var(--line)',
              }}>
                {pairMembers.map((m, i) => (
                  <div key={m.charId} style={{
                    position: 'absolute', width: '62%', bottom: '-2%',
                    top: i === 0 ? '5%' : '12%',
                    ...(i === 0 ? { left: '-4%' } : { right: '-4%' }),
                    zIndex: (fullFront ?? pairMembers[1]?.charId) === m.charId ? 3 : 2,
                  }}>
                    <FullPrevImg draft={fulls[m.charId]}
                      scale={fullScales[m.charId] ?? 90}
                      offX={fullOffsets[m.charId]?.x ?? 0}
                      offY={fullOffsets[m.charId]?.y ?? 0}
                      name={memberNames?.[m.charId] ?? m.charId}
                      shadow={fullShadow(shadowCustom ? nameShadowColor : undefined,
                        shadowCustom ? nameShadow : undefined, '0 6px 14px')}
                      onScale={v => setFullScales(s => ({ ...s, [m.charId]: v }))}
                      onOffset={(x, y) => setFullOffsets(s => ({ ...s, [m.charId]: { x, y } }))}
                      onLayer={front => {
                        const other = pairMembers.find(x => x.charId !== m.charId)?.charId;
                        setFullFront(front ? m.charId : (other ?? m.charId));
                      }} />
                  </div>
                ))}
                {fullFront && (
                  <span className="pill" style={{ position: 'absolute', left: 10, top: 10, zIndex: 5 }}>
                    前：{memberNames?.[fullFront] ?? fullFront}
                  </span>
                )}
              </div>
            )}
            <p className="hint" style={{ margin: '4px 0 0' }}>拖曳 = 位置 · 滾輪 = 大小 · 右鍵 = 向前／向後 — 預覽比例與詳細畫面相同</p>

            {/* 左／右一句話（v2.0 使用者發現 — 之前只有顏色，沒有文字欄位） */}
            <label className="k-label" style={{ margin: '10px 0 0' }}>一句話 — 上方左／右台詞</label>
            {pairMembers.map((m, i) => (
              <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <b style={{ fontSize: 12, width: 92, flexShrink: 0 }}>{i === 0 ? '左側' : '右側'} · {memberNames?.[m.charId] ?? m.charId}</b>
                <KInput value={quotes[m.charId] ?? ''}
                  onChange={e => setQuotes(s => ({ ...s, [m.charId]: e.target.value }))}
                  placeholder="留空則不顯示" style={{ flex: 1 }} />
              </div>
            ))}

            {/* 成員卡片名稱大小（v2.0 使用者確認）— 不自動縮小，直接自行指定 */}
            <label className="k-label" style={{ margin: '10px 0 0' }}>名稱大小 — 成員卡片</label>
            {pairMembers.map((m, i) => (
              <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <b style={{ fontSize: 12, width: 92, flexShrink: 0 }}>{i === 0 ? '左側' : '右側'} · {memberNames?.[m.charId] ?? m.charId}</b>
                <KCheck label="Bold" checked={nameBolds[m.charId] ?? true}
                  onChange={(v: boolean) => setNameBolds(s => ({ ...s, [m.charId]: v }))} />
                <KStep value={nameSizes[m.charId] ?? 17}
                  onChange={(v: number) => setNameSizes(s => ({ ...s, [m.charId]: v }))}
                  min={10} max={32} step={1} suffix="px" />
              </div>
            ))}

            {/* Hero 台詞顏色（配對，v1.9 使用者要求）— 左／右角色台詞文字色・引號色 */}
            <label className="k-label" style={{ margin: '10px 0 0' }}>台詞顏色 — 上方左／右一句話</label>
            {pairMembers.map((m, i) => (
              <div key={m.charId} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 12, width: 92 }}>{i === 0 ? '左側' : '右側'} · {memberNames?.[m.charId] ?? m.charId}</b>
                <span className="cp-lb">文字</span>
                <ColorField value={quoteColors[m.charId]?.fg ?? '#d7dae0'}
                  onChange={hex => setQuoteColors(s => ({ ...s, [m.charId]: { ...s[m.charId], fg: hex } }))} />
                <span className="cp-lb">引號</span>
                <ColorField value={quoteColors[m.charId]?.mark ?? '#c96a73'}
                  onChange={hex => setQuoteColors(s => ({ ...s, [m.charId]: { ...s[m.charId], mark: hex } }))} />
              </div>
            ))}
          </>
        )}

        {/* 標頭圖片（v1.5）— 上方全寬模糊 + 向下淡出 · 位置裁切（原始圖片無損） */}
        <label className="k-label" style={{ margin: 0 }}>
          標頭圖片 <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 詳細頁上方以全寬模糊背景顯示，越往下越透明（可選）</span>
        </label>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ width: 200, aspectRatio: '3/1', borderRadius: 8, overflow: 'hidden', position: 'relative', border: '1.5px dashed var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
            onClick={() => document.getElementById('relHeaderF')?.click()}
            {...fileDrop(fl => {
              const hf = fl[0];
              if (hf) {
                setHeaderFile(hf); setHeaderUrl(URL.createObjectURL(hf)); setHeaderRemoved(false);
                setHeaderCrop(undefined); setHeaderCropOpen(true);
              }
            })}>
            {headerUrl ? (
              <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)' }}>
                <CropImg src={headerUrl} crop={headerCrop} />
              </div>
            ) : (!headerRemoved && initHeaderId) ? (
              <HeaderPreview refId={initHeaderId} crop={headerCrop} />
            ) : (
              <div className="ph" style={{ width: '100%', height: '100%' }}><span style={{ fontSize: 10 }}>HEADER</span></div>
            )}
          </div>
          <input id="relHeaderF" type="file" accept="image/*" style={{ display: 'none' }}
            onChange={e => {
              const hf = e.target.files?.[0];
              if (hf) {
                setHeaderFile(hf); setHeaderUrl(URL.createObjectURL(hf)); setHeaderRemoved(false);
                setHeaderCrop(undefined); setHeaderCropOpen(true);   // 上傳後立即指定位置
              }
              e.target.value = '';
            }} />
          {(headerUrl || (!headerRemoved && initHeaderId)) && (
            <>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => setHeaderCropOpen(true)}>✂ 位置</button>
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => { setHeaderFile(null); setHeaderUrl(''); setHeaderRemoved(true); setHeaderCrop(undefined); }}>移除</button>
            </>
          )}
        </div>
        {headerCropOpen && (headerUrl || (!headerRemoved && initHeaderId)) && (
          <HeaderCrop src={headerUrl} refId={!headerUrl ? initHeaderId : undefined} crop={headerCrop}
            onClose={() => setHeaderCropOpen(false)}
            onApply={c => { setHeaderCrop(c); setHeaderCropOpen(false); }} />
        )}

        {/* 沒有標頭圖片時使用的背景（v2.0 使用者要求）— 與設計分頁的背景設定相同方式。
            未指定時維持原本狀態，不在該位置繪製任何內容。各 AU 可以分別設定 */}
        {(
          <div style={{ marginTop: 10 }}>
            <KCheck label="沒有標頭圖片時直接指定背景" checked={headerBgCustom} onChange={setHeaderBgCustom} />
            {headerBgCustom && (
              <div className="cf-stack" style={{ marginTop: 8 }}>
                <div className="cf-row">
                  <ColorField value={headerBgG1} onChange={setHeaderBgG1} />
                  <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                  <ColorField value={headerBgG2} onChange={setHeaderBgG2} />
                </div>
                <div className="cf-row">
                  <span className="cp-lb">角度</span>
                  <KStep value={headerBgAngle} min={0} max={360} step={15} suffix="°" onChange={setHeaderBgAngle} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 右：基本資訊 + 儲存 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>基本</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="自設關係名稱" value={name} onChange={e => setName(e.target.value)}
              style={{ fontFamily: familyOf(fontId), letterSpacing: '.1em' }} />
            {/* AU 專用自設名稱（v2.0 使用者要求）— 僅查看此 AU 時使用。留空則使用上方名稱 */}
            {auObj && (
              <div>
                <label className="k-label" style={{ marginBottom: 5 }}>{auObj.label} AU 名稱</label>
                <KInput placeholder={name || '沿用自設關係名稱'} value={auName}
                  onChange={e => setAuName(e.target.value)}
                  style={{ fontFamily: familyOf(fontId), letterSpacing: '.1em' }} />
                <p className="hint" style={{ margin: '5px 0 0' }}>
                  僅查看此 AU 時使用的名稱 — 留空則沿用自設關係名稱
                </p>
              </div>
            )}
            {/* 頁面網址（v1.9）— /rels/{slug}，留空則自動 · 重複時警告 */}
            {/* 修改時也可以變更（v2.0 使用者要求）— 留空則沿用原本網址（id）。
                AU 編輯時網址屬於 base 管理，因此隱藏 */}
            {!auObj && (
              <div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--faint)', whiteSpace: 'nowrap' }}>/rels/</span>
                  <KInput placeholder={isNew ? '頁面網址（可選）' : `頁面網址（留空則使用 ${initial?.id}）`} value={slug}
                    onChange={e => setSlug(slugify(e.target.value))} style={{ flex: 1 }} />
                </div>
                {slug && slug !== (initial?.slug ?? '') && existingIds?.includes(slug) && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--accent)' }}>此網址已被使用</p>
                )}
              </div>
            )}
            <KInput placeholder="標語" value={catchphrase} onChange={e => setCatchphrase(e.target.value)} />
            {/* 自設名稱・標語文字顏色（v1.9 使用者要求）— 預設為主題色。各 AU 可以分別設定（v2.0） */}
            {(
              <div>
                <KCheck label="直接指定自設名稱・標語顏色" checked={txtCustom} onChange={setTxtCustom} />
                {txtCustom && (
                  <div className="cf-row" style={{ marginTop: 8 }}>
                    <span className="cp-lb">自設名稱</span>
                    <ColorField value={nameColor} onChange={setNameColor} />
                    <span className="cp-lb">標語</span>
                    <ColorField value={cpColor} onChange={setCpColor} />
                  </div>
                )}
              </div>
            )}
            {/* 陰影（v2.0 使用者要求）— 指定顏色與濃度。會同時套用於自設名稱與全身圖片 */}
            {(
              <div>
                <KCheck label="直接指定陰影（自設名稱・全身）" checked={shadowCustom} onChange={setShadowCustom} />
                {shadowCustom && (
                  <div className="cf-stack" style={{ marginTop: 8 }}>
                    <div className="cf-row">
                      <span className="cp-lb">顏色</span>
                      <ColorField value={nameShadowColor} onChange={setNameShadowColor} />
                    </div>
                    <div className="cf-row">
                      <span className="cp-lb">強度</span>
                      <KStep value={nameShadow} min={0} max={200} step={10} suffix="%" onChange={setNameShadow} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* CP/NCP（v1.9）— CP＝情侶 · NCP＝非情侶。各 AU 可在詳細頁的 AU 管理中另外指定 */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <label className="k-label" style={{ margin: 0 }}>分類</label>
              <div className="mini-seg">
                {(['cp', 'ncp'] as RelCpTag[]).map(t => (
                  <button key={t} className={cp === t ? 'on' : ''} onClick={() => setCp(t)}>{CP_LABEL[t]}</button>
                ))}
              </div>
            </div>
            {/* 徽章顏色（v2.0 使用者要求）— 顯示在自設名稱上方的 CP/NCP 標示。各 AU 可分別設定 */}
            {(
              <div>
                <KCheck label="直接指定 CP 徽章顏色" checked={tagCustom} onChange={setTagCustom} />
                {tagCustom && (
                  <div className="cf-stack" style={{ marginTop: 8 }}>
                    <div className="cf-row">
                      <span className="cp-lb">背景</span>
                      <ColorField value={cpTagBg} onChange={setCpTagBg} />
                      <span className="cp-lb">文字</span>
                      <ColorField value={cpTagFg} onChange={setCpTagFg} />
                    </div>
                    <div className="cf-row">
                      <span className="cp-lb">預覽</span>
                      <span className="pill" style={{ background: cpTagBg, color: cpTagFg, borderColor: cpTagBg }}>
                        {CP_LABEL[cp]}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="hint" style={{ margin: '2px 0 0' }}>名稱字型 — 套用於詳細頁大型標題</p>
            <KSelect value={fontId} onChange={setFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span> }))} />
            <p className="hint" style={{ margin: '2px 0 0' }}>正文文字字型 — 套用於卡片介紹・時間軸・問答文字</p>
            <KSelect value={bodyFontId} onChange={setBodyFontId}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span> }))} />
            <div>
              <label className="k-label">頁面主題{auObj ? ` — ${auObj.label}` : ''}</label>
              {/* AU 編輯（v1.9）— 沿用原本（基礎）主題／此 AU 專用主題 */}
              {auObj && (
                <div className="mini-seg" style={{ marginBottom: 6 }}>
                  <button className={themeFollow ? 'on' : ''} onClick={() => setThemeFollow(true)}>沿用原本主題</button>
                  <button className={!themeFollow ? 'on' : ''} onClick={() => setThemeFollow(false)}>此 AU 專用</button>
                </div>
              )}
              {!(auObj && themeFollow) && (
              <div className="mini-seg">
                <button className={themeMode === 'site' ? 'on' : ''} onClick={() => setThemeMode('site')}>沿用首頁主題</button>
                <button className={themeMode === 'custom' ? 'on' : ''} onClick={() => setThemeMode('custom')}>輸入主題色</button>
              </div>
              )}
              {!(auObj && themeFollow) && themeMode === 'custom' && (
                /* 共用 ColorField — 與其他顏色輸入使用相同樣式（v1.9 使用者回饋） */
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
                  <ColorField value={themeColor} onChange={setThemeColor} />
                  <div className="mini-seg">
                    <button className={themeTone === 'dark' ? 'on' : ''} onClick={() => setThemeTone('dark')}>深色感</button>
                    <button className={themeTone === 'light' ? 'on' : ''} onClick={() => setThemeTone('light')}>淺色感</button>
                  </div>
                </div>
              )}
              <p className="hint" style={{ margin: '6px 0 0' }}>
                {auObj && themeFollow
                  ? '此 AU 會直接使用原本自設關係的頁面主題'
                  : themeMode === 'custom'
                  ? '進入此頁面時，首頁的整體調色盤會以此顏色為基準切換，離開後恢復原本主題'
                  : '此頁面也會沿用首頁主題'}
              </p>
            </div>
            {/* 隱藏問答回答（v2.0 使用者要求）— 不讓訪客看到回答內容。
                這是整個自設關係的設定，因此 AU 編輯中不顯示 */}
            {!auObj && (
              <div>
                <KCheck label="隱藏問答回答" checked={qaHide} onChange={setQaHide} />
                <p className="hint" style={{ margin: '5px 0 0', lineHeight: 1.6 }}>
                  問題會維持顯示，只隱藏<b>回答內容</b> — 管理員與獲得此自設角色權限的會員才能查看。
                  {qaHide && (
                    <>
                      <br />
                      <b style={{ color: 'var(--accent)' }}>但這只是從畫面上隱藏，並非完全阻擋。</b>{' '}
                      回答仍會以公開狀態儲存，因此有心尋找的人仍可能看到；真的不應公開的內容請不要填寫。
                    </>
                  )}
                </p>
              </div>
            )}

            {/* 頁面背景（v2.0 使用者要求）— 停留在此頁面期間的背景漸層。各 AU 可分別設定 */}
            {(
              <div>
                <KCheck label="直接指定頁面背景" checked={pageBgCustom} onChange={setPageBgCustom} />
                {pageBgCustom && (
                  <div className="cf-stack" style={{ marginTop: 8 }}>
                    <div className="cf-row">
                      <ColorField value={pageBgG1} onChange={setPageBgG1} />
                      <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                      <ColorField value={pageBgG2} onChange={setPageBgG2} />
                    </div>
                    <div className="cf-row">
                      <span className="cp-lb">角度</span>
                      <KStep value={pageBgAngle} min={0} max={360} step={15} suffix="°" onChange={setPageBgAngle} />
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* 全身／插畫切換開關顏色（v1.9 使用者要求）— 配對中央圖片的切換開關。各 AU 可分別設定（v2.0） */}
            {(
              <div>
                <KCheck label="直接指定全身／插畫切換開關顏色" checked={illuCustom} onChange={setIlluCustom} />
                {illuCustom && (
                  /* 固定為一行（v1.9 使用者回饋）— 避免在狹窄面板中換成兩行，因此輸入框會縮小 */
                  <div className="cf-row" style={{ marginTop: 8 }}>
                    <span className="cp-lb">背景</span>
                    <ColorField value={illuBg} onChange={setIlluBg} />
                    <span className="cp-lb">選取</span>
                    <ColorField value={illuOn} onChange={setIlluOn} />
                  </div>
                )}
              </div>
            )}
            <KSelect value={visibility} onChange={v => setVisibility(v as Visibility)}
              options={[
                { value: 'public', label: '完全公開' },
                { value: 'member', label: '會員公開' },
                { value: 'private', label: '僅自己可見' },
              ]} />
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
        <FirstArtCrop open={cropOpen} item={arts[0]} crop={thumbCrop}
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

/** 已儲存的標頭圖片預覽 — 套用位置裁切 */
function HeaderPreview({ refId, crop }: { refId: string; crop?: CropValue }) {
  const url = useBlobUrl(refId);
  if (!url) return <div className="ph" style={{ width: '100%', height: '100%' }} />;
  return (
    <div style={{ position: 'absolute', inset: 0, filter: 'blur(2px)' }}>
      <CropImg src={url} crop={crop} />
    </div>
  );
}

/** 標頭位置裁切 — 新檔案（objectURL）或已儲存 Blob 來源，框架比例 = 詳細頁標頭（約 3:1） */
function HeaderCrop({ src, refId, crop, onClose, onApply }: {
  src: string; refId?: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const loaded = useBlobUrl(refId);
  const s = src || loaded;
  if (!s) return null;
  return <CropEditor open src={s} aspect={3} aspectLabel="標頭比例" initial={crop} onClose={onClose} onApply={onApply} />;
}

/** 以第一張圖片（新檔案或已儲存 Blob）作為來源的 4:3 裁切編輯器 */
function FirstArtCrop({ open, item, crop, onClose, onApply }: {
  open: boolean; item: ArtItem; crop?: CropValue;
  onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const [loadedUrl, setLoadedUrl] = useState('');
  useEffect(() => {
    if (item.url || !item.ref || !open) return;
    getBlob(item.ref).then(b => { if (b) setLoadedUrl(URL.createObjectURL(b)); });
  }, [item, open]);
  const src = item.url || loadedUrl;
  if (!src) return null;
  return <CropEditor open={open} src={src} aspect="4:3" initial={crop} onClose={onClose} onApply={onApply} />;
}