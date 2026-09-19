'use client';
// 角色個人資料詳細頁面（4.4）— 左側圖示分頁 · 中央固定插圖 · 右側資訊面板
// 捲動：資訊較長時頁面會繼續向下，分頁・插圖維持固定（v1.9）
// 選擇 AU 時，整份個人資料（名稱・規格・插圖・分頁・介紹）都切換為該 AU 的值（charWithAu）—
// 編輯時透過 EDIT → /chars/[id]/edit?au= 專用頁面，像建立新的個人資料一樣撰寫（v1.9 使用者確認）
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, charGrant, charWithAu, chipBorder, Relation, REL_SEED , findByKey} from '@/lib/charStore';
import { sanitizeHtml } from '@/lib/sanitize';
import { useFonts } from '@/lib/fontStore';
import { useTheme } from '@/lib/ThemeProvider';
import { createPortal } from 'react-dom';
import { BlobImg, useBlobUrl } from '@/lib/blobStore';
import { CroppedBlobImg, CropEditor, type CropValue } from '@/components/ui/CropEditor';

import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { useSectionTitle } from '@/lib/sectionStore';
import { ConfirmModal } from '@/components/ui/Modal';

function CharDetailInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [chars, setChars, loaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const { familyOf } = useFonts();
  // 大字標題 — 如果是額外區段（倉庫角色等）就使用該區段名稱，點擊時也回到該列表（v2.0 使用者回報）
  const tt = useSectionTitle('chars', findByKey(chars, id)?.secId, 'CHARACTERS');
  const params = useSearchParams();
  const [tab, setTab] = useState('basic');
  const [artIdx, setArtIdx] = useState(0);
  const [delAsk, setDelAsk] = useState(false);   // 角色刪除確認
  const infoRef = useRef<HTMLDivElement>(null);

  // 也可以透過別名網址開啟（v2.0 使用者要求 — 即使之後更改網址，舊網址仍然有效）
  const ch = findByKey(chars, id);

  // AU 個人資料（v1.9）— 這個角色所屬的自設關係中的 AU 列表（排除 base），顯示於右上方縮圖
  const charAus = useMemo(() => (ch
    ? rels.flatMap(r => r.members.some(m => m.charId === ch.id)
      ? r.aus.filter(a => a.id !== 'base').map(a => ({ key: `${r.id}:${a.id}`, label: a.label, relName: r.name }))
      : [])
    : []), [rels, ch]);
  // 從 AU 編輯頁透過 ?au= 返回時，以該 AU 被選取的狀態開始
  const [auKey, setAuKey] = useState<string | null>(() => params.get('au'));
  // 代表插圖右鍵 → 調整詳細頁面中顯示的位置（v2.0）
  const [artCtx, setArtCtx] = useState<{ x: number; y: number; ref: string } | null>(null);
  // 正在編輯的插圖參照 + 當時實際顯示區域的寬高比（不是 3:4，而是會隨畫面高度改變）
  const [artCropOpen, setArtCropOpen] = useState<{ ref: string; ratio: number } | null>(null);
  const artBoxRef = useRef<HTMLDivElement>(null);
  const artBoxRatio = () => {
    const r = artBoxRef.current?.getBoundingClientRect();
    return r && r.height > 1 ? r.width / r.height : 3 / 4;
  };
  useEffect(() => {
    if (!artCtx) return;
    const close = () => setArtCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setArtCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', key);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', key); };
  }, [artCtx]);
  // AU 是「重新建立」的個人資料（v1.9 使用者確認）— 建立前不顯示 base，而是顯示登錄提示
  const auRegistered = !auKey || !!ch?.auProfiles?.[auKey];
  // 用於顯示的角色 — 只有 AU 指定的欄位會取代 base（名稱・身高・性別等都可以全部改變）
  const eff = ch ? charWithAu(ch, auKey) : undefined;

  /** 儲存詳細頁面中的插圖位置（v2.0）— 正在查看 AU 時只儲存到該 AU，否則儲存到原始資料 */
  const saveArtCrop = (c: CropValue | undefined) => {
    setChars(chars.map(x => {
      if (x.id !== id) return x;
      if (!auKey) return { ...x, artCrop: c };
      return { ...x, auProfiles: { ...x.auProfiles, [auKey]: { ...x.auProfiles?.[auKey], artCrop: c } } };
    }));
  };

  // 切換 AU 時，因為分頁配置・插圖會不同，所以重設
  useEffect(() => { setTab('basic'); setArtIdx(0); }, [auKey]);

  // 角色主題色 → 頁面臨時主題（4.18 方式，v1.9）— 只有選擇「角色主題色」時套用，離開後恢復原狀
  const { setPageTheme } = useTheme();
  const pageColor = auRegistered && eff?.themeMode === 'custom' ? eff.color : null;
  useEffect(() => {
    setPageTheme(pageColor);
    return () => setPageTheme(null);
  }, [pageColor, setPageTheme]);

  const curTab = eff?.tabs.find(t => t.id === tab);
  const tabHtml = useMemo(
    () => (loaded && curTab ? sanitizeHtml(curTab.html) : ''),
    [loaded, curTab],
  );
  const basicHtml = useMemo(
    () => (loaded && eff ? sanitizeHtml(eff.basicHtml) : ''),
    [loaded, eff],
  );

  if (!loaded) return <section className="page" />;
  if (!ch || !eff) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>找不到角色</p></div>
      </section>
    );
  }
  if (ch.visibility === 'private' && !isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>這是私密角色</p></div>
      </section>
    );
  }
  if (ch.visibility === 'member' && !user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>會員公開 — 登入後才能查看</p></div>
      </section>
    );
  }

  // 切換分頁時，讓資訊頂部捲動到畫面最上方（手機版，v1.9）
  const pickTab = (t: string) => {
    setTab(t);
    if (window.matchMedia('(max-width:960px)').matches) {
      infoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const editHref = auKey ? `/chars/${ch.id}/edit?au=${encodeURIComponent(auKey)}` : `/chars/${ch.id}/edit`;

  return (
    <section className="page page-char-detail">
      <div className="page-head">
        {/* 標題位置顯示選單名稱 — 點擊時返回列表。角色名稱則在右側個人資料面板中以大字顯示 */}
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        {/* 每個角色分別儲存 — key 中包含角色 id */}
        <EditableDesc k={`char-detail-desc:${ch.id}`} def="左側圖示分頁 → 切換右側資訊" />
        <div className="head-actions">
          {/* 管理員或擁有「可以編輯」權限的會員（第三階段會員－角色連結，v1.9）
              — 選擇 AU 狀態下的 EDIT 會進入該 AU 專用個人資料編輯 */}
          {(isAdmin || charGrant(ch, user?.id) === 'edit') && (
            <button className="btn btn-dark" onClick={() => router.push(editHref)}>EDIT</button>
          )}
          {isAdmin && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>

        <ConfirmModal open={delAsk} title="確定要刪除角色嗎？"
          body="個人資料・分頁資訊也會一併刪除，且無法復原。此角色所加入的自設關係中，其成員顯示也會消失。"
          onClose={() => setDelAsk(false)}
          buttons={[
            { label: 'DELETE', kind: 'accent', onClick: () => { setChars(chars.filter(c => c.id !== ch.id)); router.push(tt.href); } },
            { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
          ]} />
      </div>
      {/* AU 個人資料列表（v1.9）— 如果自設關係中有新增的 AU，就顯示於右上方，以各 AU 儲存的縮圖為準 */}
      {charAus.length > 0 && (
        <div className="au-list" style={{ justifyContent: 'flex-end', marginBottom: 10 }}>
          <div className={`au-item ${auKey === null ? 'on' : ''} ph ${ch.thumbClass}`} style={{ borderColor: auKey === null ? 'var(--accent)' : 'var(--line)' }}
            onClick={() => setAuKey(null)}>
            {(ch.thumbId || ch.arts?.[0]) && <CroppedBlobImg fileRef={ch.thumbId ?? ch.arts?.[0]} crop={ch.thumbCrop} ph={ch.thumbClass} />}
            <small>原始資料</small>
          </div>
          {charAus.map(a => {
            /* 只使用這個 AU **自身** 的縮圖（v2.0 使用者回報 —「建立新的世界觀後，列表卻被既有圖片填滿」）。
               charWithAu 在個人資料完全不存在時會直接回傳 base，所以未登錄的 AU 看起來像是借用了原始圖片 —
               沒有圖片時就顯示顏色佔位符 */
            const p = ch.auProfiles?.[a.key];
            const ref = p?.thumbId ?? p?.arts?.[0];
            return (
              <div key={a.key} className={`au-item ${auKey === a.key ? 'on' : ''} ph ${ch.thumbClass}`}
                style={{ borderColor: auKey === a.key ? 'var(--accent)' : 'var(--line)' }}
                data-tip={`${a.relName} · ${a.label}`}
                onClick={() => setAuKey(a.key)}>
                {ref && <CroppedBlobImg fileRef={ref} crop={p?.thumbCrop} ph={ch.thumbClass} />}
                <small>{a.label}</small>
              </div>
            );
          })}
        </div>
      )}
      {/* AU 尚未登錄（v1.9 使用者確認）— 不顯示 base，而是按照該 AU 重新建立角色 */}
      {auKey && !auRegistered ? (
        <div className="panel" style={{ textAlign: 'center', padding: 56 }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 24, letterSpacing: '.14em', marginBottom: 8 }}>
            {charAus.find(a => a.key === auKey)?.label ?? 'AU'}
          </div>
          <p style={{ fontSize: 13, color: 'var(--faint)', marginBottom: 16 }}>
            此 AU 的「{ch.name}」尚未登錄 — 登錄後會與此角色的 AU 個人資料連結
          </p>
          {(isAdmin || charGrant(ch, user?.id) === 'edit') && (
            <button className="btn btn-dark" onClick={() => router.push(editHref)}>＋ 登錄 AU 角色</button>
          )}
        </div>
      ) : (
      <div className="profile-wrap">
        {/* 左側圖示分頁 — 如果是 AU 就使用該 AU 的分頁配置 */}
        <div className="side-icons">
          <button className={tab === 'basic' ? 'on' : ''} data-tip="基本資訊" onClick={() => pickTab('basic')}>☰</button>
          {eff.tabs.map(t => (
            <button key={t.id} className={tab === t.id ? 'on' : ''} data-tip={t.title} onClick={() => pickTab(t.id)}>{t.icon}</button>
          ))}
          {isAdmin && (
            <button data-tip="新增分頁（編輯模式）" style={{ borderStyle: 'dashed', fontSize: 13 }}
              onClick={() => router.push(editHref)}>＋</button>
          )}
        </div>

        {/* 中央插圖 — 固定 · 如果有額外插圖可以點擊切換 */}
        {(() => {
          const arts = eff.arts && eff.arts.length > 0 ? eff.arts : (eff.artId ? [eff.artId] : []);
          if (arts.length === 0 && !eff.artUrl) {
            return <div className={`profile-center ph ${ch.thumbClass}`}><span>CHARACTER FULL ART</span></div>;
          }
          const cur = Math.min(artIdx, arts.length - 1);
          return (
            <div className="profile-center" ref={artBoxRef}
              style={{ cursor: arts.length > 1 ? 'pointer' : undefined }}
              onClick={() => { if (arts.length > 1) setArtIdx(i => (i + 1) % arts.length); }}
              /* 代表插圖右鍵 → 調整此畫面中顯示的位置（管理員，v2.0 使用者確認） */
              onContextMenu={e => {
                if (!(isAdmin || charGrant(ch, user?.id) === 'edit') || cur !== 0) return;
                e.preventDefault();
                setArtCtx({ x: e.clientX, y: e.clientY, ref: arts[0] });
              }}>
              {/* 指定的裁切位置在這裡也會套用 — 以前以中央為基準裁切，
                  導致列表中調整好的位置與這裡顯示的位置不同（只套用於代表插圖） */}
              {/* 列表縮圖裁切是以 3:4 為基準，所以不適合這裡（此區域的比例會隨畫面高度改變）
                  只有這裡另外設定了值時才使用，沒有設定時則以中央為基準（v2.0） */}
              <CroppedBlobImg fileRef={arts[cur] ?? eff.artUrl}
                crop={cur === 0 ? eff.artCrop : undefined}
                ph={ch.thumbClass} label="CHARACTER FULL ART" />
              {arts.length > 1 && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 12, display: 'flex', justifyContent: 'center', gap: 5, zIndex: 3 }}>
                  {arts.map((_, i) => (
                    <i key={i} style={{
                      width: i === cur ? 16 : 6, height: 6, borderRadius: 4,
                      background: i === cur ? '#fff' : 'rgba(255,255,255,.45)', transition: '.2s',
                    }} />
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* 右側資訊面板 — 最上方以大字顯示角色名稱（v1.6）· AU 模式則使用該 AU 的名稱・字體 */}
        <div className="panel profile-info" ref={infoRef} style={{ fontFamily: familyOf(eff.bodyFontId) }}>
          {/* 大小由每個角色自行設定（登錄・編輯中的「名稱大小」）— 自動縮小會因名稱長度而顯得不一致，
              因此直接使用設定好的大小（v2.0 使用者確認） */}
          <div style={{
            fontFamily: familyOf(eff.fontId) ?? 'var(--serif)', fontSize: eff.nameSize ?? 38,
            // 可以關閉粗體（v2.0 使用者要求 — 有些字體不適合粗體）。預設維持目前的粗體
            fontWeight: (eff.nameBold ?? true) ? 600 : 400,
            letterSpacing: '.2em', lineHeight: 1.1,
          }}>{eff.name}</div>
          <div className="sub" style={{ marginBottom: 14 }}>{eff.sub}</div>

          {tab === 'basic' ? (
            <>
              {/* 基本資訊分頁不顯示標題 — 因為是首次看到的畫面，不需要額外說明
                  （其他分頁需要知道目前正在查看什麼，因此保留標題） */}
              <dl className="spec">
                {eff.specs.map(s => (
                  <React.Fragment key={s.label}><dt>{s.label}</dt><dd>{s.value}</dd></React.Fragment>
                ))}
                {eff.colors.length > 0 && (
                  <>
                    <dt>主題色</dt>
                    <dd>
                      <span style={{ display: 'inline-flex', gap: 7, alignItems: 'center' }}>
                        {/* 顏色圓點排列 — hex 僅顯示懸停提示（v1.8） */}
                        {eff.colors.map(c => {
                          // 提示文字顯示：hex / 名稱+hex / 僅名稱（登錄時選擇）
                          const tip = eff.colorTipMode === 'label' ? (c.label || c.hex.toUpperCase())
                            : eff.colorTipMode === 'both' ? (c.label ? `${c.label} · ${c.hex.toUpperCase()}` : c.hex.toUpperCase())
                            : c.hex.toUpperCase();
                          return (
                            <span key={c.hex + c.label} className="sw-static" data-hex={tip}
                              style={{ background: c.hex, boxShadow: chipBorder(eff.colorBd) }} />
                          );
                        })}
                      </span>
                    </dd>
                  </>
                )}
              </dl>
              <div className="prose" dangerouslySetInnerHTML={{ __html: basicHtml }} />
            </>
          ) : (
            <>
              <h3 className="tab-tt">{curTab?.title}</h3>
              {curTab?.subtitle && <div className="sub">{curTab.subtitle}</div>}
              <div className="prose" dangerouslySetInnerHTML={{ __html: tabHtml }} />
            </>
          )}
        </div>
      </div>
      )}

      {/* 代表插圖右鍵選單（v2.0）— 調整詳細頁面中顯示的位置 */}
      {artCtx && createPortal(
        <div className="ctx-menu on" style={{ left: artCtx.x, top: artCtx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-ttl">代表插圖</div>
          <button onClick={() => { setArtCropOpen({ ref: artCtx.ref, ratio: artBoxRatio() }); setArtCtx(null); }}>
            調整圖片位置
          </button>
          {(eff?.artCrop) && (
            <button onClick={() => { saveArtCrop(undefined); setArtCtx(null); }}>取消位置指定</button>
          )}
        </div>,
        document.body,
      )}
      {artCropOpen && (
        <ArtCropModal fileRef={artCropOpen.ref} ratio={artCropOpen.ratio} crop={eff?.artCrop}
          onClose={() => setArtCropOpen(null)}
          onApply={c => { saveArtCrop(c); setArtCropOpen(null); }} />
      )}
    </section>
  );
}

/** 詳細插圖位置編輯器（v2.0）— 必須以實際顯示區域的比例開啟，才能調整到與畫面看到的一樣。
 *  此區域會隨畫面高度改變，因此使用固定比例（例如 3:4）會導致編輯器與實際結果不一致。 */
function ArtCropModal({ fileRef, ratio, crop, onClose, onApply }: {
  fileRef: string; ratio: number; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const url = useBlobUrl(fileRef);
  if (!url) return null;
  return (
    <CropEditor open src={url} aspect={ratio} aspectLabel="與詳細頁面相同的比例"
      initial={crop} onClose={onClose} onApply={onApply} />
  );
}

export default function CharDetailPage() {
  // useSearchParams 需要 Suspense 邊界（Next App Router）
  return <Suspense fallback={<section className="page" />}><CharDetailInner /></Suspense>;
}