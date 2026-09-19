'use client';
// 自設關係詳細頁面 (4.5) — 2人：標頭模糊 + 大型標題 + 左右卡片 + 中央插圖（全身／插圖切換）+ AU
// 下方：TIMELINE / QUESTIONS 分頁 (v1.8) + 角色扮演・日誌連結列表 · 多人（3人+）：成員列表形式
// 管理員：新增成員（我的／對方角色）· 新增時間軸項目 · 新增問題
import React, { useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/ThemeProvider';
import { useLocalList, newId } from '@/lib/postStore';
import {
  Relation, REL_SEED, Character, CHAR_SEED, RelMember, QaEntry, QaAnswer, TlItem, findChar, Visibility, CharGrant,
  auMember, auStyle, fullShadow, hasRelGrant,
  RelAu, RelCpTag, charWithAu, charGrant,
  QaAnswerRow, QA_KEY, QA_SEED, MergedAnswer, answersFor,
  findByKey, charPath,
} from '@/lib/charStore';
import { RelQuestionSet, RELQ_SEED, RELQ_KEY, CP_LABEL } from '@/lib/relqStore';
import { putBlob } from '@/lib/blobStore';
import { GrantsEditor } from '@/components/chars/GrantsEditor';
import { TrpgLog, TRPG_SEED } from '@/lib/galleryStore';
import { RpRoom, RP_SEED } from '@/lib/rpStore';
import { useFonts } from '@/lib/fontStore';
import { Tip, KInput, KTextarea, KSelect, KRadio, KCheck } from '@/components/ui/Kit';
import { Modal, ConfirmModal, useConfirmDelete } from '@/components/ui/Modal';
import { ColorField } from '@/components/ui/ColorField';
import { withAlpha } from '@/lib/color';
import { DragList } from '@/components/ui/DragList';
import { BlobImg, useBlobUrl } from '@/lib/blobStore';
import { CroppedBlobImg, CropEditor, type CropValue } from '@/components/ui/CropEditor';
import { Lightbox } from '@/components/ui/Lightbox';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

/** 全身圖片 — 保持比例、底部對齊，尺寸 % 在自設關係修改預覽中指定 (v1.9) */
// 全身圖片陰影遵循「直接指定圖片陰影」的顏色・強度（v2.0 使用者要求）— 與自設關係名稱陰影使用相同設定
function FullImg({ refId, scale, offX = 0, offY = 0, shadow }: { refId: string; scale: number; offX?: number; offY?: number; shadow?: string }) {
  const url = useBlobUrl(refId);
  if (!url) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" draggable={false} style={{
      position: 'absolute', bottom: `${offY}%`, left: `calc(50% + ${offX}%)`, transform: 'translateX(-50%)',
      height: `${scale}%`, maxWidth: 'none',
      filter: shadow,
    }} />
  );
}

/** 臉部區域（1:1）裁切編輯器 — 將檔案參照轉換為網址後傳給 CropEditor (v2.0) */
function FaceCropModal({ fileRef, crop, onClose, onApply }: {
  fileRef: string; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const url = useBlobUrl(fileRef);
  if (!url) return null;
  return <CropEditor open src={url} aspect="1:1" initial={crop} onClose={onClose} onApply={onApply} />;
}

/** 角色代表圖片 — 如果已登錄則使用實際圖片，只有沒有圖片時才使用原本的佔位圖片 */
function CharFace({ c, className, style }: {
  c?: Character; className?: string; style?: React.CSSProperties;
}) {
  const rep = c?.thumbId ?? c?.arts?.[0];
  if (!rep) return <div className={`${className ?? ''} ph ${c?.thumbClass ?? ''}`} style={style} />;
  return (
    <div className={className} style={{ position: 'relative', overflow: 'hidden', ...style }}>
      <CroppedBlobImg fileRef={rep} crop={c?.thumbCrop} />
    </div>
  );
}

/** hex → "r,g,b"（對話框 --cc 用） */
function rgbTriple(hex: string): string {
  const m = hex.replace('#', '');
  const f = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  return `${parseInt(f.slice(0, 2), 16)},${parseInt(f.slice(2, 4), 16)},${parseInt(f.slice(4, 6), 16)}`;
}

/** 要附加在個人資料上的備註 — 只有在需要顯示「已連結會員 ○○」之類資訊時才使用。
 * 以前登錄對方角色時會寫成「對方角色」，但角色位於對方角色位置本來就是對方角色，
 * 沒有特別寫明的必要，因此移除了（v2.0 使用者要求 — 已儲存的資料也不再顯示） */
/** 中央插圖位置編輯器 (v2.0) — 必須以與實際顯示區域相同的比例開啟，才能調整到與畫面顯示一致 */
function RelArtCropModal({ fileRef, ratio, crop, onClose, onApply }: {
  fileRef: string; ratio: number; crop?: CropValue; onClose: () => void; onApply: (c: CropValue) => void;
}) {
  const url = useBlobUrl(fileRef);
  if (!url) return null;
  return (
    <CropEditor open src={url} aspect={ratio} aspectLabel="與詳細畫面相同的比例"
      initial={crop} onClose={onClose} onApply={onApply} />
  );
}

const noteOf = (m: RelMember) => (m.linkedNote === '상대 캐릭터' ? '' : m.linkedNote ?? '');

function MiniProf({ member, char, isAdmin, onGo, onRemove, auUnregistered, side, onMoveSide, onFaceCrop }: {
  member: RelMember; char?: Character; isAdmin: boolean; onGo: () => void; onRemove: () => void;
  auUnregistered?: boolean;   // 正在選擇 AU，但這個角色尚未登錄 AU 個人資料 (v1.9)
  side?: 'l' | 'r';           // 在雙人關係中目前位於哪個位置（用於左右移動選單，v2.0）
  onMoveSide?: () => void;
  onFaceCrop?: (ref: string) => void;   // 重新調整臉部區域（1:1）裁切 (v2.0)
}) {
  const { familyOf } = useFonts();   // 名稱使用角色個人資料中指定的字體
  const [lb, setLb] = useState<number | null>(null);
  // 移除成員使用右鍵選單 — 如果一直顯示在卡片下方，會讓非資訊內容佔據版面（使用者確認）
  const [ctx, setCtx] = useState<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [ctx]);
  // 代表圖片 = 個人資料照片 · 其餘插圖 = 下方縮圖列（沒有時不建立該列）
  const arts = char?.arts ?? [];
  const rep = char?.thumbId ?? arts[0];
  const rest = arts.filter(a => a !== rep);
  const gallery = (rep ? [rep, ...rest] : rest).filter(Boolean);
  if (!char) return null;
  if (auUnregistered) {
    return (
      <div className="panel mini-prof" onClick={onGo} style={{ cursor: 'var(--cur-pointer,pointer)', textAlign: 'center', padding: '44px 20px' }}>
        <b style={{ fontSize: 15, letterSpacing: '.08em', fontFamily: familyOf(char.fontId) }}>{char.name}</b>
        <p className="hint" style={{ marginTop: 10 }}>這個 AU 的個人資料尚未登錄<br />點擊卡片後可以在角色頁面進行登錄</p>
      </div>
    );
  }
  return (
    <div className="panel mini-prof" onClick={onGo} style={{ cursor: 'var(--cur-pointer,pointer)' }}
      onContextMenu={e => { if (!isAdmin) return; e.preventDefault(); setCtx({ x: e.clientX, y: e.clientY }); }}>
      <div className="hd">
        {rep ? (
          <div className="face" data-tip="點擊查看原始圖片"
            style={{ position: 'relative', overflow: 'hidden', cursor: 'zoom-in' }}
            onClick={e => { e.stopPropagation(); setLb(0); }}>
            {/* 臉部區域為 1:1 — 直接使用角色的 3:4 縮圖裁切會產生偏移，因此
                如果自設關係有另外設定，就使用自設關係自己的裁切值（右鍵 > 調整縮圖位置） */}
            <CroppedBlobImg fileRef={rep} crop={member.faceCrop ?? char.thumbCrop} />
          </div>
        ) : (
          <div className={`face ph ${char.thumbClass}`} />
        )}
        <div>
          {/* 名稱字體直接使用角色個人資料指定的字體，
              尺寸則使用此自設關係所設定的值（自設關係修改中的「名稱尺寸」— 預設 17px，v2.0） */}
          <b style={{
            fontFamily: familyOf(char.fontId), fontSize: member.nameSize ?? undefined,
            // 可以關閉粗體（v2.0 使用者要求）— 預設與目前一樣使用粗體（<b>）
            fontWeight: (member.nameBold ?? true) ? undefined : 400,
          }}>
            {char.name}
          </b>
          <small>{[char.sub, noteOf(member)].filter(Boolean).join(' · ')}</small>
        </div>
      </div>
      <div className="specs">
        {char.specs.map(s => <div key={s.label}><b>{s.label}</b> {s.value}</div>)}
      </div>
      {/* 直接讀取角色目前的顏色調色盤（v2.0 使用者發現）。
          以前新增成員時會顯示儲存在 member.palette 的快照，因此即使在角色端刪除或新增顏色，
          自設關係頁面仍會停留在當時的狀態（「刪掉了卻沒有消失」、「新增了也沒有出現」的原因）。
          舊有資料只有在角色完全沒有顏色時才使用 fallback */}
      <div className="palette-row" data-tip="角色主題色調色盤">
        {/* 使用 `??`（nullish）判斷 — 空陣列代表「已將顏色全部刪除」，因此必須保持空白。
            如果用 length 判斷，全部刪除後舊快照就會重新出現（v2.0 使用者再次回報） */}
        {/* 色點邊框 — 角色的 colorBd 設定也套用到這裡（v2.0 使用者要求：如果顏色與卡片背景
            無法區分，自設關係詳細頁面也需要邊框）。因為菱形（clip-path）會裁掉 box-shadow，
            所以先以邊框色鋪出外層菱形，再在內層菱形放上顏色 */}
        {(char.colors ?? member.palette).map(p => {
          const bd = char.colorBd === 'none' ? null : (char.colorBd ?? 'rgba(0,0,0,.14)');
          return (
            <Tip key={p.hex + p.label} tip={p.label}>
              <span className="gem" style={{ background: bd ?? p.hex }}>
                {bd && <i style={{ background: p.hex }} />}
              </span>
            </Tip>
          );
        })}
      </div>
      <div className="kw-row">
        {member.keywords.map(k => <span key={k} className="pill">{k}</span>)}
      </div>
      {member.desc && <div className="rel-desc">{member.desc}</div>}
      {/* 移除代表圖片後的其他插圖 — 沒有時不建立該列（避免空白佔據位置） */}
      {rest.length > 0 && (
        <div className="card-thumbs">
          {rest.map((r, i) => (
            <div key={r} className="t" data-tip="點擊查看原始圖片"
              style={{ position: 'relative', overflow: 'hidden', cursor: 'zoom-in' }}
              onClick={e => { e.stopPropagation(); setLb((rep ? 1 : 0) + i); }}>
              <BlobImg fileRef={r} ph="" label="" />
            </div>
          ))}
        </div>
      )}
      {lb !== null && <Lightbox srcs={gallery} index={lb} onClose={() => setLb(null)} />}

      {/* 右鍵選單 — 僅限管理員（移除成員） */}
      {ctx && createPortal(
        <div className="ctx-menu on" style={{ left: ctx.x, top: ctx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-ttl">{char.name}</div>
          {onFaceCrop && rep && (
            <button onClick={() => { setCtx(null); onFaceCrop(rep); }}>調整縮圖位置</button>
          )}
          {onMoveSide && (
            <button onClick={() => { setCtx(null); onMoveSide(); }}>
              {side === 'r' ? '移到左側' : '移到右側'}
            </button>
          )}
          <button className="danger" onClick={() => { setCtx(null); onRemove(); }}>移除成員</button>
        </div>,
        document.body,
      )}
    </div>
  );
}

/** 雙人關係成員為空時的佔位卡片 */
function EmptyCard({ isAdmin, onAdd }: { isAdmin: boolean; onAdd: () => void }) {
  return (
    <div className="panel mini-prof" style={{
      display: 'grid', placeItems: 'center', minHeight: 320,
      border: '2px dashed var(--line)', background: 'rgba(252,252,253,.6)', cursor: isAdmin ? 'pointer' : undefined,
    }} onClick={() => { if (isAdmin) onAdd(); }}>
      <div style={{ textAlign: 'center', color: 'var(--faint)', fontSize: 12.5, padding: 20 }}>
        {isAdmin ? <><b style={{ fontSize: 20, display: 'block', marginBottom: 6 }}>＋</b>新增成員<br /><small>我的角色或對方角色</small></> : '成員未指定'}
      </div>
    </div>
  );
}

export default function RelDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const { familyOf } = useFonts();
  const [rels, setRels, loaded] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars, setChars, charsLoaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [logs] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  const [rooms] = useLocalList<RpRoom>('ohome.rp.v1', RP_SEED);
  const [tab, setTab] = useState<'tl' | 'qa'>('tl');
  const [auId, setAuId] = useState('base');
  const [oneMode, setOneMode] = useState<boolean | null>(null);
  const [qaNo, setQaNo] = useState<number | null>(null);
  const [qaQuery, setQaQuery] = useState('');
  const [qaText, setQaText] = useState('');
  // 回答編輯・擁有者補充說明 Modal (v1.9) — Hook 必須放在 early return 前
  const [ansEdit, setAnsEdit] = useState<{ qNo: number; idx: number; text: string; note: string } | null>(null);
  // 問題的擁有者說明輸入 Modal (v2.0)
  const [qNote, setQNote] = useState<{ no: number; text: string } | null>(null);
  // 成員臉部區域（1:1）裁切編輯 (v2.0)
  const [faceEdit, setFaceEdit] = useState<{ charId: string; ref: string; crop?: CropValue } | null>(null);
  // 時間軸項目右鍵選單 (v2.0 使用者要求) — 修改・刪除。不再一直顯示 [刪除] 文字
  const [tlCtx, setTlCtx] = useState<{ x: number; y: number; idx: number } | null>(null);
  const [tlEditIdx, setTlEditIdx] = useState<number | null>(null);   // null 表示新增
  useEffect(() => {
    if (!tlCtx) return;
    const close = () => setTlCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setTlCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [tlCtx]);
  // 問題右鍵選單 (v2.0 使用者要求) — 不直接還原，而是經過選單後再進入確認 Modal
  const [qaCtx, setQaCtx] = useState<{ x: number; y: number; no: number } | null>(null);
  useEffect(() => {
    if (!qaCtx) return;
    const close = () => setQaCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setQaCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [qaCtx]);
  // 回答右鍵選單 (v2.0) — 修改・補充・刪除
  const [ansCtx, setAnsCtx] = useState<{ x: number; y: number; idx: number } | null>(null);
  useEffect(() => {
    if (!ansCtx) return;
    const close = () => setAnsCtx(null);
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setAnsCtx(null); };
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', key);
    };
  }, [ansCtx]);
  const [qaChar, setQaChar] = useState<string | null>(null);
  // 多人關係 — 輸入角色下拉選單 (v1.9)：使用 body Portal（fixed）顯示在上方 — 避免被 qa-today 捲動區域裁切
  const [qaPickPos, setQaPickPos] = useState<{ left: number; top: number } | null>(null);
  // 管理員新增 Modal
  const [memberOpen, setMemberOpen] = useState(false);
  const [mMode, setMMode] = useState<'exist' | 'new'>('exist');
  const [mCharId, setMCharId] = useState('');
  const [mQuery, setMQuery] = useState('');   // 既有角色搜尋文字
  const [mQuote, setMQuote] = useState('');
  const [mName, setMName] = useState('');
  const [mSub, setMSub] = useState('');
  const [mColor, setMColor] = useState('#8a7f70');
  const [mGrants, setMGrants] = useState<CharGrant[]>([]); // 新對方角色的會員權限 (v1.9)
  const [tlOpen, setTlOpen] = useState(false);
  const [tEra, setTEra] = useState('');
  const [tDesc, setTDesc] = useState('');
  // 一句話採用乒乓形式，可以有多個（使用者要求）
  const [tSays, setTSays] = useState<{ id: string; charId: string; text: string }[]>([]);
  const [tlSort, setTlSort] = useState(false); // 時間軸排序模式（拖曳排序）
  const [artIdx, setArtIdx] = useState(0);
  /* 右鍵點擊中央插圖 → 調整詳細頁面顯示的位置 (v2.0 使用者要求)。
     原本只能調整列表縮圖座標，無法調整詳細頁面 — 多張圖片時就調整目前正在查看的圖片。
     顯示區域會依畫面高度變化，因此不是固定比例，而是以**實際容器比例**開啟。 */
  const [artCtx, setArtCtx] = useState<{ x: number; y: number; ref: string } | null>(null);
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
  const [qOpen, setQOpen] = useState(false);
  const [qText, setQText] = useState('');
  const [auOpen, setAuOpen] = useState(false);
  const [auLabel, setAuLabel] = useState('');
  const [auCatch, setAuCatch] = useState('');
  const [auCp, setAuCp] = useState<RelCpTag>('cp');       // 新 AU 的 CP/NCP (v1.9)
  const [qsets] = useLocalList<RelQuestionSet>(RELQ_KEY, RELQ_SEED); // 自設關係問題組（環境設定）
  // 問答回答與自設關係分開儲存 (v2.0) — 如果放在自設關係裡，回答時必須 UPDATE 自設關係，
  // 因此一般會員無法對管理員建立的自設關係回答（與留言相同的根本原因）
  const [qaRows, setQaRows] = useLocalList<QaAnswerRow>(QA_KEY, QA_SEED);
  const [qsetOpen, setQsetOpen] = useState(false);        // 新增 QUESTIONS 區段 — 選擇問題列表的 Modal
  const [delAsk, setDelAsk] = useState(false);   // 刪除自設關係確認
  const [auDelAsk, setAuDelAsk] = useState<string | null>(null);  // AU 刪除確認 (v2.0 — 與自設關係刪除分開)
  const del = useConfirmDelete();                // 成員・時間軸等個別刪除確認

  // 也可以透過別名網址開啟 (v2.0 使用者要求 — 即使之後修改網址，舊網址仍然有效)
  const rel = findByKey(rels, id);

  // 自設關係頁面的主題 (4.18 方式) — 如果有獨立主題色，暫時切換整個首頁的調色盤，離開後恢復原狀。
  // AU 個別主題 (v1.9)：如果 AU 有指定主題就使用該主題，沒有指定則跟隨 base（原始資料）主題
  const { setPageTheme, setPageBg } = useTheme();
  const themeAu = rel?.aus.find(a => a.id === auId);
  const auTheme = themeAu && themeAu.id !== 'base' ? themeAu.theme : undefined;
  const effThemeMode = auTheme?.mode ?? rel?.themeMode;
  const effThemeColor = auTheme ? auTheme.color : rel?.themeColor;
  const pageColor = effThemeMode === 'custom' && effThemeColor ? effThemeColor : null;
  const pageTone = auTheme ? auTheme.tone : rel?.themeTone;
  useEffect(() => {
    setPageTheme(pageColor, pageTone);
    return () => setPageTheme(null);
  }, [pageColor, pageTone, setPageTheme]);

  // 自設關係頁面背景 (v2.0 使用者要求) — 只在此頁面期間套用，離開後恢復原本背景
  // 顏色・背景可以由每個 AU 分別設定 (v2.0 使用者要求) — 沒有設定時使用自設關係預設值
  const themeAuStyle = rel ? auStyle(rel, rel.aus.find(a => a.id === auId)) : undefined;
  const bgG1 = themeAuStyle?.pageBgG1;
  const bgG2 = themeAuStyle?.pageBgG2;
  const bgAngle = themeAuStyle?.pageBgAngle;
  useEffect(() => {
    if (!bgG1 && !bgG2) return;
    setPageBg({ g1: bgG1 ?? '#2b3038', g2: bgG2 ?? '#121418', angle: bgAngle ?? 180 });
    return () => setPageBg(null);
  }, [bgG1, bgG2, bgAngle, setPageBg]);

  // 自動清理指向已刪除角色的成員 — 避免留下既不顯示卡片、也不顯示［＋新增成員］的幽靈位置
  // （因應角色刪除功能加入而進行的一致性修正）
  useEffect(() => {
    if (!loaded || !charsLoaded || !rel) return;
    const alive = rel.members.filter(m => chars.some(c => c.id === m.charId));
    if (alive.length !== rel.members.length) {
      setRels(rels.map(r => (r.id === rel.id ? { ...r, members: alive } : r)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, charsLoaded, rel?.id, rel?.members.length, chars.length]);

  const isDuo = rel ? (rel.kind ? rel.kind === 'pair' : rel.members.length === 2) : false;
  const au = rel?.aus.find(a => a.id === auId) ?? rel?.aus[0];
  // AU 個別個人資料 (v1.9) — base（原始資料）使用 Relation 最上層，其餘 AU 儲存在 aus 項目中
  const isBaseAu = (au?.id ?? 'base') === 'base';
  const auArts = (isBaseAu ? rel?.arts : au?.arts) ?? [];
  // AU 個別名稱／本文字體・全身正反面 (v2.0 使用者回報 — 之前無法分開) — 未指定則使用自設關係預設值
  const auFont = (isBaseAu ? undefined : au?.fontId) ?? rel?.fontId;
  const auBodyFont = (isBaseAu ? undefined : au?.bodyFontId) ?? rel?.bodyFontId;
  const auFullFront = (isBaseAu ? undefined : au?.fullFront) ?? rel?.fullFront;
  const auTimeline = (isBaseAu ? rel?.timeline : au?.timeline) ?? [];
  const auQuestions = (isBaseAu ? rel?.questions : au?.questions) ?? [];
  const curArt = auArts[Math.min(artIdx, Math.max(0, auArts.length - 1))];
  /** 只儲存這張圖片的位置 — 以參照值作為 key，因此其他圖片・AU 都維持原樣 (v2.0) */
  const saveArtCrop = (ref: string, c: CropValue | undefined) => updateRel({
    artCrops: (() => {
      const next = { ...(rel!.artCrops ?? {}) };
      if (c) next[ref] = c; else delete next[ref];
      return next;
    })(),
  });
  const auQaPool = (isBaseAu ? rel?.qaPool : au?.qaPool) ?? [];   // 待處理問題池 (v1.9)
  const auCpTag: RelCpTag | undefined = au?.cp ?? rel?.cp;
  const qaOn = (isBaseAu ? rel?.qaEnabled : au?.qaEnabled) ?? auQuestions.length > 0;
  const curQa: QaEntry | undefined = auQuestions.find(q => q.no === (qaNo ?? auQuestions[0]?.no));
  /** 單一問題的回答 — 舊自設關係中的內容 + 分開儲存的內容 (v2.0)。畫面・編輯・刪除使用此列表的順序 */
  const answersOf = (no: number): MergedAnswer[] =>
    answersFor(qaRows, rel?.id ?? '', au?.id ?? 'base', no, auQuestions.find(q => q.no === no)?.answers ?? []);
  const curAnswers = curQa ? answersOf(curQa.no) : [];
  /* 隱藏回答內容 (v2.0 使用者要求) — 問題本身保持顯示，只隱藏對話框內的內容。
     這只是畫面上的隱藏，並非完全阻擋，這一點已經寫在設定畫面中。
     管理員與回答的本人永遠可以看到 — 如果看不到自己寫的內容，也就無法修改。 */
  /* 是否整個隱藏回答區域 (v2.0 使用者確認) — 如果逐個隱藏對話框，會直接暴露有幾個人以及回答順序。
     因此改成只顯示「私密回答」一行。
     **管理員與取得此自設關係角色權限的會員都可以查看** — 能夠回答的人本身就是有權限者，因此不會發生看不到自己回答的情況。 */
  const qaHidden = !!rel?.qaHide && !isAdmin && !hasRelGrant(rel.members, chars, user?.id);

  /* 有新回答時自動往下顯示最新內容 (v2.0 使用者要求 — 與角色扮演聊天室相同的行為)。
     但如果使用者向上閱讀舊回答，就不要強制拉回底部 — 被搶走閱讀位置會很困擾。
     只有接近底部時才跟著往下移動；切換問題時則一定從最下方（最新內容）開始。 */
  const ansRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const onAnsScroll = () => {
    const el = ansRef.current;
    if (el) stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
  };
  useEffect(() => {
    const el = ansRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;   // 切換問題或開啟分頁時從最新回答開始
    stickRef.current = true;
  }, [curQa?.no, tab]);
  useEffect(() => {
    const el = ansRef.current;
    if (el && stickRef.current) el.scrollTop = el.scrollHeight;
  }, [curAnswers.length]);
  // 如果完全沒有登錄全身圖片，就不提供全身模式 —
  // 不在空位置放置「○○ 全身」佔位符，而是只顯示代表插圖（使用者確認）
  const fullRefOf = (cid: string) =>
    (isBaseAu ? rel?.members.find(x => x.charId === cid)?.fullImgId : au?.fulls?.[cid]);
  const hasFull = !!rel?.members.some(m => fullRefOf(m.charId));
  const single = hasFull ? (oneMode ?? rel?.illustMode === 'one') : true;

  // 成員角色 — 選擇 AU 時，會合成該角色的 AU 個人資料（名稱・圖片等）來顯示 (v1.9)
  const auCharKey = rel && !isBaseAu && au ? `${rel.id}:${au.id}` : null;
  const charOf = (cid: string) => {
    const c = findChar(chars, cid);
    return c && auCharKey ? charWithAu(c, auCharKey) : c;
  };
  // 選擇 AU 時，該角色是否尚未登錄 AU 個人資料 + 角色頁面連結（保留 au） (v1.9)
  const auUnregOf = (cid: string) => !!auCharKey && !findChar(chars, cid)?.auProfiles?.[auCharKey];
  // 優先使用角色別名網址 (v2.0) — 沒有時直接使用 id
  const charHref = (cid: string) => {
    const base = charPath(charOf(cid) ?? { id: cid });
    return auCharKey ? `${base}?au=${encodeURIComponent(auCharKey)}` : base;
  };
  const sideOf = (cid: string) => (isDuo && rel?.members[1]?.charId === cid ? 'r' : 'l');

  // 切換 AU 後，如果該 AU 沒有 QUESTIONS 區段，就切回時間軸分頁 (v1.9)
  useEffect(() => { if (!qaOn && tab === 'qa') setTab('tl'); }, [qaOn, tab]);

  const qaFiltered = useMemo(
    () => auQuestions.filter(q => !qaQuery || q.q.includes(qaQuery) || String(q.no).includes(qaQuery)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rel, auId, qaQuery],
  );
  const relLogs = useMemo(() => logs.filter(l => l.relId === rel?.id), [logs, rel]);
  // 角色扮演連結 (4.9) — 我參與的房間 + 已公開的已完成房間（未參與的房間完全不顯示）
  const relRooms = useMemo(() => rooms.filter(rm => rm.relId === rel?.id
    && ((user && rm.memberIds.includes(user.id)) || (rm.status === 'done' && rm.isPublic))),
    [rooms, rel, user]);

  if (!loaded) return <section className="page" />;
  if (!rel || (rel.visibility === 'private' && !isAdmin) || (rel.visibility === 'member' && !user)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>RELATIONS</PageTitle><p>找不到自設關係或沒有查看權限</p></div>
      </section>
    );
  }

  const updateRel = (patch: Partial<Relation>) =>
    setRels(rels.map(r => (r.id === rel.id ? { ...r, ...patch } : r)));
  // 更新 AU 個別個人資料 (v1.9) — base 使用最上層欄位，其餘 AU 使用 aus 項目
  const patchAuData = (p: { arts?: string[]; timeline?: TlItem[]; questions?: QaEntry[]; qaEnabled?: boolean; qaPool?: string[] }) => {
    if (isBaseAu) updateRel(p);
    else updateRel({ aus: rel.aus.map(a => (a.id === au!.id ? { ...a, ...p } : a)) });
  };

  /* ---------- 新增成員（我的角色或新的對方角色） ---------- */
  const candidates = chars.filter(c => !rel.members.some(m => m.charId === c.id));
  const addMember = () => {
    let cid = mCharId;
    if (mMode === 'new') {
      if (!mName.trim()) { toast('請輸入對方角色名稱'); return; }
      // 簡單登錄對方角色（own:false — 不會顯示在我的角色列表中，4.4）
      const nc: Character = {
        id: newId(), name: mName.trim(), sub: mSub.trim(), color: mColor,
        // 輸入的顏色只作為代表主題色（color）使用 — 以前也會自動以「主題色」的名稱
        // 登錄到調色盤（colors），因此輸入的重點顏色會莫名出現在調色盤中
        // (v2.0 使用者要求)。調色盤需在角色修改頁面中手動新增
        colors: [], specs: [], tabs: [],
        basicHtml: '', visibility: 'public', thumbClass: '', own: false,
        grants: mGrants.length ? mGrants : undefined, // 會員權限 — 角色扮演遊玩／編輯 (v1.9)
      };
      setChars([...chars, nc]);
      cid = nc.id;
    }
    if (!cid) { toast('請選擇要新增的角色'); return; }
    const ch = chars.find(c => c.id === cid);
    updateRel({
      members: [...rel.members, {
        charId: cid, quote: mQuote.trim(), keywords: [], desc: '',
        // 調色盤直接讀取角色端的設定 — 如果在這裡複製，之後修改角色顏色時自設關係頁面就不會跟著更新。
        // 同時也移除了以前會自動以「主題色」名稱登錄到調色盤的行為（v2.0 使用者要求 — 重點顏色被誤加成主題色）
        palette: [],
        // linkedNote 只有在需要顯示「已連結會員 ○○」之類資訊時使用 — 原本寫「對方角色」的行為已移除 (v2.0)
      }],
    });
    setMemberOpen(false);
    setMCharId(''); setMQuery(''); setMQuote(''); setMName(''); setMSub('');
    toast('成員已新增');
  };

  /* ---------- 新增・修改時間軸項目（說明／一句話至少填寫一項 — 4.5） ---------- */
  const closeTl = () => { setTlOpen(false); setTlEditIdx(null); setTEra(''); setTDesc(''); setTSays([]); };
  const addTlItem = () => {
    const says = tSays.filter(x => x.charId && x.text.trim()).map(({ charId, text }) => ({ charId, text: text.trim() }));
    if (!tDesc.trim() && says.length === 0) { toast('請至少輸入說明或一句話其中一項'); return; }
    const item: TlItem = {
      era: tEra.trim() || undefined,
      desc: tDesc.trim() || undefined,
      says,
    };
    const editing = tlEditIdx;
    patchAuData({
      timeline: editing == null
        ? [...auTimeline, item]
        : auTimeline.map((x, i) => (i === editing ? item : x)),
    });
    closeTl();
    toast(editing == null ? '時間軸項目已新增' : '時間軸項目已修改');
  };

  /* 右鍵 > 修改 — 將該項目原樣放到新增視窗中 */
const openTlEdit = (i: number) => {
  const it = auTimeline[i];
  if (!it) return;
  setTEra(it.era ?? '');
  setTDesc(it.desc ?? '');
  setTSays(it.says.map(sy => ({ id: newId(), charId: sy.charId, text: sy.text })));
  setTlEditIdx(i);
  setTlOpen(true);
};

/* ---------- 新增問題（目前 AU） ---------- */
const addQuestion = () => {
  if (!qText.trim()) { toast('請輸入問題'); return; }
  const no = Math.max(0, ...auQuestions.map(q => q.no)) + 1;
  const entry: QaEntry = { no, q: qText.trim(), date: new Date().toISOString().slice(0, 10), answers: [] };
  patchAuData({ questions: [entry, ...auQuestions], qaEnabled: true });
  setQOpen(false); setQText(''); setQaNo(no); setTab('qa');
  toast('問題已登錄');
};

/* ---------- QUESTIONS 問題列表（v1.9 使用者確認 — 排隊模式） ----------
   加入列表後，不是立即讓全部問題出題，而是放入這個自設關係（AU）的隱藏等待池。
   已經出題或已在池中的問題會搜尋後排除（防止重複）。出題一次只會有一個 —
   完成目前問題後，會從池中隨機出現下一個問題。 */
const addQuestionSet = (set: RelQuestionSet | null) => {
  if (!set) {
    patchAuData({ qaEnabled: true });
    setQsetOpen(false); setTab('qa'); setQaNo(null);
    toast('QUESTIONS 區段已新增');
    return;
  }
  const seen = new Set([...auQuestions.map(q => q.q), ...auQaPool]);
  const fresh = set.questions.filter(q => !seen.has(q));
  const skipped = set.questions.length - fresh.length;
  // 加入列表後只放入等待池 — 只有按下［取得問題］時才會出題（v2.0 使用者要求）。
  // 以前如果沒有正在出題的問題，這裡會直接抽出一題
  patchAuData({ qaPool: [...auQaPool, ...fresh], questions: auQuestions, qaEnabled: true });
  setQsetOpen(false); setTab('qa'); setQaNo(null);
  toast(fresh.length
    ? `「${set.name}」中的新問題 ${fresh.length} 個已加入等待列表${skipped ? `（排除重複 ${skipped} 個）` : ''} — 使用［取得問題］來出題`
    : `「${set.name}」中的問題全部都已經加入`);
};

/* 完成目前問題 → 從等待池隨機出現下一個問題（v1.9） */
const drawNextQuestion = () => {
  if (auQaPool.length === 0) { toast('沒有等待中的問題 — 請新增問題列表'); return; }
  const i = Math.floor(Math.random() * auQaPool.length);
  const q = auQaPool[i];
  const no = Math.max(0, ...auQuestions.map(x => x.no)) + 1;
  patchAuData({
    qaPool: auQaPool.filter((_, j) => j !== i),
    questions: [{ no, q, date: new Date().toISOString().slice(0, 10), answers: [] }, ...auQuestions],
    qaEnabled: true,
  });
  setQaNo(no);
  toast('下一個問題已出題');
};

/* 刪除問題 — 將已出現的問題**放回等待列表**（v2.0 使用者要求）。
   與跳過不同：不是丟掉，而是回到池中，所以**之後仍可能再次出現**。
   也不會自動抽出下一個問題 — 意思是「現在先不要這個問題」，由使用者決定要選什麼。 */
const returnQuestion = (cur: QaEntry) => {
  const n = answersOf(cur.no).length;
  del.ask('要將這個問題放回列表嗎？', () => {
    const rest = auQuestions.filter(q => q.no !== cur.no);
    patchAuData({ questions: rest, qaPool: [...auQaPool, cur.q], qaEnabled: true });
    // 回答是附屬於問題的，因此一併整理（避免留下沒有主人的回答）
    setQaRows(qaRows.filter(r => !(r.relId === rel.id && r.auId === (au?.id ?? 'base') && r.no === cur.no)));
    setQaNo(rest[0]?.no ?? null);
    toast('問題已放回列表 — 之後仍可能再次出現');
  }, n > 0
    ? `已經存在的 ${n} 個回答也會一併消失。問題會回到等待列表，之後仍可能再次出現。`
    : '問題會回到等待列表，之後仍可能再次出現。',
  '放回');
};

/* 跳過問題（v2.0 使用者要求）— 將不喜歡的問題直接丟棄。
   不會放回等待池，因此之後不會再次出現。接著出下一個問題。 */
const skipQuestion = () => {
  const cur = curQa;
  if (!cur) return;
  del.ask('要跳過這個問題嗎？', () => {
    const rest = auQuestions.filter(q => q.no !== cur.no);
    let questions = rest;
    let qaPool = auQaPool;
    if (auQaPool.length > 0) {
      const i = Math.floor(Math.random() * auQaPool.length);
      const no = Math.max(0, cur.no, ...rest.map(x => x.no)) + 1;
      questions = [{ no, q: auQaPool[i], date: new Date().toISOString().slice(0, 10), answers: [] }, ...rest];
      qaPool = auQaPool.filter((_, j) => j !== i);
    }
    patchAuData({ questions, qaPool, qaEnabled: true });
    setQaRows(qaRows.filter(r => !(r.relId === rel.id && r.auId === (au?.id ?? 'base') && r.no === cur.no)));
    setQaNo(questions[0]?.no ?? null);
    toast(auQaPool.length > 0 ? '已跳過並出下一個問題' : '已跳過 — 目前沒有等待中的問題');
  }, answersOf(cur.no).length > 0
    ? `已經存在的 ${answersOf(cur.no).length} 個回答也會一併消失。跳過的問題之後不會再次出現。`
    : '跳過的問題之後不會再次出現。',
  '跳過');
};

// 是否可以用這個角色回答 — 管理員全部可以，會員只能使用被授予權限（play/edit）的角色（v1.9）
const canAnswerAs = (cid: string) => {
  if (isAdmin) return true;
  const c = findChar(chars, cid);
  return !!user && !!c && charGrant(c, user.id) !== null;
};
const answerableIds = rel.members.map(m => m.charId).filter(canAnswerAs);

const submitQa = () => {
  const text = qaText.trim();
  const cid = qaChar ?? answerableIds[0];
  if (!text || !cid || !curQa) return;
  if (!canAnswerAs(cid)) { toast('沒有使用這個角色回答的權限'); return; }
  // 不修改自設關係 — 只將回答儲存為自己的資料列（v2.0）
  setQaRows([...qaRows, {
    id: newId(), relId: rel.id, auId: au?.id ?? 'base', no: curQa.no,
    charId: cid, text, authorId: user?.id, date: new Date().toISOString(),
  }]);
  setQaText('');
};

/* ---------- 修改・刪除回答・擁有者補充說明（v1.9 使用者要求） ----------
   修改：回答者本人（舊版無紀錄回答則為管理員） · 刪除：本人＋管理員 · 補充說明（note）：僅限管理員 */
/* 儲存對問題的擁有者說明（v2.0）— 留空則刪除 */
const saveQNote = () => {
  if (!qNote) return;
  patchAuData({
    questions: auQuestions.map(q => (q.no === qNote.no ? { ...q, note: qNote.text.trim() || undefined } : q)),
  });
  setQNote(null);
  toast('問題說明已儲存');
};

const canEditAns = (a: QaAnswer) => (a.authorId ? a.authorId === user?.id : isAdmin);
const canDelAns = (a: QaAnswer) => isAdmin || (!!a.authorId && a.authorId === user?.id);
// 分離儲存資料列（rowId）與舊版自設關係內的回答（legacyIdx）都要處理（v2.0）
const saveAnsEdit = () => {
  if (!ansEdit) return;
  const target = answersOf(ansEdit.qNo)[ansEdit.idx];
  if (!target) { setAnsEdit(null); return; }
  const patch = { text: ansEdit.text.trim() || target.text, note: ansEdit.note.trim() || undefined };
  if (target.rowId) {
    setQaRows(qaRows.map(r => (r.id === target.rowId ? { ...r, ...patch } : r)));
  } else {
    patchAuData({
      questions: auQuestions.map(q => q.no === ansEdit.qNo
        ? { ...q, answers: q.answers.map((a, i) => (i === target.legacyIdx ? { ...a, ...patch } : a)) }
        : q),
    });
  }
  setAnsEdit(null);
};
const deleteAns = (qNo: number, idx: number) => {
  const target = answersOf(qNo)[idx];
  if (!target) return;
  del.ask('要刪除這個回答嗎？', () => {
    if (target.rowId) setQaRows(qaRows.filter(r => r.id !== target.rowId));
    else patchAuData({
      questions: auQuestions.map(q => q.no === qNo
        ? { ...q, answers: q.answers.filter((_, i) => i !== target.legacyIdx) }
        : q),
    });
  });
};

const removeMember = (cid: string) => {
  const c = charOf(cid);
  const name = c?.name ?? '成員';
  del.ask(`要移除成員「${name}」嗎？`,
    () => updateRel({
      members: rel.members.filter(m => m.charId !== cid),
      // 如果原本指定在右側的角色被移除，也一併解除指定
      pairRight: rel.pairRight === cid ? undefined : rel.pairRight,
    }),
    c?.own
      // 我的角色 — 只刪除登錄在這個自設關係中的資訊（使用者確認）
      ? '只刪除此自設關係中登錄的資訊（一句話・關鍵字・介紹・全身・顏色）。角色本身與其他自設關係的資訊都會保留。'
      : '只會從自設關係中移除，角色本身不會被刪除。');
};

/* Pair 左右位置配置（v2.0 使用者要求）— 以前登錄順序就是位置，因此即使第一個加入的角色
   從右側卡片新增，也一定會被放到左邊。現在透過 pairRight 指定要放在右側的角色。 */
// 一句話・台詞顏色・全身位置可能因 AU 而不同（v2.0）— 如果有設定 AU 值，就替換成該值
const asAu = (m: RelMember | null) => (m && !isBaseAu ? auMember(m, au) : m);
// 顏色・背景也會依 AU 分開設定（v2.0 使用者要求）— 如果 AU 沒有設定，就沿用自設關係預設值
const auSt = auStyle(rel, au);
const pairSlots: (RelMember | null)[] = isDuo
  ? (rel.pairRight
    ? [asAu(rel.members.find(m => m.charId !== rel.pairRight) ?? null),
      asAu(rel.members.find(m => m.charId === rel.pairRight) ?? null)]
    : [asAu(rel.members[0] ?? null), asAu(rel.members[1] ?? null)])
  : [];

/** 將此成員移到另一側（左 ↔ 右）。
 *  將右側移到左側時，要**指定另一側的角色到右側**（v2.0 使用者回報）—
 *  以前只會刪除指定，因此按照登錄順序原本就在右側的角色（通常是第二個加入的
 *  對方角色）即使刪除指定後仍然在右側，所以看起來什麼都沒發生。 */
const moveSide = (cid: string) => {
  const nowRight = pairSlots[1]?.charId === cid;
  const other = rel.members.find(m => m.charId !== cid)?.charId;
  updateRel({ pairRight: nowRight ? other : cid });
};

/** 重新調整臉部區塊（1:1）裁切 — 與角色的 3:4 縮圖分開，只儲存在這個自設關係中（v2.0） */
const saveFaceCrop = (cid: string, c: CropValue) => {
  /* 查看 AU 時，**只儲存在該 AU**（v2.0 使用者回報 — 原本在原始資料修改位置時 AU 也會一起變動）。
     顯示時 auMember 會優先使用 mset 值，因此沒有設定的 AU 仍會沿用原始資料 */
  if (!isBaseAu && au) {
    updateRel({
      aus: rel.aus.map(a => (a.id === au.id
        ? { ...a, mset: { ...a.mset, [cid]: { ...a.mset?.[cid], faceCrop: c } } }
        : a)),
    });
    return;
  }
  updateRel({ members: rel.members.map(m => (m.charId === cid ? { ...m, faceCrop: c } : m)) });
  setFaceEdit(null);
};

return (
  <section className="page page-rel-detail">
    {/* 標題圖片（v1.5）— 全寬模糊＋向下淡出。
        各 AU 完全分開（v1.9 使用者確認）：AU 只使用自己的標題圖片 — 不繼承 base 的圖片。
        沒有圖片時預設什麼都不繪製（v2.0）— 但如果在自設關係修改中直接指定了背景漸層
        （由 base 管理，與 AU 無關），則使用該背景漸層代替 */}
    {(() => {
      const hdrId = isBaseAu ? rel.headerImgId : (au?.headerImgId ?? undefined);
      const hdrCrop = isBaseAu ? rel.headerCrop : au?.headerCrop;
      if (hdrId) {
        return (
          <div className="rel-backdrop">
            <div className="img custom">
              <CroppedBlobImg fileRef={hdrId} crop={hdrCrop} ph="" />
            </div>
          </div>
        );
      }
      if (!auSt.headerBgG1 && !auSt.headerBgG2) return null;
      return (
        <div className="rel-backdrop">
          <div className="img custom" style={{
            background: `linear-gradient(${auSt.headerBgAngle ?? 180}deg, ${auSt.headerBgG1 ?? '#3a4150'}, ${auSt.headerBgG2 ?? '#1a1d22'})`,
          }} />
        </div>
      );
    })()}

    {(rel.aus.length > 1 || isAdmin) && (
      <div className="au-list">
        {/* 在 AU 方框中放入代表圖片（v2.0 使用者要求 — 原本只有顏色，看起來很單調）。
            原始資料使用自設關係縮圖（保留已設定的裁切），其他 AU 則使用該 AU 的第一張插圖 = 代表圖片。
            如果沒有登錄圖片，就像以前一樣顯示顏色佔位圖 */}
        {rel.aus.map((a, i) => {
          const isBase = a.id === 'base';
          const thumb = isBase ? (rel.thumbId ?? rel.arts?.[0]) : a.arts?.[0];
          return (
            <div key={a.id} className={`au-item ${auId === a.id ? 'on' : ''}`}
              onClick={() => { setAuId(a.id); setArtIdx(0); setQaNo(null); }}>
              <CroppedBlobImg fileRef={thumb} crop={isBase ? rel.thumbCrop : undefined}
                ph={['cool', 'pale', 'red'][i % 3]} />
              <small>{a.label}</small>
            </div>
          );
        })}
        {isAdmin && (
          <div className="au-item add" data-tip="新增／管理 AU" onClick={() => setAuOpen(true)}>＋</div>
        )}
      </div>
    )}

    {/* 管理員操作（左上） */}
    {isAdmin && (
      <div className="rel-admin-actions">
        {/* 選擇 AU 時，編輯該 AU 的插圖・標語（v1.9） */}
        <button className="btn btn-dark" style={{ height: 30, padding: '0 13px', fontSize: 11 }}
          onClick={() => router.push(`/rels/${rel.id}/edit${isBaseAu ? '' : `?au=${au!.id}`}`)}>
          {isBaseAu ? 'EDIT' : `EDIT ${au!.label}`}
        </button>
        {/* 查看 AU 時，刪除的也會是該 AU（v2.0 使用者發現 — 原本整個自設關係都被刪除了）。
            EDIT 會跟著 AU，但 DELETE 沒有跟著，因此在 AU 畫面按下後整個自設關係都被刪掉了。
            按鈕文字也直接寫明會刪除什麼 */}
        <button className="btn btn-dark" style={{ height: 30, padding: '0 13px', fontSize: 11 }}
          onClick={() => (isBaseAu ? setDelAsk(true) : setAuDelAsk(au!.id))}>
          {isBaseAu ? 'DELETE' : `DELETE ${au!.label}`}
        </button>
      </div>
    )}

    {/* 僅刪除一個 AU（v2.0 使用者發現）— 為了與刪除自設關係明確區分，也寫明會留下什麼 */}
    <ConfirmModal open={auDelAsk !== null}
      title={`要刪除 AU「${rel.aus.find(a => a.id === auDelAsk)?.label ?? ''}」嗎？`}
      body="此 AU 的插圖・時間軸・問答也會一併刪除，且無法復原。自設關係與其他 AU 都會保留。"
      onClose={() => setAuDelAsk(null)}
      buttons={[
        { label: 'DELETE', kind: 'accent', onClick: () => {
          const gone = auDelAsk!;
          updateRel({ aus: rel.aus.filter(a => a.id !== gone) });
          // 此 AU 所附的問答回答也一併刪除（避免留下沒有主人的資料列）
          setQaRows(qaRows.filter(r => !(r.relId === rel.id && r.auId === gone)));
          if (auId === gone) setAuId('base');
          setAuDelAsk(null);
        } },
        { label: 'CANCEL', kind: 'ghost', onClick: () => setAuDelAsk(null) },
      ]} />

    <ConfirmModal open={delAsk} title="要刪除自設關係嗎？"
      body={`「${rel.name}」整個自設關係都會被刪除 — 時間軸・問答・${rel.aus.length} 個 AU 都會一併消失，且無法復原。已連結的角色本身不會被刪除。`}
      onClose={() => setDelAsk(false)}
      buttons={[
        { label: 'DELETE', kind: 'accent', onClick: () => {
          setRels(rels.filter(r => r.id !== rel.id));
          // 自設關係附帶的問答回答也一併刪除（v2.0 — 因為是分開儲存，留下來會變成沒有主人的資料）
          setQaRows(qaRows.filter(r => r.relId !== rel.id));
          router.push('/rels');
        } },
        { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
      ]} />

    <div className="rel-hero">
      {isDuo && pairSlots[0] && (
        <div className="quote l" style={{
          color: pairSlots[0].quoteColor,
          ['--q-mark' as string]: pairSlots[0].quoteMarkColor,
        } as React.CSSProperties}>{pairSlots[0].quote}</div>
      )}
      {/* CP/NCP 標籤 — 自設關係名稱上方中央（v2.0 使用者要求）・顏色在自設關係修改中設定 */}
      {auCpTag && (
        <div className="cp-top">
          <span className="pill" style={auSt.cpTagBg || auSt.cpTagFg
            ? { background: auSt.cpTagBg, color: auSt.cpTagFg, borderColor: auSt.cpTagBg }
            : undefined}>{CP_LABEL[auCpTag]}</span>
        </div>
      )}
      {/* 自設關係名稱・標語文字顏色 — 直接指定時（v1.9 使用者要求，未指定：主題） */}
      {/* 名稱陰影 — 直接指定顏色・強度（v2.0 使用者要求，未指定：黑色 60%・與原本相同） */}
      {/* 名稱本身可以依 AU 設定不同內容（v2.0 使用者要求）— 未設定時使用自設關係名稱 */}
      <h1 style={{
        fontFamily: familyOf(auFont), color: auSt.nameColor,
        textShadow: `0 4px 30px ${withAlpha(auSt.nameShadowColor ?? '#000000', 0.6 * ((auSt.nameShadow ?? 100) / 100))}`,
      }}>{(!isBaseAu && au?.name?.trim()) || rel.name}</h1>
      <div className="catch" style={{ color: auSt.cpColor }}>
        {au?.catchphrase || rel.catchphrase}
      </div>
      {isDuo && pairSlots[1] && (
        <div className="quote r" style={{
          color: pairSlots[1].quoteColor,
          ['--q-mark' as string]: pairSlots[1].quoteMarkColor,
        } as React.CSSProperties}>{pairSlots[1].quote}</div>
      )}
    </div>

    {isDuo ? (
      <div className="rel-body" style={{ fontFamily: familyOf(auBodyFont) }}>
        {pairSlots[0]
          ? <MiniProf member={pairSlots[0]} char={charOf(pairSlots[0].charId)} isAdmin={isAdmin}
              auUnregistered={auUnregOf(pairSlots[0].charId)}
              side="l" onMoveSide={() => moveSide(pairSlots[0]!.charId)}
              onFaceCrop={ref => setFaceEdit({ charId: pairSlots[0]!.charId, ref, crop: pairSlots[0]!.faceCrop })}
              onGo={() => router.push(charHref(pairSlots[0]!.charId))}
              onRemove={() => removeMember(pairSlots[0]!.charId)} />
          : <EmptyCard isAdmin={isAdmin} onAdd={() => setMemberOpen(true)} />}
        <div className={`rel-center ${single ? 'one-mode' : ''}`}
          style={{ background: 'rgba(255,255,255,.04)', border: '1px solid var(--line-dark)' }}>
          {/* 全身 — 登錄圖片（AU 優先）＋尺寸／前後位置在自設關係修改的預覽中設定（v1.9） */}
          {pairSlots.map((sl, i) => {
            const cid = sl?.charId ?? '';
            // 全身位置・尺寸也以 AU 值優先（v2.0）— sl 已經是替換為 AU 值的成員
            const m = sl ?? rel.members.find(x => x.charId === cid);
            // AU 只使用自己的全身圖 — 不繼承 base 的全身圖（v1.9 使用者確認）
            const fullRef = isBaseAu ? m?.fullImgId : au?.fulls?.[cid];
            if (!fullRef) return null;   // 未登錄全身圖時連位置都不建立
            const front = (auFullFront ?? pairSlots[1]?.charId) === cid;
            return (
              <div key={i} className={`fb fb-${i === 0 ? 'l' : 'r'}`}
                style={{ background: 'transparent', zIndex: front ? 3 : 2 }}>
                <FullImg refId={fullRef} scale={m?.fullScale ?? 90} offX={m?.fullOffX ?? 0} offY={m?.fullOffY ?? 0}
                  shadow={fullShadow(auSt.nameShadowColor, auSt.nameShadow)} />
              </div>
            );
          })}
          <div className="single" ref={artBoxRef} style={{ cursor: auArts.length > 1 ? 'pointer' : undefined }}
            onClick={() => { const n = auArts.length; if (n > 1) setArtIdx(i => (i + 1) % n); }}
            onContextMenu={e => {
              if (!isAdmin || !curArt) return;
              e.preventDefault();
              setArtCtx({ x: e.clientX, y: e.clientY, ref: curArt });
            }}>
            {auArts.length > 0 ? (
              <>
                {/* 如果有設定位置就照原樣顯示（v2.0）— 沒有則與以前一樣顯示整張圖片 */}
                <CroppedBlobImg fileRef={auArts[Math.min(artIdx, auArts.length - 1)]} crop={rel.artCrops?.[curArt]} ph="" label="MAIN ILLUST" />
                {auArts.length > 1 && (
                  <div style={{ position: 'absolute', left: 0, right: 0, bottom: 44, display: 'flex', justifyContent: 'center', gap: 5, zIndex: 3 }}>
                    {auArts.map((_, i) => (
                      <i key={i} style={{ width: i === Math.min(artIdx, auArts.length - 1) ? 16 : 6, height: 6, borderRadius: 4, background: i === Math.min(artIdx, auArts.length - 1) ? '#fff' : 'rgba(255,255,255,.45)', transition: '.2s' }} />
                    ))}
                  </div>
                )}
              </>
            ) : (
              <div className="ph" style={{ position: 'absolute', inset: 0 }}><span>MAIN ILLUST</span></div>
            )}
          </div>
          {/* 切換顏色 — 如果沒有自設關係個別指定（EDIT）則使用主題・主色（v1.9）。
              如果完全沒有全身圖，就沒有可切換的內容，因此隱藏切換器本身 */}
          {hasFull && (
            <div className="illu-toggle seg" style={{
              ['--illu-bg' as string]: auSt.illuBg,
              ['--illu-on' as string]: auSt.illuOn,
            } as React.CSSProperties}>
              <button className={!single ? 'on' : ''} onClick={() => setOneMode(false)}>全身</button>
              <button className={single ? 'on' : ''} onClick={() => setOneMode(true)}>插圖</button>
            </div>
          )}
        </div>
        {pairSlots[1]
          ? <MiniProf member={pairSlots[1]} char={charOf(pairSlots[1].charId)} isAdmin={isAdmin}
              auUnregistered={auUnregOf(pairSlots[1].charId)}
              side="r" onMoveSide={() => moveSide(pairSlots[1]!.charId)}
              onFaceCrop={ref => setFaceEdit({ charId: pairSlots[1]!.charId, ref, crop: pairSlots[1]!.faceCrop })}
              onGo={() => router.push(charHref(pairSlots[1]!.charId))}
              onRemove={() => removeMember(pairSlots[1]!.charId)} />
          : <EmptyCard isAdmin={isAdmin} onAdd={() => setMemberOpen(true)} />}
      </div>
    ) : (
      /* 多人自設關係 — 原型 multi-body：左側成員列表（430px）＋右側群組插圖 */
      <div className="multi-body" style={{ fontFamily: familyOf(auBodyFont) }}>
        <div className="panel flush" style={{ padding: '6px 0' }}>
          {rel.members.map(m => {
            const c = charOf(m.charId);
            if (!c) return null;
            const unreg = auUnregOf(m.charId);
            return (
              <div key={m.charId} className="mrow" style={{ ['--cc' as string]: rgbTriple(c.color) }}
                onClick={() => router.push(charHref(m.charId))}>
                <div className={`face ph ${c.thumbClass}`}>
                  {!unreg && (c.arts?.[0] ?? c.thumbId) && (
                    <CroppedBlobImg fileRef={c.arts?.[0] ?? c.thumbId} crop={c.thumbCrop} ph={c.thumbClass} />
                  )}
                </div>
                <div className="nm">
                  {unreg ? (
                    /* AU 個人資料未登錄（v1.9）— 顯示登錄提示，而非原始個人資料 */
                    <>
                      <b style={{ fontFamily: familyOf(findChar(chars, m.charId)?.fontId) }}>{findChar(chars, m.charId)?.name}</b>
                      <small>此 AU 尚未登錄個人資料 — 點擊後登錄</small>
                    </>
                  ) : (
                    <>
                      <b style={{ fontFamily: familyOf(c.fontId) }}>{c.name}</b><i>{c.sub}</i>
                      <small>{c.specs.slice(0, 3).map(s => s.value).join(' · ')}</small>
                      {(m.quote || noteOf(m) || m.keywords[0]) && (
                        <span className="ext">{m.quote || noteOf(m) || m.keywords[0]}</span>
                      )}
                    </>
                  )}
                </div>
                <div className="gem-mini">
                  {(c.colors ?? []).slice(0, 3).map(p => <i key={p.hex + p.label} style={{ background: p.hex }} />)}
                </div>
                {isAdmin && (
                  <span className="rm" onClick={e => { e.stopPropagation(); removeMember(m.charId); }}>移除</span>
                )}
              </div>
            );
          })}
          {isAdmin && rel.members.length < 6 && (
            <div className="mrow add" onClick={() => setMemberOpen(true)}>＋ 新增成員（最多 6 人）</div>
          )}
        </div>

        {/* 右側：群組插圖 — 多張時點擊切換＋圓點 */}
        <div className="multi-illust" ref={artBoxRef}
          style={{ cursor: auArts.length > 1 ? 'pointer' : undefined }}
          onClick={() => { const n = auArts.length; if (n > 1) setArtIdx(i => (i + 1) % n); }}
          onContextMenu={e => {
            if (!isAdmin || !curArt) return;
            e.preventDefault();
            setArtCtx({ x: e.clientX, y: e.clientY, ref: curArt });
          }}>
          {auArts.length > 0 ? (
            <>
              <CroppedBlobImg fileRef={auArts[Math.min(artIdx, auArts.length - 1)]} crop={rel.artCrops?.[curArt]} ph="" label="GROUP ILLUST" />
              {auArts.length > 1 && (
                <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', gap: 5, zIndex: 3 }}>
                  {auArts.map((_, i) => (
                    <i key={i} style={{ width: i === Math.min(artIdx, auArts.length - 1) ? 16 : 6, height: 6, borderRadius: 4, background: i === Math.min(artIdx, auArts.length - 1) ? '#fff' : 'rgba(255,255,255,.45)', transition: '.2s' }} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="ph" style={{ position: 'absolute', inset: 0 }}><span>GROUP ILLUST</span></div>
          )}
        </div>
      </div>
    )}

    {/* 時間軸／雙人問答分頁（v1.8） */}
    <div className={`panel timeline ${!isDuo ? 'multi' : ''}`} style={{ fontFamily: familyOf(auBodyFont) }}>
      <div className="rel-tabs">
        <button className={tab === 'tl' ? 'on' : ''} onClick={() => setTab('tl')}><span className="lb-pc">TIMELINE</span><span className="lb-m">T</span></button>
        {/* QUESTIONS 區段必須透過＋新增才會出現（v1.9）— 一開始只有時間軸 */}
        {qaOn && <button className={tab === 'qa' ? 'on' : ''} onClick={() => setTab('qa')}><span className="lb-pc">QUESTIONS</span><span className="lb-m">Q</span></button>}
        {isAdmin && !qaOn && (
          <button data-tip="新增 QUESTIONS 區段" style={{ color: 'var(--faint)', fontSize: 14, padding: '0 6px' }}
            onClick={() => setQsetOpen(true)}>＋</button>
        )}
        {isAdmin && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' }}>
            {/* 這一列的按鈕與首頁共用按鈕使用相同的垂直尺寸（35px）— 只有在分頁列中看起來比較小 */}
            {tab === 'tl' && auTimeline.length > 1 && (
              <button className={`btn ${tlSort ? 'btn-accent' : 'btn-ghost'}`}
                style={{ height: 35, padding: '0 14px', fontSize: 11.5 }}
                onClick={() => setTlSort(v => !v)}>
                <span className="lb-pc">{tlSort ? '排序完成' : '⠿ 排序'}</span>
                <span className="lb-m">⠿</span>
              </button>
            )}
            {tab === 'tl'
              ? <button className="btn btn-dark" style={{ height: 35, padding: '0 14px', fontSize: 11.5 }} data-tip="新增紀錄" onClick={() => setTlOpen(true)}><span className="lb-pc">＋ ADD RECORD</span><span className="lb-m">＋</span></button>
              : <>
                <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11.5 }} data-tip="新增問題列表" onClick={() => setQsetOpen(true)}><span className="lb-pc">＋ 問題列表</span><span className="lb-m">≡</span></button>
                {/* 放回問題需在右側問題列表中按右鍵（v2.0 使用者要求）— 這裡只有跳過 */}
                {curQa && (
                  <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11.5 }}
                    data-tip="直接丟棄這個問題並進入下一個 — 之後不會再次出現（要放回請在右側列表按右鍵）"
                    onClick={skipQuestion}><span className="lb-pc">跳過問題</span><span className="lb-m">⏭</span></button>
                )}
                {/* 從等待池隨機出題（v1.9）— 加入列表後不會自動出題（v2.0）
                    還沒有取得問題時，將文字改為「取得問題」，表示這個按鈕是開始入口 */}
                {auQaPool.length > 0 && (
                  <button className={curQa ? 'btn btn-ghost' : 'btn btn-dark'} style={{ height: 35, padding: '0 14px', fontSize: 11.5 }}
                    data-tip={`等待中的問題 ${auQaPool.length} 個`}
                    onClick={drawNextQuestion}>
                    <span className="lb-pc">{curQa ? '完成 — 下一個問題' : '取得問題'}</span>
                    <span className="lb-m">↻</span>
                  </button>
                )}
                <button className="btn btn-dark" style={{ height: 35, padding: '0 14px', fontSize: 11.5 }} data-tip="新增問題" onClick={() => setQOpen(true)}><span className="lb-pc">＋ ADD QUESTION</span><span className="lb-m">＋</span></button>
              </>}
          </span>
        )}
      </div>

               {tab === 'tl' ? (
          tlSort ? (
            /* 排序模式 — 透過拖放變更順序 (4.5) */
            <DragList
              items={auTimeline.map((item, i) => ({ item, key: `tl-${i}` }))}
              keyOf={x => x.key}
              onReorder={list => patchAuData({ timeline: list.map(x => x.item) })}
              render={({ item }) => (
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', width: '100%', padding: '8px 6px', border: '1.5px dashed var(--line)', borderRadius: 9, marginBottom: 6, background: '#fff' }}>
                  <span className="drag-h">⠿</span>
                  <div style={{ minWidth: 0 }}>
                    {item.era && <div className="era">{item.era}</div>}
                    <div style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.desc || item.says.map(s => s.text).join(' / ')}
                    </div>
                  </div>
                </div>
              )} />
          ) : (
          <div>
            {auTimeline.map((item, i) => (
              /* 修改・刪除透過右鍵選單處理 (v2.0 使用者要求) — 移除一直顯示的 [刪除] 文字 */
              <div className="tl-item" key={i}
                onContextMenu={e => {
                  if (!isAdmin) return;
                  e.preventDefault();
                  setTlCtx({ x: e.clientX, y: e.clientY, idx: i });
                }}>
                {item.era && <div className="era">{item.era}</div>}
                {item.desc && <div className="desc">{item.desc}</div>}
                {item.says.map((s, j) => {
                  const c = charOf(s.charId);
                  return (
                    <div key={j} className={`tl-say ${sideOf(s.charId)}`}
                      style={{ ['--cc' as string]: rgbTriple(c?.color ?? '#5d636d') }}>
                      <div className="who" style={{ fontFamily: familyOf(c?.fontId) }}>{c?.name}</div>
                      <div className="bub">{s.text}</div>
                    </div>
                  );
                })}
              </div>
            ))}
            {auTimeline.length === 0 && <p className="hint">時間軸是空的 — 請使用右上角的 [＋ ADD RECORD] 新增</p>}
          </div>
          )
        ) : (
          <div className="qa-wrap">
            <div className="qa-today">
              {curQa ? (
                <>
                  {/* 捲動只到這裡 — 將輸入框放在外面，即使回答很長也能固定位置 (v2.0 使用者發現) */}
                  <div className="qa-answers" ref={ansRef} onScroll={onAnsScroll}>
                  <div className="qa-no">TODAY&apos;S QUESTION · Q.{String(curQa.no).padStart(3, '0')}
                    {/* 問題的擁有者說明 — 僅管理員可以撰寫 (v2.0 使用者要求) */}
                    {isAdmin && (
                      <small style={{ cursor: 'var(--cur-pointer,pointer)', color: 'var(--accent)', marginLeft: 8, fontWeight: 400, letterSpacing: 0 }}
                        onClick={() => setQNote({ no: curQa.no, text: curQa.note ?? '' })}>
                        {curQa.note ? '修改說明' : '＋ 說明'}
                      </small>
                    )}
                  </div>
                  <div className="qa-q">{curQa.q}</div>
                  {curQa.note && <div className="qa-note">{curQa.note}</div>}
                  {/* 僅顯示日期，靠右對齊 (v1.9 使用者回饋) */}
                  <div className="qa-date" style={{ textAlign: 'right' }}>{curQa.date.replace(/-/g, '.')}</div>
                  {qaHidden && <div className="qa-locked">私密回答</div>}
                  {!qaHidden && curAnswers.map((a, i) => {
                    const c = charOf(a.charId);
                    return (
                      <div key={i} className={`qa-ans ${sideOf(a.charId) === 'r' ? 'r' : ''}`}
                        style={{ ['--cc' as string]: rgbTriple(c?.color ?? '#5d636d') }}
                        /* 修改・補充說明・刪除透過右鍵選單處理 — 如果一直顯示，回答列會顯得雜亂 (使用者確認) */
                        onContextMenu={e => {
                          if (!(canEditAns(a) || isAdmin || canDelAns(a))) return;
                          e.preventDefault();
                          setAnsCtx({ x: e.clientX, y: e.clientY, idx: i });
                        }}>
                        {/* 同一個角色連續回答時，只顯示一次名字 (v2.0 使用者要求) */}
                        {curAnswers[i - 1]?.charId !== a.charId && (
                          <div className="who" style={{ fontFamily: familyOf(c?.fontId) }}>{c?.name}</div>
                        )}
                        <div className="bub" {...(a.note ? { 'data-note': a.note } : {})}>{a.text}</div>
                      </div>
                    );
                  })}
                  </div>
                  {!qaHidden && answerableIds.length > 0 && (
                    <div className="qa-input">
                      {/* 雙人：點擊循環切換 · 多人：透過下拉選單選擇 (v1.9 使用者確認) — 僅限有權限的角色 */}
                      <div className="char-pick" onClick={e => {
                        if (isDuo && answerableIds.length > 1) {
                          const cur = qaChar ?? answerableIds[0];
                          setQaChar(answerableIds[(answerableIds.indexOf(cur) + 1) % answerableIds.length]);
                        } else if (answerableIds.length > 1) {
                          if (qaPickPos) { setQaPickPos(null); return; }
                          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          const h = answerableIds.length * 34 + 10;
                          setQaPickPos({ left: r.left, top: Math.max(8, r.top - h - 6) });
                        }
                      }}>
                        <CharFace c={charOf(qaChar ?? answerableIds[0])} className="f" />
                        <small style={{ fontFamily: familyOf(charOf(qaChar ?? answerableIds[0])?.fontId) }}>
                          {charOf(qaChar ?? answerableIds[0])?.name}{answerableIds.length > 1 ? ' ▾' : ''}
                        </small>
                        {qaPickPos && createPortal(
                          <div className="k-sel-pop" style={{ position: 'fixed', left: qaPickPos.left, top: qaPickPos.top, minWidth: 150, zIndex: 120 }}>
                            {answerableIds.map(cid => {
                              const c = charOf(cid);
                              return (
                                <div key={cid} style={{ display: 'flex', gap: 8, alignItems: 'center' }}
                                  onClick={e2 => { e2.stopPropagation(); setQaChar(cid); setQaPickPos(null); }}>
                                  <CharFace c={c} style={{ width: 20, height: 20, borderRadius: 6, flexShrink: 0 }} />
                                  <span style={{ fontFamily: familyOf(c?.fontId) }}>{c?.name}</span>
                                </div>
                              );
                            })}
                          </div>,
                          document.body,
                        )}
                      </div>
                      <textarea
                        className="k-textarea" style={{ minHeight: 42 }}
                        placeholder="換行請按 Shift+Enter · 按 Enter 登錄"
                        value={qaText}
                        onChange={e => setQaText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submitQa(); }
                        }}
                      />
                    </div>
                  )}
                </>
              ) : (
                <p className="hint">目前沒有已登錄的問答 — 請使用右上角的 [＋ 新增問題] 開始</p>
              )}
            </div>
            <div className="qa-list">
              <div className="qa-search">
                <span>⌕</span>
                <input placeholder="搜尋問題" value={qaQuery} onChange={e => setQaQuery(e.target.value)} />
              </div>
              <div className="qa-scroll">
                {qaFiltered.map(q => (
                  /* 右鍵 — 從選單選擇「放回列表」後會顯示確認 Modal (v2.0 使用者要求 —
                     比起直接跳出 Modal，多經過一步，在誤觸右鍵時更安全。
                     即使不是目前正在查看的問題，也能直接從列表中選擇 */
                  <div key={q.no} className={`qa-item ${curQa?.no === q.no ? 'on' : ''}`} onClick={() => setQaNo(q.no)}
                    data-tip={isAdmin ? '右鍵 — 放回列表' : undefined}
                    onContextMenu={e => { if (!isAdmin) return; e.preventDefault(); setQaCtx({ x: e.clientX, y: e.clientY, no: q.no }); }}>
                    <b>Q.{String(q.no).padStart(3, '0')} {q.q}</b>
                    <small>{q.date.slice(5).replace('-', '.')} · 回答 {answersOf(q.no).length}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 角色扮演・日誌連結列表 (4.5) — 角色扮演：我的參與房間 + 已公開的完結房間。
          可依 AU 隱藏 (v2.0 使用者要求 — AU 管理中的核取方塊)。兩者都隱藏時整個區塊都不顯示 */}
      {!(au?.hideRp && au?.hideLog) && (
      <div className="g2" style={{ marginTop: 16 }}>
        {!au?.hideRp && (
        <div className="panel widget" style={{ margin: 0, ...(au?.hideLog ? { gridColumn: '1/-1' } : null) }}>
          <h4>角色扮演 <span className="more" onClick={() => router.push('/rp')}>查看更多 ›</span></h4>
          {relRooms.length > 0 ? relRooms.map(rm => (
            <div key={rm.id} className="dday-row" style={{ cursor: 'var(--cur-pointer,pointer)' }} onClick={() => router.push('/rp')}>
              <span>{rm.title}</span>
              <b style={{ fontSize: 11, color: 'var(--faint)' }}>
                {rm.status === 'done' ? (rm.isPublic ? '完結 · 公開' : '完結') : '進行中'}
              </b>
            </div>
          )) : (
            <p className="hint" style={{ margin: 0 }}>以此自設關係為基礎進行的角色扮演會顯示在這裡</p>
          )}
        </div>
        )}
        {!au?.hideLog && (
        <div className="panel widget" style={{ margin: 0, ...(au?.hideRp ? { gridColumn: '1/-1' } : null) }}>
          <h4>日誌 <span className="more" onClick={() => router.push('/trpg')}>查看更多 ›</span></h4>
          {relLogs.length > 0 ? relLogs.map(l => (
            <div key={l.id} className="dday-row" style={{ cursor: 'var(--cur-pointer,pointer)' }} onClick={() => router.push(`/trpg/${l.id}`)}>
              {/* 不顯示編號，只顯示標題 — 在連結列表中，順序編號沒有意義 (使用者確認) */}
              <span>{l.title}</span>
              <b style={{ fontSize: 11, color: 'var(--faint)' }}>{l.date?.replace(/-/g, '.') ?? ''}</b>
            </div>
          )) : <p className="hint" style={{ margin: 0 }}>目前沒有連結的日誌 — 登錄日誌時選擇自設關係後會顯示在這裡</p>}
        </div>
        )}
      </div>
      )}

      {/* ---------- 新增成員 Modal ---------- */}
      <Modal open={memberOpen} onClose={() => setMemberOpen(false)} small title="新增成員"
        dirty={!!(mCharId || mName || mQuote)}
        desc="連結我的角色，或簡單登錄對方（他人）角色 — 對方角色不會顯示在我的角色列表中"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setMemberOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={addMember}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ display: 'flex', gap: 16 }}>
            <KRadio name="mm" value="exist" current={mMode} onChange={v => setMMode(v as 'exist')} label="既有角色" />
            <KRadio name="mm" value="new" current={mMode} onChange={v => setMMode(v as 'new')} label="新對方角色" />
          </div>
          {mMode === 'exist' ? (
            <div>
              {/* 搜尋型選擇 — 透過輸入框篩選，再從下方列表點擊 */}
              <KInput placeholder="搜尋角色" value={mQuery} onChange={e => setMQuery(e.target.value)} />
              <div style={{ marginTop: 6, maxHeight: 190, overflowY: 'auto', border: '1.5px solid var(--line)', borderRadius: 9 }}>
                {candidates
                  .filter(c => {
                    const s = mQuery.trim().toLowerCase();
                    return !s || c.name.toLowerCase().includes(s) || (c.sub ?? '').toLowerCase().includes(s);
                  })
                  .map(c => (
                    <div key={c.id} onClick={() => setMCharId(mCharId === c.id ? '' : c.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, padding: '8px 11px', cursor: 'var(--cur-pointer,pointer)',
                        background: mCharId === c.id ? 'rgba(127,127,127,.12)' : undefined,
                        borderBottom: '1px dashed var(--line)', transition: '.13s',
                      }}>
                      <i style={{ width: 9, height: 9, borderRadius: '50%', background: c.color, fontStyle: 'normal', flexShrink: 0 }} />
                      <b style={{ fontSize: 12.5 }}>{c.name}</b>
                      <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{c.sub}{!c.own && ' · 對方'}</small>
                      {mCharId === c.id && <span style={{ marginLeft: 'auto', color: 'var(--accent)', fontWeight: 700 }}>✓</span>}
                    </div>
                  ))}
                {candidates.length === 0 && <p className="hint" style={{ padding: 10 }}>沒有可新增的角色</p>}
              </div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 8 }}>
                <KInput placeholder="名稱" value={mName} onChange={e => setMName(e.target.value)} />
                <KInput placeholder="一句話介紹（選填）" value={mSub} onChange={e => setMSub(e.target.value)} />
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
                <span className="cp-lb">主題色</span>
                <ColorField value={mColor} onChange={setMColor} />
              </div>
              {/* 會員權限 — 包含角色扮演／編輯權限 (第 3 次會員-角色連結, v1.9) */}
              <div>
                <label className="k-label" style={{ marginBottom: 7 }}>會員權限（選填）</label>
                <GrantsEditor value={mGrants} onChange={setMGrants} />
              </div>
            </>
          )}
          <KInput placeholder="角色一句話（選填 — 標題旁的引用句）" value={mQuote} onChange={e => setMQuote(e.target.value)} />
        </div>
      </Modal>

      {/* ---------- 新增時間軸項目 Modal（中央・一句話乒乓多筆） ---------- */}
      <Modal open={tlOpen} onClose={closeTl} title={tlEditIdx == null ? '新增時間軸項目' : '修改時間軸項目'}
        desc="說明／一句話至少填寫一項 · 時期標籤選填 · 一句話可新增多筆"
        dirty={!!(tEra || tDesc || tSays.some(x => x.text))}
        actions={<>
          <button className="btn btn-ghost" onClick={closeTl}>CANCEL</button>
          <button className="btn btn-dark" onClick={addTlItem}>{tlEditIdx == null ? 'ADD' : 'SAVE'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <KInput placeholder="時期標籤（選填）" value={tEra} onChange={e => setTEra(e.target.value)} />
          <KTextarea placeholder="說明" value={tDesc} onChange={e => setTDesc(e.target.value)} style={{ minHeight: 80 }} />
          <label className="k-label" style={{ margin: 0 }}>一句話 — 可以透過切換角色、彼此對話的方式累積內容</label>
          {tSays.map(s => (
            <div key={s.id} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KSelect minWidth={130} value={s.charId} placeholder="發言角色"
                onChange={v => setTSays(l => l.map(x => x.id === s.id ? { ...x, charId: v } : x))}
                options={rel.members.map(m => {
                  const c = charOf(m.charId);
                  return { value: m.charId, label: c?.name ?? m.charId };
                })} />
              <KInput placeholder="台詞" value={s.text}
                onChange={e => setTSays(l => l.map(x => x.id === s.id ? { ...x, text: e.target.value } : x))} />
              <span className="fx" onClick={() => setTSays(l => l.filter(x => x.id !== s.id))}>✕</span>
            </div>
          ))}
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, justifySelf: 'center' }}
            onClick={() => {
              // 新增一行的預設發言者與上一位發言者交替（乒乓）
              const last = tSays[tSays.length - 1]?.charId;
              const ids = rel.members.map(m => m.charId);
              const next = last ? ids[(ids.indexOf(last) + 1) % ids.length] : ids[0] ?? '';
              setTSays(l => [...l, { id: newId(), charId: next, text: '' }]);
            }}>＋ ADD LINE</button>
        </div>
      </Modal>

      {/* ---------- 問題新增 Modal ---------- */}
      {/* ---------- AU 新增／管理 Modal (v1.8 — AU 個別圖片・卡片分離為後續功能) ---------- */}
      <Modal open={auOpen} onClose={() => setAuOpen(false)} small title="AU 管理"
        dirty={!!(auLabel || auCatch)}
        desc="點擊 AU 後，整個個人資料（插圖・時間軸・問答・CP/NCP）會切換為該 AU 的內容 — 插圖・標語請在選取該 AU 的狀態下 EDIT"
        actions={<button className="btn btn-dark" onClick={() => setAuOpen(false)}>關閉</button>}>
        <div style={{ display: 'grid', gap: 8 }}>
          {rel.aus.map(a => (
            <div key={a.id} style={{ display: 'grid', gap: 7, padding: '9px 11px', border: '1.5px solid var(--line)', borderRadius: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* AU 名稱・標語僅在登錄時填寫，之後沒有修改的位置 (v2.0 使用者發現)。
                    現在改為可直接在與登錄表單相同的位置修改 — 與自設關係問題組名稱相同的方式 */}
                <KInput value={a.label}
                  onChange={e => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, label: e.target.value } : x)) })}
                  style={{ width: 110, fontSize: 12, padding: '5px 9px', flexShrink: 0 }} />
                <KInput value={a.id === 'base' ? rel.catchphrase : a.catchphrase} placeholder="標語"
                  onChange={e => {
                    const v = e.target.value;
                    // 原始資料的標語位於自設關係本體 — 為避免兩者不一致而一起修改
                    updateRel({
                      ...(a.id === 'base' ? { catchphrase: v } : {}),
                      aus: rel.aus.map(x => (x.id === a.id ? { ...x, catchphrase: v } : x)),
                    });
                  }}
                  style={{ fontSize: 11.5, padding: '5px 9px', minWidth: 0, flex: 1 }} />
                {/* AU 各自的 CP/NCP — 靠右對齊於名稱列 (v1.9 使用者要求) */}
                <div className="mini-seg" style={{ marginLeft: 'auto', flexShrink: 0 }}>
                  {(['cp', 'ncp'] as RelCpTag[]).map(t => (
                    <button key={t} className={(a.cp ?? rel.cp) === t ? 'on' : ''}
                      onClick={() => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, cp: t } : x)) })}>{CP_LABEL[t]}</button>
                  ))}
                </div>
                {a.id !== 'base' && (
                  <>
                    {/* 順序變更 (v2.0 使用者要求) — 原始資料(base)永遠固定在最前面 */}
                    <span className="fx" style={{ flexShrink: 0, opacity: rel.aus.indexOf(a) <= 1 ? .3 : 1 }}
                      data-tip="向上"
                      onClick={() => {
                        const i = rel.aus.findIndex(x => x.id === a.id);
                        if (i <= 1) return;   // 0 = base
                        const next = [...rel.aus];
                        [next[i - 1], next[i]] = [next[i], next[i - 1]];
                        updateRel({ aus: next });
                      }}>▲</span>
                    <span className="fx" style={{ flexShrink: 0, opacity: rel.aus.indexOf(a) >= rel.aus.length - 1 ? .3 : 1 }}
                      data-tip="向下"
                      onClick={() => {
                        const i = rel.aus.findIndex(x => x.id === a.id);
                        if (i < 1 || i >= rel.aus.length - 1) return;
                        const next = [...rel.aus];
                        [next[i], next[i + 1]] = [next[i + 1], next[i]];
                        updateRel({ aus: next });
                      }}>▼</span>
                    <span className="fx" style={{ flexShrink: 0 }}
                      onClick={() => del.ask(`確定要刪除 AU「${a.label}」嗎？`, () => {
                        updateRel({ aus: rel.aus.filter(x => x.id !== a.id) });
                        if (auId === a.id) setAuId('base');
                      }, '此 AU 的插圖・時間軸・問答也會一併刪除，且無法復原。')}>✕</span>
                  </>
                )}
              </div>
              {/* 隱藏詳細頁面下方的連結列表 (v2.0 使用者要求) — 僅在查看此 AU 時套用 */}
              <div style={{ display: 'flex', gap: 16 }}>
                <KCheck label={<span style={{ fontSize: 11.5 }}>隱藏角色扮演列表</span>} checked={!!a.hideRp}
                  onChange={v => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, hideRp: v || undefined } : x)) })} />
                <KCheck label={<span style={{ fontSize: 11.5 }}>隱藏日誌列表</span>} checked={!!a.hideLog}
                  onChange={v => updateRel({ aus: rel.aus.map(x => (x.id === a.id ? { ...x, hideLog: v || undefined } : x)) })} />
              </div>
            </div>
          ))}
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <KInput placeholder="AU 名稱" value={auLabel} onChange={e => setAuLabel(e.target.value)} style={{ maxWidth: 130 }} />
              <KInput placeholder="標語" value={auCatch} onChange={e => setAuCatch(e.target.value)} />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div className="mini-seg">
                {(['cp', 'ncp'] as RelCpTag[]).map(t => (
                  <button key={t} className={auCp === t ? 'on' : ''} onClick={() => setAuCp(t)}>{CP_LABEL[t]}</button>
                ))}
              </div>
              <button className="btn btn-dark" style={{ whiteSpace: 'nowrap', marginLeft: 'auto' }} onClick={() => {
                if (!auLabel.trim()) { toast('請輸入 AU 名稱'); return; }
                const na: RelAu = { id: newId(), label: auLabel.trim(), catchphrase: auCatch.trim(), cp: auCp, timeline: [], questions: [] };
                updateRel({ aus: [...rel.aus, na] });
                setAuLabel(''); setAuCatch('');
              }}>＋ ADD AU</button>
            </div>
          </div>
        </div>
      </Modal>

{/* 中央插圖右鍵 — 詳細頁面中的顯示位置 (v2.0 使用者要求)。多張時為目前查看的圖片 */}
      {artCtx && createPortal(
        <div className="ctx-menu on" style={{ left: artCtx.x, top: artCtx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-ttl">中央插圖{auArts.length > 1 ? ` ${Math.min(artIdx, auArts.length - 1) + 1}/${auArts.length}` : ''}</div>
          <button onClick={() => { setArtCropOpen({ ref: artCtx.ref, ratio: artBoxRatio() }); setArtCtx(null); }}>
            調整圖片位置
          </button>
          {rel.artCrops?.[artCtx.ref] && (
            <button onClick={() => { saveArtCrop(artCtx.ref, undefined); setArtCtx(null); }}>取消位置指定</button>
          )}
        </div>,
        document.body,
      )}
      {artCropOpen && (
        <RelArtCropModal fileRef={artCropOpen.ref} ratio={artCropOpen.ratio} crop={rel.artCrops?.[artCropOpen.ref]}
          onClose={() => setArtCropOpen(null)}
          onApply={c => { saveArtCrop(artCropOpen.ref, c); setArtCropOpen(null); }} />
      )}

      {/* ---------- 新增 QUESTIONS 區段 — 選擇問題列表 (v1.9) ---------- */}
      <Modal open={qsetOpen} onClose={() => setQsetOpen(false)} small title="新增問題列表"
        desc="從環境設定 > 自設關係問題的問題組中選擇，加入目前 AU 的 QUESTIONS"
        actions={<button className="btn btn-ghost" onClick={() => setQsetOpen(false)}>CANCEL</button>}>
        <div style={{ display: 'grid', gap: 8 }}>
          {[...qsets].sort((a, b) => (a.cat === (auCpTag ?? 'cp') ? -1 : 0) - (b.cat === (auCpTag ?? 'cp') ? -1 : 0)).map(s => (
            <button key={s.id} type="button" onClick={() => addQuestionSet(s)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 13px', textAlign: 'left',
                border: '1.5px solid var(--line)', borderRadius: 9, transition: '.13s', width: '100%',
              }}>
              <span className="pill dark">{CP_LABEL[s.cat]}</span>
              <b style={{ fontSize: 12.5 }}>{s.name}</b>
              <small style={{ marginLeft: 'auto', color: 'var(--faint)', fontSize: 10.5 }}>問題 {s.questions.length} 題</small>
            </button>
          ))}
          {qsets.length === 0 && <p className="hint" style={{ margin: 0 }}>請先前往環境設定 &gt; 自設關係問題建立問題組</p>}
          {/* 僅在 QUESTIONS 區段尚未存在時 — 已存在時僅用於新增列表 (v1.9 使用者指出) */}
          {!qaOn && (
            /* 與問題組按鈕相同的垂直高度 (v1.9 使用者回饋) */
            <button type="button" className="btn btn-ghost"
              style={{ padding: '10px 13px', fontSize: 12, justifyContent: 'center', width: '100%' }}
              onClick={() => addQuestionSet(null)}>從空白區段開始</button>
          )}
        </div>
      </Modal>

      <Modal open={qOpen} onClose={() => setQOpen(false)} small title="新增問題"
        dirty={!!qText}
        desc="登錄此自設關係的問答問題 — 題目池・隨機出題管理請至環境設定（後續功能）"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setQOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={addQuestion}>ADD</button>
        </>}>
        <KTextarea placeholder="問題" value={qText}
          onChange={e => setQText(e.target.value)} style={{ minHeight: 60 }} />
      </Modal>
      {/* 回答修改・擁有者補充說明 (v1.9) — 文字由作者本人撰寫，補充說明由管理員撰寫 */}
      <Modal open={ansEdit !== null} onClose={() => setAnsEdit(null)} small
        title={ansEdit && canEditAns(curAnswers[ansEdit.idx] ?? { charId: '', text: '' }) ? '修改回答 · 補充說明' : '補充說明'}
        dirty={!!ansEdit}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setAnsEdit(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveAnsEdit}>SAVE</button>
        </>}>
        {ansEdit && (
          <div style={{ display: 'grid', gap: 9 }}>
            {canEditAns(curAnswers[ansEdit.idx] ?? { charId: '', text: '' }) && (
              <KTextarea value={ansEdit.text} onChange={e => setAnsEdit(s => s && { ...s, text: e.target.value })}
                style={{ minHeight: 60 }} />
            )}
            {/* 補充說明由**可以修改回答的人**填寫 (v2.0 使用者發現)。
                以前只有管理員可以填寫，因此取得角色權限並能回答的會員，連自己的回答都無法補充說明
                — 可以回答卻不能說明，前後不一致 */}
            {(isAdmin || canEditAns(curAnswers[ansEdit.idx] ?? { charId: '', text: '' })) && (
              <div>
                <label className="k-label" style={{ marginBottom: 5 }}>補充說明 — 滑鼠移到對話框上時顯示（留空則不顯示）</label>
                <KTextarea value={ansEdit.note} onChange={e => setAnsEdit(s => s && { ...s, note: e.target.value })}
                  style={{ minHeight: 46 }} />
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 問題的擁有者說明 (v2.0) — 與回答的補充說明不同，會直接顯示在問題下方 */}
      <Modal open={qNote !== null} onClose={() => setQNote(null)} small title="問題說明"
        desc="說明這個問題為什麼會出現、處於什麼情境 — 會直接顯示在問題下方"
        dirty={!!qNote?.text}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setQNote(null)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveQNote}>SAVE</button>
        </>}>
        {qNote && (
          <div>
            <label className="k-label" style={{ marginBottom: 5 }}>說明（留空則不顯示）</label>
            <KTextarea value={qNote.text} onChange={e => setQNote(s => s && { ...s, text: e.target.value })}
              style={{ minHeight: 70 }} />
          </div>
        )}
      </Modal>

      {/* 回答右鍵選單 (v2.0) — 修改・補充說明・刪除 */}
      {/* 時間軸右鍵選單 (v2.0) */}
      {tlCtx && auTimeline[tlCtx.idx] && createPortal(
        <div className="ctx-menu on" style={{ left: tlCtx.x, top: tlCtx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-ttl">{auTimeline[tlCtx.idx].era || '時間軸項目'}</div>
          <button onClick={() => { const i = tlCtx.idx; setTlCtx(null); openTlEdit(i); }}>修改</button>
          <button className="danger" onClick={() => {
            const i = tlCtx.idx;
            setTlCtx(null);
            del.ask('確定要刪除時間軸項目嗎？',
              () => patchAuData({ timeline: auTimeline.filter((_, j) => j !== i) }));
          }}>刪除</button>
        </div>,
        document.body,
      )}

      {/* 問題右鍵選單 (v2.0 使用者要求) — 在這裡選擇後才會顯示確認 Modal */}
      {qaCtx && createPortal(
        <div className="ctx-menu on" style={{ left: qaCtx.x, top: qaCtx.y }} onClick={e => e.stopPropagation()}>
          <div className="ctx-ttl">Q.{String(qaCtx.no).padStart(3, '0')}</div>
          <button className="danger" onClick={() => {
            const q = auQuestions.find(x => x.no === qaCtx.no);
            setQaCtx(null);
            if (q) returnQuestion(q);
          }}>放回列表</button>
        </div>,
        document.body,
      )}

      {ansCtx && curQa && curAnswers[ansCtx.idx] && createPortal(
        (() => {
          const a = curAnswers[ansCtx.idx];
          return (
            <div className="ctx-menu on" style={{ left: ansCtx.x, top: ansCtx.y }} onClick={e => e.stopPropagation()}>
              <div className="ctx-ttl">{charOf(a.charId)?.name ?? '回答'}</div>
              {(canEditAns(a) || isAdmin) && (
                <button onClick={() => {
                  setAnsEdit({ qNo: curQa.no, idx: ansCtx.idx, text: a.text, note: a.note ?? '' });
                  setAnsCtx(null);
                }}>{canEditAns(a) ? '修改 · 補充說明' : '補充說明'}</button>
              )}
              {canDelAns(a) && (
                <button className="danger" onClick={() => { const i = ansCtx.idx; setAnsCtx(null); deleteAns(curQa.no, i); }}>刪除</button>
              )}
            </div>
          );
        })(),
        document.body,
      )}

      {/* 成員臉部區域(1:1) 裁切 — 與角色的 3:4 縮圖分開，只儲存在此自設關係中 (v2.0) */}
      {faceEdit && (
        <FaceCropModal fileRef={faceEdit.ref} crop={faceEdit.crop}
          onClose={() => setFaceEdit(null)}
          onApply={c => saveFaceCrop(faceEdit.charId, c)} />
      )}

      {/* 刪除確認 — 在 DOM 最後渲染，使其顯示在其他 Modal（如 AU 管理）之上 */}
      {del.element}
    </section>
  );
}