'use client';
// 委託詳細頁面（4.18）— 中央襯線標題 + 檢視器（懸停箭頭）+ 縮圖列 +
// 右側對齊價格／截止標準／名額／詢問連結 + 隔離渲染說明 + 每筆委託的主題色
import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ThemeProvider';
import { useLocalList } from '@/lib/postStore';
import {
  CommItem, COMM_SEED, useCommSettings, badgeStyle, fmtPrice, slotView, SLOT_CHARS, slotCount, slotTip,
} from '@/lib/commStore';
import { useFonts } from '@/lib/fontStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { useBlobUrl } from '@/lib/blobStore';
import { CropImg, CropEditor, CropValue } from '@/components/ui/CropEditor';
import { Tip } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { PageTitle } from '@/components/ui/PageText';
import { Lightbox } from '@/components/ui/Lightbox';
import { CommFormFill } from '@/components/comm/FormFill';

/** 信封圖示（線條圖示 — 4.18 詢問連結） */
function MailIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <rect x="3" y="5" width="18" height="14" rx="2.5" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </svg>
  );
}

function ViewerImg({ fileRef, ph }: { fileRef?: string; ph: string }) {
  const url = useBlobUrl(fileRef);
  if (!url) return <div className={`ph ${ph}`} style={{ position: 'absolute', inset: 0 }}><span>COMMISSION</span></div>;
  // 確保絕對不會被裁切 — 填滿整個框架，但使用 contain（維持比例・縱向較長的圖片會依照框架高度調整）
  // 與圖庫單一型相同規則（v1.9）
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" style={{
      position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
    }} />
  );
}

function StripThumb({ fileRef, ph, crop }: { fileRef?: string; ph: string; crop?: CropValue }) {
  const url = useBlobUrl(fileRef);
  if (!url) return <div className={`ph ${ph}`} style={{ position: 'absolute', inset: 0 }} />;
  return <CropImg src={url} crop={crop} />;
}

/** 調整縮圖位置 — 使用與縮圖列欄位相同的 4:3 比例（v2.0 使用者要求） */
function StripCropModal({ fileRef, crop, onClose, onApply }: {
  fileRef: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const url = useBlobUrl(fileRef);
  if (!url) return null;
  return <CropEditor open src={url} aspect="4:3" initial={crop} onClose={onClose} onApply={onApply} />;
}

export default function CommDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [items, setItems, loaded] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings, , setLoaded] = useCommSettings();
  const { familyOf } = useFonts();
  const [cur, setCur] = useState(0);
  const [delAsk, setDelAsk] = useState(false);
  const [lbOpen, setLbOpen] = useState(false); // 點擊代表圖片放大查看
  // 以縮圖右鍵變更順序（v2.0）— 因為是 Hook，所以必須放在 early return 之前
  const [cropFor, setCropFor] = useState<string | null>(null);   // 正在調整縮圖位置的圖片

  const c = items.find(x => x.id === id);
  /* 如果這篇文章所屬的位置是私密的，即使直接透過網址進入也不開放（v2.0 使用者要求）。
     文章網址中沒有區段，因此 MenuGuard 無法阻擋 — 這裡讀取文章並確認所屬區段後再判斷。
     **必須在其他 early return 之前呼叫**（因為是 Hook，所以每次 render 的數量必須相同） */
  const blocked = useHrefBlock(c && sectionHref('comm', c.secId ?? MAIN_SEC));

  // 每筆委託的頁面主題色（4.18）— 進入時切換整套調色盤，離開時恢復原本設定
  const { setPageTheme } = useTheme();
  const pageColor = c?.themeMode === 'custom' && c.themeColor ? c.themeColor : null;
  const pageTone = c?.themeTone;
  useEffect(() => {
    setPageTheme(pageColor, pageTone);
    return () => setPageTheme(null);
  }, [pageColor, pageTone, setPageTheme]);

  const descHtml = useMemo(() => (loaded && c ? sanitizeHtml(c.descHtml) : ''), [loaded, c]);

  // 如果被阻擋，就在這裡返回 — 必須先呼叫所有 Hook，才能確保每次 render 的數量相同
  if (blocked) return blocked;
  if (!loaded || !setLoaded) return <section className="page" />;
  if (!c) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>COMMISSION</PageTitle><p>找不到委託</p></div>
      </section>
    );
  }

  const badge = settings.commBadges.find(b => b.id === c.badgeId);
  const sv = slotView(c, settings);
  const imgs: (string | undefined)[] = c.images.length ? c.images : [undefined];
  const curIdx = Math.min(cur, imgs.length - 1);

  /* 調整縮圖位置（v2.0 使用者要求）— 右鍵「縮圖位置」。
     縮圖列的欄位是 4:3，因此縱向較長的圖片會在中央被裁切，看不到臉部。每張圖片可以個別調整。
     不修改原始圖片，只儲存要顯示哪個位置（其他位置的圖片不受影響）。 */
  const saveStripCrop = (ref: string, cv: CropValue) => {
    setItems(items.map(x => (x.id === c.id
      ? { ...x, stripCrops: { ...(x.stripCrops ?? {}), [ref]: cv } }
      : x)));
    setCropFor(null);
  };
  const sc = SLOT_CHARS[c.slotShape];

  return (
    <section className="page">
      {/* 無標題的標頭（只有按鈕）— 將與下方 Hero 標題的間距縮到最小 */}
      <div className="page-head" style={{ marginBottom: 2 }}>
        <PageTitle style={{ visibility: 'hidden', height: 0, margin: 0 }}>{c.name}</PageTitle>
        <div className="head-actions">
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push(`/comm/${c.id}/edit`)}>EDIT</button>}
          {isAdmin && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      {/* 本文限制寬度 — Hero 標題點擊 = 委託列表 */}
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
      {/* 1. 委託名稱 — 最上方中央（4.18） */}
      <div className="cm-hero">
        <h2 style={{ fontFamily: familyOf(c.titleFontId), cursor: 'var(--cur-pointer,pointer)', userSelect: 'none' }}
          data-tip="前往委託列表" onClick={() => router.push('/comm')}>{c.name}</h2>
        {c.sub && <small>{c.sub}</small>}
        {badge && <div style={{ marginTop: 10 }}><span style={badgeStyle(badge, settings.badgeShape)}>{badge.label}</span></div>}
      </div>

      {/* 2. 代表圖片檢視器 — 左右箭頭於懸停時顯示 · 點擊後放大查看 */}
      <div className="cm-viewer" style={{ cursor: imgs[curIdx] ? 'zoom-in' : undefined }}
        onClick={() => { if (imgs[curIdx]) setLbOpen(true); }}>
        <ViewerImg fileRef={imgs[curIdx]} ph={c.ph} />
        {imgs.length > 1 && (
          <>
            <button className="nav hv-actions" style={{ left: 12 }}
              onClick={e => { e.stopPropagation(); setCur(i => (i - 1 + imgs.length) % imgs.length); }}>◁</button>
            <button className="nav hv-actions" style={{ right: 12 }}
              onClick={e => { e.stopPropagation(); setCur(i => (i + 1) % imgs.length); }}>▷</button>
          </>
        )}
      </div>
      {/* 3. 縮圖列 — 目前圖片使用主色邊框 */}
      {imgs.length > 1 && (
        <div className="cm-strip">
          {imgs.map((im, i) => (
            <div key={i} className={`t ${i === curIdx ? 'on' : ''}`} onClick={() => setCur(i)}
              data-tip={isAdmin && im ? '右鍵 — 縮圖位置' : undefined}
              onContextMenu={e => {
                if (!isAdmin || !im) return;
                e.preventDefault();
                setCropFor(im);
              }}>
              <StripThumb fileRef={im} ph={c.ph} crop={im ? c.stripCrops?.[im] : undefined} />
            </div>
          ))}
        </div>
      )}

      {/* 4. 右側對齊 — 價格（較大）+ 截止標準 + 名額 + 詢問連結 */}
      <div className="cm-meta">
        <div className="price">₩{fmtPrice(c.priceMin)}{c.priceMax > c.priceMin && ` – ₩${fmtPrice(c.priceMax)}`}</div>
        {c.deadlineNote && <div className="due">{c.deadlineNote}</div>}
        <div className="slot-row">
          <Tip tip={slotTip(sv, settings)}>
            <span className="slots" style={{ letterSpacing: '.12em' }}>
              {Array.from({ length: sv.total }, (_, i) => (
                <span key={i} style={{ color: i < sv.used ? c.slotColor : 'var(--faint)' }}>
                  {i < sv.used ? sc.filled : sc.empty}
                </span>
              ))}
              <b style={{ marginLeft: 8, letterSpacing: '.04em' }}>SLOT {slotCount(sv, settings)}/{sv.total}</b>
            </span>
          </Tip>
          {c.contactUrl && (
            <a className="mail" href={c.contactUrl} target="_blank" rel="noreferrer" data-tip="詢問（新分頁）">
              <MailIcon />
            </a>
          )}
        </div>
      </div>

      {/* 5. 委託說明 — 隔離的新安化渲染（與留言板相同規則） */}
      <div className="panel" style={{ padding: 26, marginTop: 18 }}>
        <div className="post-body" style={{ fontFamily: familyOf(c.bodyFontId) }}
          dangerouslySetInnerHTML={{ __html: descHtml }} />
        {!c.descHtml && <p className="hint">說明是空白的</p>}
      </div>

      {/* 6. 委託表單（v1.9）— 啟用時才顯示：訪客直接填寫 → 以圖片內嵌 HTML 儲存並提交 */}
      {c.formEnabled && (c.form?.length ?? 0) > 0 && (
        <div className="panel" style={{ padding: 26, marginTop: 18 }}>
          <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 16 }}>COMMISSION FORM</h4>
          <div style={{ fontFamily: familyOf(c.bodyFontId) }}>
            <CommFormFill fields={c.form!} commName={c.name} />
          </div>
        </div>
      )}
      </div>

      {/* 代表圖片放大查看 — 從目前順序開始，使用 ‹ › 繼續切換 */}
      {/* 縮圖右鍵 > 縮圖位置（v2.0 使用者要求） */}
      {cropFor && (
        <StripCropModal fileRef={cropFor} crop={c.stripCrops?.[cropFor]}
          onClose={() => setCropFor(null)} onApply={cv => saveStripCrop(cropFor, cv)} />
      )}

      {lbOpen && c.images.length > 0 && (
        <Lightbox srcs={c.images} index={curIdx} onClose={() => setLbOpen(false)} />
      )}

      <ConfirmModal open={delAsk} title="確定要刪除委託嗎？"
        body={`"${c.name}" — 刪除後將無法復原。申請者列表中的連結顯示將會解除。`}
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setItems(items.filter(x => x.id !== c.id)); router.push('/comm'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}