'use client';
// 角色登錄／個人資料編輯 — 專用頁面表單（4.4）
// 不是 Modal，所以即使誤點也不會關閉。分頁內容會切換到獨立的編輯畫面來撰寫。
// Art 可以有多張 — 第一張是代表完整 Art，同時也是列表縮圖的原始圖片（3:4 裁切）（6.1）
import React, { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Character, CharTab, ColorChip, Visibility, CharGrant } from '@/lib/charStore';
import { GrantsEditor } from '@/components/chars/GrantsEditor';
import { newId } from '@/lib/postStore';
import { putBlob, getBlob, useBlobUrl } from '@/lib/blobStore';
import { useFonts, deVarFamily } from '@/lib/fontStore';
import { KInput, KSelect, KStep, KCheck } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { ColorField } from '@/components/ui/ColorField';
import { CropEditor, CropValue, CropImg } from '@/components/ui/CropEditor';
import { DragList } from '@/components/ui/DragList';
import { useConfirmDelete } from '@/components/ui/Modal';
import { SymbolInput } from '@/components/ui/SymbolInput';
import { fileDrop } from '@/lib/dnd';
import { isValidSlug, slugify } from '@/lib/link';
import { useToast } from '@/components/ui/Toast';
import { Lightbox } from '@/components/ui/Lightbox';

interface SpecRow { id: string; label: string; value: string }
interface ColorRow extends ColorChip { id: string }
interface ArtItem { id: string; ref?: string; url?: string; file?: File }

function ArtThumb({ item, crop }: { item: ArtItem; crop?: CropValue }) {
  const loaded = useBlobUrl(item.ref);
  const src = item.url ?? loaded;
  if (!src) return <div className="ph" style={{ width: '100%', height: '100%' }} />;
  return <CropImg src={src} crop={crop} />;
}

export function CharEditForm({ initial, onSave, onCancel, auMode, existingIds }: {
  initial: Character | null;               // null = 新增登錄
  onSave: (c: Character) => void;
  onCancel: () => void;
  auMode?: boolean;                        // AU 專用編輯（v1.9）— 公開範圍・會員權限由 base 負責，因此隱藏
  existingIds?: string[];                  // 頁面網址重複檢查用（v1.9 — 新增登錄）
}) {
  const { fonts, familyOf } = useFonts();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const isNew = !initial;

  const [name, setName] = useState(initial?.name ?? '');
  // 頁面網址 /chars/{slug} — 新增時留空則自動使用 id。編輯時也可以修改（v2.0 使用者要求）：
  // 只儲存別名（slug），id 保持不變，因此不會中斷參照，舊網址也仍然可以開啟
  const [slug, setSlug] = useState(initial?.slug ?? '');
  const [sub, setSub] = useState(initial?.sub ?? '');
  const [color, setColor] = useState(initial?.color ?? '#5d636d');
  const [themeMode, setThemeMode] = useState<'default' | 'custom'>(initial?.themeMode ?? 'default');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [fontId, setFontId] = useState(initial?.fontId ?? 'serif');
  const [nameSize, setNameSize] = useState(initial?.nameSize ?? 38);   // 詳細頁面的大型名稱字體大小（v2.0）
  const [nameBold, setNameBold] = useState(initial?.nameBold ?? true); // 詳細頁面的名稱粗體（v2.0 — 預設開啟）
  const [bodyFontId, setBodyFontId] = useState(initial?.bodyFontId ?? 'default');
  const [specs, setSpecs] = useState<SpecRow[]>(
    (initial?.specs ?? [{ label: '性別', value: '' }, { label: '身高', value: '' }]).map(s => ({ ...s, id: newId() })));
  const [colors, setColors] = useState<ColorRow[]>((initial?.colors ?? []).map(c => ({ ...c, id: newId() })));
  const [colorTipMode, setColorTipMode] = useState<'hex' | 'both' | 'label'>(initial?.colorTipMode ?? 'hex');
  // 色點邊框（v2.0 使用者要求）— 無／1px（指定顏色）。未指定時維持目前的淡色邊框
  const [colorBd, setColorBd] = useState<string | undefined>(initial?.colorBd);
  const [basicHtml, setBasicHtml] = useState(initial?.basicHtml ?? '');
  const [tabs, setTabs] = useState<CharTab[]>(initial?.tabs ?? []);
  const [arts, setArts] = useState<ArtItem[]>(() => {
    const refs = initial?.arts ?? (initial?.artId ? [initial.artId] : initial?.thumbId ? [initial.thumbId] : []);
    return refs.map(r => ({ id: newId(), ref: r }));
  });
  const [thumbCrop, setThumbCrop] = useState<CropValue | undefined>(initial?.thumbCrop);
  const [grants, setGrants] = useState<CharGrant[]>(initial?.grants ?? []); // 其他角色的會員權限（v1.9）
  const [cropOpen, setCropOpen] = useState(false);
  const [lb, setLb] = useState<number | null>(null);   // 點擊 Art 縮圖 → 查看原圖
  // 畫面切換：主表單／分頁專用編輯畫面
  const [view, setView] = useState<'main' | string>('main');

  const addArts = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    const items = Array.from(list).map(f => ({ id: newId(), url: URL.createObjectURL(f), file: f }));
    setArts(prev => {
      if (prev.length === 0) { setThumbCrop(undefined); setCropOpen(true); } // 第一張 → 指定縮圖裁切（6.1）
      return [...prev, ...items];
    });
  };

  const save = async () => {
    if (!name.trim()) { toast('請輸入名稱'); return; }
    // 頁面網址（v1.9／編輯時也可以修改 v2.0）— 有效性・重複檢查
    if (slug && slug !== (initial?.slug ?? '')) {
      if (!isValidSlug(slug)) { toast('網址只能使用英文小寫字母・數字・連字號'); return; }
      if (existingIds?.includes(slug)) { toast('此網址已被使用 — 請輸入其他網址'); return; }
    }
    const artIds = await Promise.all(arts.map(a => (a.file ? putBlob(a.file) : Promise.resolve(a.ref!))));
    onSave({
      id: initial?.id ?? (slug || newId()),
      // 編輯時設定的網址會作為別名儲存（v2.0）— 新增時網址就是 id，因此不另外儲存
      slug: !isNew ? (slug.trim() || undefined) : undefined,
      // 依照輸入內容原樣儲存 — 以前會轉成大寫儲存，因此無法使用小寫名稱
      name: name.trim(),
      sub: sub.trim(),
      color,
      themeMode,
      colors: colors.filter(x => x.hex).map(({ hex, label }) => ({ hex, label })),
      colorTipMode,
      colorBd,
      specs: specs.filter(s => s.label.trim()).map(({ label, value }) => ({ label: label.trim(), value })),
      tabs,   // 即使標題為空也保留 — 修正因篩選而消失的 Bug（v1.9 使用者指出）
      basicHtml,
      visibility,
      fontId,
      nameSize,
      nameBold,
      bodyFontId,
      thumbClass: initial?.thumbClass ?? '',
      arts: artIds,
      thumbId: artIds[0],       // 縮圖 = 第一張 Art + 裁切
      thumbCrop,
      artId: artIds[0],
      own: initial?.own ?? true,
      grants: grants.length ? grants : undefined,
    });
  };

  const rowInp: React.CSSProperties = { fontSize: 12, padding: '7px 10px' };
  const addBtn: React.CSSProperties = { padding: '5px 12px', fontSize: 11, justifySelf: 'center' };

  // 分頁刪除 — 會經過警告 Modal（v1.9）
  const del = useConfirmDelete();
  const askDeleteTab = (tabId: string, after?: () => void) => {
    const t = tabs.find(x => x.id === tabId);
    del.ask(`要刪除分頁「${t?.title || '無標題'}」嗎？`, () => {
      setTabs(l => l.filter(x => x.id !== tabId));
      after?.();
    }, '分頁中撰寫的內容也會一起消失。在儲存（SAVE）之前，如果按 CANCEL 離開表單，還可以復原。');
  };

  /* ---------- 分頁專用編輯畫面 ---------- */
  const curTab = tabs.find(t => t.id === view);
  if (curTab) {
    return <>
      <TabEditView
        tab={curTab}
        onChange={patch => setTabs(l => l.map(x => (x.id === curTab.id ? { ...x, ...patch } : x)))}
        onDelete={() => askDeleteTab(curTab.id, () => setView('main'))}
        onBack={() => setView('main')} />
      {del.element}
    </>;
  }

  /* ---------- 主表單 ---------- */
  return (
    <div className="write-grid">
      {/* 左：Art／規格／顏色／正文／分頁 */}
      <div className="panel" style={{ padding: 24, display: 'grid', gap: 12, alignContent: 'start' }}>
        {/* Art 列表 */}
        <label className="k-label" style={{ margin: 0 }}>
          Art <span style={{ fontWeight: 400, color: 'var(--faint)' }}>— 第一張是代表完整 Art · 列表縮圖從第一張進行 3:4 裁切 · ⠿ 調整順序</span>
        </label>
        {arts.length > 0 && (
          <DragList items={arts} keyOf={a => a.id} onReorder={setArts}
            render={(a, i) => (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '3px 0' }}>
                <span className="drag-h">⠿</span>
                <div data-tip="點擊查看原圖" onClick={() => setLb(i)}
                  style={{ width: 64, aspectRatio: '3/4', borderRadius: 7, overflow: 'hidden', position: 'relative', flexShrink: 0, cursor: 'zoom-in' }}>
                  <ArtThumb item={a} crop={i === 0 ? thumbCrop : undefined} />
                </div>
                {i === 0 ? (
                  <>
                    <span className="pill dark">代表 · 縮圖</span>
                    {/* 與旁邊的「代表 · 縮圖」徽章統一垂直高度（23px）。
                        詳細畫面中的顯示位置，在詳細頁面透過右鍵設定（v2.0） */}
                    <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5, lineHeight: '13px' }}
                      onClick={() => setCropOpen(true)}>✂ 縮圖裁切</button>
                  </>
                ) : (
                  <span className="pill">追加 Art</span>
                )}
                <span className="fx" style={{ marginLeft: 'auto' }}
                  onClick={() => del.ask('要刪除這張 Art 嗎？', () => setArts(l => l.filter(x => x.id !== a.id)))}>✕</span>
              </div>
            )} />
        )}
        <input id="chArtsF" type="file" accept="image/*" multiple style={{ display: 'none' }}
          onChange={e => { addArts(e.target.files); e.target.value = ''; }} />
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => document.getElementById('chArtsF')?.click()}
          {...fileDrop(fl => addArts(fl))}>
          ＋ ADD ART {arts.length === 0 && '（新增第一張時指定縮圖裁切）'}
        </button>

        {/* 基本資訊規格 */}
        <label className="k-label" style={{ margin: 0 }}>基本資訊項目</label>
        <DragList items={specs} keyOf={s => s.id} onReorder={setSpecs}
          render={s => (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%', padding: '2px 0' }}>
              <span className="drag-h">⠿</span>
              <KInput placeholder="項目" value={s.label} style={{ ...rowInp, width: 90 }}
                onChange={e => setSpecs(l => l.map(x => x.id === s.id ? { ...x, label: e.target.value } : x))} />
              <KInput placeholder="值" value={s.value} style={rowInp}
                onChange={e => setSpecs(l => l.map(x => x.id === s.id ? { ...x, value: e.target.value } : x))} />
              <span className="fx" onClick={() => {
                const remove = () => setSpecs(l => l.filter(x => x.id !== s.id));
                if (s.label.trim() || s.value.trim()) del.ask('要刪除這個項目嗎？', remove, `${s.label} — ${s.value}`);
                else remove();
              }}>✕</span>
            </div>
          )} />
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => setSpecs(l => [...l, { id: newId(), label: '', value: '' }])}>＋ ADD</button>

        {/* 主題色 — 每行 2 個 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <label className="k-label" style={{ margin: 0 }}>主題色（列出個人資料色點）</label>
          <div className="mini-seg" data-tip="色點懸停提示的顯示方式">
            <button className={colorTipMode === 'hex' ? 'on' : ''} onClick={() => setColorTipMode('hex')}>hex</button>
            <button className={colorTipMode === 'both' ? 'on' : ''} onClick={() => setColorTipMode('both')}>名稱+hex</button>
            <button className={colorTipMode === 'label' ? 'on' : ''} onClick={() => setColorTipMode('label')}>僅名稱</button>
          </div>
          {/* 色點邊框（v2.0 使用者要求）— 未設定時維持目前的淡色邊框 */}
          <div className="mini-seg" data-tip="色點邊框">
            <button className={colorBd === undefined ? 'on' : ''} onClick={() => setColorBd(undefined)}>預設</button>
            <button className={colorBd === 'none' ? 'on' : ''} onClick={() => setColorBd('none')}>無</button>
            <button className={colorBd !== undefined && colorBd !== 'none' ? 'on' : ''}
              onClick={() => setColorBd(c => (c && c !== 'none' ? c : '#1d2025'))}>1px</button>
          </div>
          {colorBd !== undefined && colorBd !== 'none' && (
            <ColorField value={colorBd} onChange={setColorBd} />
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 10px' }}>
          {colors.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
              <ColorField value={c.hex} onChange={hex => setColors(l => l.map(x => x.id === c.id ? { ...x, hex } : x))} />
              <KInput placeholder="標籤" value={c.label} style={{ ...rowInp, flex: 1, minWidth: 50 }}
                onChange={e => setColors(l => l.map(x => x.id === c.id ? { ...x, label: e.target.value } : x))} />
              <span className="fx" onClick={() => del.ask('要刪除這個顏色嗎？', () => setColors(l => l.filter(x => x.id !== c.id)), c.label || c.hex)}>✕</span>
            </div>
          ))}
        </div>
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => setColors(l => [...l, { id: newId(), hex: '#888888', label: '' }])}>＋ ADD COLOR</button>

        {/* 基本介紹正文 — Rich Editor */}
        <label className="k-label" style={{ margin: 0 }}>基本資訊介紹正文</label>
        <RichEditor value={basicHtml} onChange={setBasicHtml}
          placeholder="請撰寫角色介紹 — 可以插入圖片（禁止腳本 6.3）" />

        {/* 額外分頁 — 只有列表，內容在專用畫面中 */}
        <label className="k-label" style={{ margin: 0 }}>額外分頁 — 請按下［編輯］後，在專用畫面中撰寫內容</label>
        {tabs.map(t => (
          <div key={t.id} style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1.5px solid var(--line)', borderRadius: 8, padding: '8px 10px' }}>
            <span style={{ width: 28, height: 28, borderRadius: 8, background: '#eef0f2', display: 'grid', placeItems: 'center', fontSize: 14, flexShrink: 0 }}>{t.icon}</span>
            <b style={{ fontSize: 13, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title || '（無標題）'}</b>
            {t.subtitle && <small style={{ color: 'var(--faint)', fontSize: 10.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.subtitle}</small>}
            <small style={{ color: 'var(--faint)', fontSize: 10.5, flexShrink: 0 }}>{t.html ? `${t.html.length.toLocaleString()}字` : '空白'}</small>
            <button className="btn btn-dark" style={{ marginLeft: 'auto', height: 27, padding: '0 12px', fontSize: 11 }}
              onClick={() => setView(t.id)}>編輯 ›</button>
            <span className="fx" onClick={() => askDeleteTab(t.id)}>✕</span>
          </div>
        ))}
        <button className="btn btn-ghost" style={addBtn}
          onClick={() => {
            const id = newId();
            setTabs(l => [...l, { id, icon: '✦', title: '', html: '' }]);
            setView(id); // 立即切換到專用編輯畫面
          }}>＋ ADD TAB</button>

        {/* 會員權限 — 直到角色扮演遊玩／編輯（第 3 階段會員-角色連接，v1.9）— AU 編輯由 base 負責。
            **僅管理員**（v2.0 使用者確認）— 即使取得編輯權限的會員進入此畫面，
            也不能管理權限。如果開放，他可以使用自己獲得的權限再把權限分給其他人。
            儲存時會原樣保留既有 grants（因為這個畫面不會操作它）。
            **與 own 是否無關**（v2.0 分支回報）— 以前只有其他角色（own=false）才會顯示，
            因此在首頁直接將對方角色正式登錄為角色時，就無法設定權限。
            現在改為僅管理員可操作後，沒有必要再限制 own — 權限判定（charGrant・角色扮演參與）
            原本就不會查看 own。 */}
        {!auMode && isAdmin && (
          <>
            <label className="k-label" style={{ margin: '6px 0 0' }}>會員權限 — 角色扮演遊玩・角色編輯</label>
            <GrantsEditor value={grants} onChange={setGrants} />
          </>
        )}
      </div>

      {/* 右：基本設定 + 儲存 */}
      <div>
        <div className="panel widget" style={{ marginBottom: 14 }}>
          <h4>基本</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput placeholder="名稱" value={name} onChange={e => setName(e.target.value)}
              style={{ fontFamily: familyOf(fontId) }} />
            {/* 頁面網址（v1.9）— /chars/{slug}，留空則自動 · 重複時警告。
                編輯時也可以修改（v2.0 使用者要求）— 留空則維持原本網址（id）。
                AU 編輯中，網址由 base 負責，因此隱藏 */}
            {!auMode && (
              <div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: 'var(--faint)', whiteSpace: 'nowrap' }}>/chars/</span>
                  <KInput placeholder={isNew ? '頁面網址（可選）' : `頁面網址（留空則使用 ${initial?.id}）`} value={slug}
                    onChange={e => setSlug(slugify(e.target.value))} style={{ flex: 1 }} />
                </div>
                {slug && slug !== (initial?.slug ?? '') && existingIds?.includes(slug) && (
                  <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--accent)' }}>此網址已被使用</p>
                )}
              </div>
            )}
            <KInput placeholder="一句話介紹（可選）" value={sub} onChange={e => setSub(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="cp-lb">代表主題色</span>
              <ColorField value={color} onChange={setColor} />
            </div>
            {/* 詳細頁面主題（v1.9 使用者確認）— 沿用既有主題／切換成代表主題色的調色盤 */}
            <div className="mini-seg">
              <button className={themeMode === 'default' ? 'on' : ''} onClick={() => setThemeMode('default')}>沿用既有主題</button>
              <button className={themeMode === 'custom' ? 'on' : ''} onClick={() => setThemeMode('custom')}>角色主題色</button>
            </div>
            {/* 公開範圍由 base 負責 — AU 編輯中隱藏（v1.9） */}
            {!auMode && (
              <KSelect value={visibility} onChange={v => setVisibility(v as Visibility)}
                options={[
                  { value: 'public', label: '完全公開' },
                  { value: 'member', label: '會員公開' },
                  { value: 'private', label: '僅自己可見' },
                ]} />
            )}
            {/* 說明放在下拉選單**上方**（v2.0 使用者要求 — 與自設關係表單相同配置） */}
            <p className="hint" style={{ margin: '2px 0 0' }}>名稱字型 — 套用於列表・詳細頁面的名稱</p>
            <KSelect value={fontId} onChange={setFontId}
              options={fonts.map(f => ({
                value: f.id,
                label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span>,
              }))} />
            {/* 名稱長度各不相同，因此自動縮放會不自然 — 每個角色自行設定（v2.0） */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span className="k-label" style={{ margin: 0, flex: 1 }}>詳細名稱大小</span>
              {/* 某些字型使用粗體會顯得不自然，因此可以關閉（v2.0 使用者要求）— 預設仍如之前一樣使用粗體 */}
              <KCheck label="Bold" checked={nameBold} onChange={setNameBold} />
              <KStep value={nameSize} onChange={setNameSize} min={14} max={72} step={1} suffix="px" />
            </div>
            <p className="hint" style={{ margin: '2px 0 0' }}>正文類型 — 套用於個人資料資訊・介紹文字</p>
            <KSelect value={bodyFontId} onChange={setBodyFontId}
              options={fonts.map(f => ({
                value: f.id,
                label: <span style={{ fontFamily: deVarFamily(f.family) }}>{f.name}</span>,
              }))} />
          </div>
        </div>
        <div className="form-actions">
          <button className="btn btn-onbk" onClick={onCancel}>CANCEL</button>
          <button className="btn btn-accent" onClick={save}>
            {isNew ? 'ADD' : 'SAVE'}
          </button>
        </div>
      </div>

      {/* 縮圖裁切（3:4 — 以第一張 Art 為基準，6.1） */}
      {arts[0] && (
        <FirstArtCrop open={cropOpen} item={arts[0]} crop={thumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setThumbCrop(c); setCropOpen(false); }} />
      )}
      {/* 查看 Art 原圖 — 尚未儲存的檔案使用 url，已儲存的使用 ref（Lightbox 兩者都能處理） */}
      {lb !== null && (
        <Lightbox srcs={arts.map(a => a.url ?? a.ref ?? '')} index={lb} onClose={() => setLb(null)} />
      )}
      {del.element}
    </div>
  );
}

/* ---------- 分頁專用編輯畫面 — 大型編輯器 + 即時預覽 ---------- */
function TabEditView({ tab, onChange, onDelete, onBack }: {
  tab: CharTab;
  onChange: (patch: Partial<CharTab>) => void;
  onDelete: () => void;
  onBack: () => void;
}) {
  return (
    <div className="panel" style={{ padding: 24, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <button className="btn btn-ghost" onClick={onBack}>‹ 返回</button>
        <b style={{ fontSize: 14 }}>分頁編輯</b>
        <span className="hint" style={{ margin: 0 }}>此畫面的內容會在個人資料［SAVE］時一併儲存</span>
        <button className="btn btn-ghost" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={onDelete}>刪除分頁</button>
      </div>
      {/* Icon + Title/Subtitle 單行 — Subtitle 會顯示在標題下方的小字（沒有則不顯示） */}
      <div style={{ display: 'flex', gap: 8 }}>
        {/* Icon — 點擊後可以選擇特殊字元預設樣式，也可以直接輸入（v1.9） */}
        <SymbolInput value={tab.icon} maxLength={2} style={{ width: 56, textAlign: 'center' }}
          onChange={v => onChange({ icon: v })} />
        <KInput placeholder="分頁標題" value={tab.title}
          onChange={e => onChange({ title: e.target.value })} />
        <KInput placeholder="副標題（可選）" value={tab.subtitle ?? ''}
          onChange={e => onChange({ subtitle: e.target.value })} />
      </div>
      {/* Rich Editor（TipTap）— 使用工具列設定格式・插入圖片，輸出為 HTML */}
      <RichEditor value={tab.html} onChange={html => onChange({ html })}
        placeholder="請撰寫分頁內容 — 可以插入圖片（禁止腳本 6.3）" />
      <button className="btn btn-dark" style={{ justifySelf: 'end' }} onClick={onBack}>完成 — 返回列表</button>
    </div>
  );
}

/** 以第一張 Art（新檔案或已儲存的 blob）作為來源，顯示 3:4 裁切編輯器 */
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
  if (!src || !open) return null;
  return <CropEditor open={open} src={src} aspect="3:4" initial={crop} onClose={onClose} onApply={onApply} />;
}