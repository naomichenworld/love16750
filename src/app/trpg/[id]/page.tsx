'use client';
// TRPG 日誌詳細頁（4.3）— 如果是 HTML，隔離渲染並保持原始樣式（iframe sandbox，不執行腳本）、
// 如果是一般文字，則以日誌用的預設格式顯示
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useHrefBlock } from '@/components/shell/MenuGuard';
import { sectionHref, MAIN_SEC, secStamp, useSectionTitle } from '@/lib/sectionStore';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { TrpgLog, TRPG_SEED, TrpgLogBody, TRPG_BODY_SEED, bodyVisibility, showAsHtml, decodeLogText, logNo, saveLogBody } from '@/lib/galleryStore';
import { Relation, REL_SEED, Character, CHAR_SEED, charGrant } from '@/lib/charStore';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { getBlob, putBlob, useBlobUrl } from '@/lib/blobStore';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';
import { KInput, KSelect, KDate, KTextarea } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { CropEditor, CropImg, CropValue } from '@/components/ui/CropEditor';
import { useToast } from '@/components/ui/Toast';

/** 日誌渲染框架 — 為了讓大型文件也能穩定載入，使用 Blob URL 取代 srcdoc */
function LogFrame({ frameRef, html, title, onFrameLoad }: {
  frameRef: React.RefObject<HTMLIFrameElement | null>; html: string; title: string;
  onFrameLoad: () => void;
}) {
  // 在 MIME 中明確指定 charset（v2.0）— 日誌檔案的 <meta charset> 可能因注入腳本而被推到
  // 瀏覽器尋找編碼的前 1024 bytes 之外。這樣一來，不同瀏覽器可能會導致本文亂碼
  const url = useMemo(() => URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' })), [html]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <iframe
      ref={frameRef}
      className="log-frame"
      sandbox="allow-scripts"
      src={url}
      title={title}
      onLoad={onFrameLoad}
    />
  );
}

export default function TrpgDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [logs, setLogs, loaded] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  // 本文與列表分開儲存（v2.0 — 為了讓僅自己可見的日誌也能出現在列表中，列表文件的查詢條件
  // 因 listHidden 而放寬，但如果本文也放在一起，本文也會透過該查詢一起洩漏）。
  // 不在此列表中的 id 代表「因為沒有權限，所以一開始就沒有取得」— 由伺服器自動過濾
  const [bodies, setBodies] = useLocalList<TrpgLogBody>('ohome.trpgbody.v1', TRPG_BODY_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [allChars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [delAsk, setDelAsk] = useState(false);
  const [bodyText, setBodyText] = useState<string | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const gotHeightRef = useRef(false);   // 是否收到內部回報的高度（如果沒有，就恢復為預設高度）

  const l = logs.find(x => x.id === id);
  /* 如果此文章所屬的位置是私密的，即使透過網址進入也不能開啟（v2.0 使用者要求）。
     文章網址沒有 section，因此 MenuGuard 無法阻擋 — 這裡讀取文章並得知所屬位置後再判定。
     **必須在其他 early return 之前呼叫**（因為是 hook，所以每次 render 的數量必須相同） */
  const blocked = useHrefBlock(l && sectionHref('trpg', l.secId ?? MAIN_SEC));
  // 大字標題 — 如果是額外區段就使用該區段名稱，點擊後也前往該列表（v2.0 使用者回報）
  const tt = useSectionTitle('trpg', l?.secId, 'TRPG LOG');
  const bd = bodies.find(x => x.id === id);   // 分開儲存的本文 — 沒有權限時一開始就不會取得（undefined）

  // 存取權限（4.3）— 管理員／符合公開範圍／已輸入密碼者／
  // 已連結自設關係的對方（會員角色獲得權限的會員）一律可以查看
  // （第三階段會員－角色連結，v1.9）
  const logRel = rels.find(r => r.id === l?.relId);
  const isRelPartner = !!user && !!logRel && logRel.members.some(m => {
    const ch = allChars.find(c => c.id === m.charId);
    return ch ? !!charGrant(ch, user.id) : false;
  });
  const baseAllowed = !!l && (isAdmin || isRelPartner
    || l.visibility === 'public' || (l.visibility === 'member' && !!user));

  // 密碼查看（4.3）— 在此工作階段內維持解鎖狀態
  const [unlocked, setUnlocked] = useState(false);
  const [pwTry, setPwTry] = useState('');
  useEffect(() => {
    try { if (sessionStorage.getItem(`trpg-unlock:${id}`) === '1') setUnlocked(true); } catch { /* 忽略 */ }
  }, [id]);

  // 如果無法查看此日誌（不存在、沒有權限，也沒有密碼），就返回首頁 — 以前這裡只留下「沒有查看權限」
  // 的文字，但使用者要求在登出等情況失去權限後，不應繼續停留在該畫面，因此返回首頁
  // （v2.0）
  useEffect(() => {
    if (!loaded) return;
    if (!l) { router.replace('/'); return; }
    if (!baseAllowed && !unlocked && !l.password) router.replace('/');
  }, [loaded, l, baseAllowed, unlocked, router]);
  const tryUnlock = () => {
    if (l?.password && pwTry === l.password) {
      setUnlocked(true);
      try { sessionStorage.setItem(`trpg-unlock:${id}`, '1'); } catch { /* 忽略 */ }
    } else {
      toast('密碼不正確');
    }
  };

  // 修改日誌資訊 — 中繼資料＋替換本文（檔案／直接輸入）＋替換縮圖（圖片裁切／單色・漸層）
  const [eOpen, setEOpen] = useState(false);
  const [e, setE] = useState({
    noText: '', title: '', catchphrase: '', writer: '', withText: '',
    relId: 'none', date: '', visibility: 'public' as TrpgLog['visibility'], password: '',
    listHidden: false,   // 是否顯示於列表（v2.0 — 與存取權限分開）
  });
  // 本文替換
  const [bodyMode, setBodyMode] = useState<'keep' | 'file' | 'text'>('keep');
  // 本文顯示方式（v2.0）— 自動判斷有時會將直接撰寫的文章誤判為 HTML，因此可以手動選擇
  const [bodyDisp, setBodyDisp] = useState<'auto' | 'text' | 'html'>('auto');
  const [eFile, setEFile] = useState<File | null>(null);
  const [eText, setEText] = useState('');
  const eFileRef = useRef<HTMLInputElement>(null);
  const eThumbRef = useRef<HTMLInputElement>(null);
  // 縮圖替換
  const [thumbMode, setThumbMode] = useState<'keep' | 'image' | 'color'>('keep');
  const [eThumb, setEThumb] = useState<File | null>(null);
  const [eThumbUrl, setEThumbUrl] = useState('');
  const [eThumbCrop, setEThumbCrop] = useState<CropValue | undefined>(undefined);
  const curThumbUrl = useBlobUrl(l?.thumbId);   // 「目前維持」時調整位置用的原圖
  const [eCropOpen, setECropOpen] = useState(false);
  const [eColorMode, setEColorMode] = useState<'grad' | 'solid'>('grad');
  const [eC1, setEC1] = useState('#4c5a6e');
  const [eC2, setEC2] = useState('#242b36');

  const saveEdit = async () => {
    if (!e.title.trim()) { toast('請輸入劇本標題'); return; }
    // 本文替換準備 — 本文與列表分開儲存（v2.0），因此現在會建立 TrpgLogBody 片段
    let bodyPatch: Partial<TrpgLogBody> = {};
    if (bodyMode === 'file' && eFile) {
      const text = await decodeLogText(eFile);
      bodyPatch = {
        ...(await saveLogBody(text)),
        originalFileId: await putBlob(eFile), originalName: eFile.name,
      };
    } else if (bodyMode === 'text' && eText.trim()) {
      bodyPatch = await saveLogBody(eText);
    }
    // 縮圖替換準備
    let thumbPatch: Partial<TrpgLog> = {};
    if (thumbMode === 'image' && eThumb) {
      thumbPatch = { thumbId: await putBlob(eThumb), thumbCrop: eThumbCrop, thumbColor: undefined };
    } else if (thumbMode === 'keep' && l?.thumbId) {
      // 圖片維持不變，只調整位置・縮放時（使用者要求）
      thumbPatch = { thumbCrop: eThumbCrop };
    } else if (thumbMode === 'color') {
      thumbPatch = { thumbId: undefined, thumbCrop: undefined, thumbColor: { c1: eC1, c2: eColorMode === 'grad' ? eC2 : undefined } };
    }
    const nextLog: TrpgLog = {
      ...(l as TrpgLog),
      noText: e.noText.trim() || undefined,
      title: e.title.trim(), catchphrase: e.catchphrase.trim() || undefined,
      writer: e.writer.trim(), withText: e.withText.trim(),
      relId: e.relId === 'none' ? undefined : e.relId,
      date: e.date || undefined,
      visibility: e.visibility, password: e.password.trim() || undefined,
      listHidden: e.listHidden,
      ...thumbPatch,
      // 以前本文存在於此文件中 — 每次儲存時都確實清空（清理舊版本殘留），
      // 避免僅自己可見的日誌出現在列表時，本文也一起洩漏（v2.0）
      body: undefined, bodyId: undefined, bodyHtml: undefined,
      originalFileId: undefined, originalName: undefined,
    };
    setLogs(logs.map(x => x.id === id ? nextLog : x));
    // 本文會 upsert 到獨立文件 — 「目前維持」時，直接保留現有值（若有分開儲存則使用該值，
    // 沒有的話使用舊版日誌的內嵌值），因此只要修改過一次，就會自動移到分開儲存的位置
    const nextBody: TrpgLogBody = {
      id,
      body: bd?.body ?? l?.body ?? '',
      bodyId: bd?.bodyId ?? l?.bodyId,
      originalFileId: bd?.originalFileId ?? l?.originalFileId,
      originalName: bd?.originalName ?? l?.originalName,
      bodyHtml: bodyDisp === 'auto' ? undefined : bodyDisp === 'html',
      ...bodyPatch,
      visibility: bodyVisibility(nextLog),
      ...secStamp(nextLog.secId ?? MAIN_SEC),   // 所屬區段（v2.0）— 本文文件也會受到私密判定
    };
    // 新本文文件會加在後面（v2.0 使用者回報）— 如果插入前面，舊有整個本文的位置都會被推移，
    // 導致大量本文需要重新儲存；在大型首頁中，寫入總量可能超過儲存限制而導致儲存失敗
    setBodies(bd ? bodies.map(x => x.id === id ? nextBody : x) : [...bodies, nextBody]);
    if (bodyMode !== 'keep') setBodyText(null); // 重新載入本文
    setEOpen(false);
    setBodyMode('keep'); setEFile(null); setEText('');
    setThumbMode('keep'); setEThumb(null); setEThumbUrl(''); setEThumbCrop(undefined);
    toast('已儲存');
  };

  // 本文載入 — 優先使用分開儲存的本文（bd），沒有的話使用舊版日誌的內嵌本文（l.body/bodyId）作為 fallback（v2.0）
  const [bodyFailed, setBodyFailed] = useState(false);   // 無法讀取本文檔案（下方會 fallback 至原始檔案）
  useEffect(() => {
    if (!l) return;
    const src = bd ?? l;   // 如果沒有 bd（尚未分離的舊版日誌），就從 l 本身讀取
    setBodyFailed(false);
    if (src.body) { setBodyText(src.body); return; }
    if (src.bodyId) {
      getBlob(src.bodyId)
        .then(async b => { if (b) setBodyText(await b.text()); else { setBodyText(''); setBodyFailed(true); } })
        .catch(() => { setBodyText(''); setBodyFailed(true); });
    } else setBodyText('');
  }, [l, bd]);

  // 接收 sandbox 內部回報的高度 → 自動調整 iframe 高度（因為是 null origin，無法直接測量）
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      const h = (e.data as { __logH?: unknown })?.__logH;
      if (typeof h === 'number' && isFinite(h) && frameRef.current) {
        // scrollHeight 至少會回報 viewport（＝目前 iframe 高度）的大小，因此在此加上空白會造成
        // 「設定 → 回報更大值 → 再次設定」的無限增長循環 — 直接使用回報值，
        // 而且如果與目前高度幾乎相同（±2px）就不重新設定
        const next = Math.min(200000, Math.max(200, Math.round(h)));
        gotHeightRef.current = true;
        const cur = frameRef.current.getBoundingClientRect().height;
        if (Math.abs(next - cur) > 2) frameRef.current.style.height = `${next}px`;
      }
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, []);

  /** 文件出現的瞬間先縮小高度 — 避免內部高度計算被 viewport（目前 iframe 高度）牽動而
   *  不斷變大。接下來會以收到的回報值調整為內容高度。
   *  沒有收到回報的文件（沒有腳本或被阻擋）則恢復為預設高度，讓內部使用捲動閱讀。 */
  const onFrameLoad = () => {
    if (!frameRef.current) return;
    gotHeightRef.current = false;
    frameRef.current.style.height = '240px';
    // 只有完全沒有收到任何回報的文件（腳本被阻擋時）才恢復預設高度。
    // 延長至 3 秒 — 回報器每 2 秒即使值相同也會再次通知，讓它有時間找到正確位置
    setTimeout(() => {
      if (!gotHeightRef.current && frameRef.current) frameRef.current.style.height = '';
    }, 3000);
  };

  // 如果不存在或無法查看，會由上方 useEffect 導向首頁 — 在此之前暫時只顯示空白畫面（v2.0）
  // 如果被阻擋就在這裡返回 — 必須在所有 hook 都呼叫完後才能這樣做，才能確保每次 render 的數量相同
  if (blocked) return blocked;
  if (!loaded || !l) return <section className="page" />;
  if (!baseAllowed && !unlocked) {
    if (!l.password) return <section className="page" />;
    // 密碼閘門 — 正確後在此工作階段內維持查看權限
    return (
      <section className="page">
        {/* 說明文字可在環境設定 > TRPG 中修改 — 管理員無法看到此畫面 */}
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle>
          <EditableDesc k="trpg-lock-desc" def="비밀번호를 입력하면 열람할 수 있습니다" always /></div>
        <div className="panel" style={{ maxWidth: 420, margin: '0 auto', padding: 26, display: 'grid', gap: 10 }}>
          <KInput type="password" placeholder="密碼" value={pwTry} onChange={e => setPwTry(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') tryUnlock(); }} />
          <button className="btn btn-dark" style={{ justifyContent: 'center', padding: 9 }} onClick={tryUnlock}>確認</button>
        </div>
      </section>
    );
  }

  const rel = rels.find(r => r.id === l.relId);
  const body = bodyText ?? '';
  // 如果有指定值就直接使用 — 避免直接撰寫的文章因出現像標籤的文字而被誤判為 HTML
  const html = showAsHtml({ bodyHtml: bd?.bodyHtml ?? l.bodyHtml }, body);
  // 原始檔案也優先使用分開儲存的值，沒有的話使用舊版日誌的內嵌值（v2.0）
  const origFileId = bd?.originalFileId ?? l.originalFileId;
  const origName = bd?.originalName ?? l.originalName;
  // 本文不存在時，可以替代顯示的伺服器檔案網址（v2.0 使用者回報 — 用來防止本文儲存失敗）
  const fallbackUrl = [bd?.bodyId, l.bodyId, origFileId]
    .find(x => typeof x === 'string' && /^https?:/.test(x));
  // 移除 iframe 預設 body margin（避免白色邊框）＋注入高度回報器
  // 水晶莉亞／水晶系列日誌會用 JS 繪製本文，因此需要執行腳本 —
  // null origin sandbox（只有 allow-scripts）無法存取網站 Cookie・DOM（維持 6.3 的隔離目的）
  // shim＋高度回報器放在文件前方 — 無論日誌文件在解析過程中變成什麼狀態，
  // interval 回報器都能持續運作（放在後面時，部分大型日誌曾發生無法執行的案例）。
  // **但是不能放在 <!DOCTYPE> 前面**（v2.0 使用者發現 — 長日誌下方出現空白空間）：
  // doctype 前如果有任何內容，文件就會以 **quirks mode** 解析，而在 quirks mode 中 body 是
  // 捲動元素，因此 `body.scrollHeight` 至少會回傳 viewport（＝目前 iframe 高度）。
  // 這樣回報器就會重新讀取自己的 iframe 高度，形成「錯誤的高度自己證明自己正確」的情況 —
  // 一旦高度被設得很大，就永遠不會縮小。下面的 injectAfterDoctype 會直接插入 doctype 後面。
  // <meta charset> 也一起注入 — decodeLogText 已經將內容建立成字串，因此 Blob 永遠是 UTF-8。
  // 即使原始文件後面還有 charset 宣告（euc-kr 等），前面較早的宣告仍會優先
  const inject = `<meta charset="utf-8"><script>
// 在 null origin 中存取 localStorage 會拋出例外，因此避免日誌腳本因此停止（無動作 shim）
try{void window.localStorage}catch(e){var __m={getItem:function(){return null},setItem:function(){},removeItem:function(){},clear:function(){},key:function(){return null},length:0};
try{Object.defineProperty(window,'localStorage',{value:__m});Object.defineProperty(window,'sessionStorage',{value:__m});}catch(e2){}}
// 高度回報器 — 使用 MutationObserver＋load 事件取代 timer（避免背景分頁節流）。
// documentElement.scrollHeight 不會小於 viewport（＝目前 iframe 高度），因此一旦變大後，
// 即使內容很短也無法縮小（短日誌下方留下空白的原因）→ 以 body 為基準測量。
(function(){var p=0,n=0;function r(force){try{
var b=document.body;if(!b)return;
// html（documentElement）即使內容很短，也會延伸到 viewport（＝目前 iframe 高度），因此不能作為基準。
// scrollHeight 或 offsetHeight 也是如此，因此只查看不會自行變大的 body。
var h=Math.max(b.scrollHeight||0,b.offsetHeight||0,Math.ceil(b.getBoundingClientRect().height)||0);
// **如果是 0 就什麼都不回報**（v2.0 使用者發現 — 長日誌下方出現空白）。
// 以前這裡會改用 documentElement.scrollHeight，但該值至少等於 viewport（＝目前 iframe
// 高度），因此會**直接重新讀取自己的高度**。如果在版面尚未完成時（分頁在後面或
// 第一張圖片尚未載入前）就送出這個值，外部會將它當成「內容高度」並直接固定下來，
// 後面就會一直回報相同數值，形成**錯誤的高度自己證明自己正確**— 無法再恢復
if(!h)return;
// 即使數值沒有變，有時也要再次回報（v2.0）— 外部可能因其他原因把高度恢復了。
// 以前是「相同就不傳送」，因此一旦高度錯誤，就完全沒有辦法恢復
if(h!==p||force){p=h;parent.postMessage({__logH:h},'*');}}catch(e3){}}
document.addEventListener('DOMContentLoaded',function(){r(1)});addEventListener('resize',function(){r(1)});
// **圖片・字型會在第一次圖片載入後加入，並改變高度**（v2.0 使用者發現 — 長日誌下方出現空白）。
// 如果要捕捉各個圖片的 load/error，就必須進入 capture 階段（這些事件不會向上冒泡）。
addEventListener('load',function(){r(1)},true);
addEventListener('error',function(){r(1)},true);
try{if(document.fonts&&document.fonts.ready)document.fonts.ready.then(function(){r(1)});}catch(e5){}
try{new MutationObserver(function(){r(0)}).observe(document.documentElement,{childList:true,subtree:true,attributes:true});}catch(e4){}
// 每 0.4 秒確認一次，每 2 秒即使數值相同也再次回報（隱藏狀態下版面為 0 時會跳過）
setInterval(function(){n++;r(n%5===0);},400);
r(1);})();
</scr${''}ipt><style>
/* height:auto — 如果日誌文件的 html/body 設定 100%，會無視內容高度而延伸至 viewport */
html,body{margin:0!important;padding:0!important;height:auto!important;min-height:0!important}
</style>`;
  /** 注入位置 — 如果有 <!DOCTYPE ...>，就在它**後面**；沒有的話就在前面建立 doctype。
   * 必須維持標準模式，body 高度才會是真正的內容高度（參考上方註解） */
  const dt = /^\s*<!doctype[^>]*>/i.exec(body);
  const srcDoc = dt
    ? body.slice(0, dt[0].length) + inject + body.slice(dt[0].length)
    : `<!DOCTYPE html>${inject}${body}`;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle href={tt.href}>{tt.title}</PageTitle>
        <p>{logNo(l)}{[l.writer, l.withText].filter(Boolean).map(x => ` · ${x}`).join('')}{l.date ? ` · ${l.date.replace(/-/g, '.')}` : ''}</p>
        <div className="head-actions">
          {rel && <button className="btn btn-dark" onClick={() => router.push(`/rels/${rel.id}`)}>{rel.name} ›</button>}
          {isAdmin && <button className="btn btn-dark" onClick={() => {
            setE({
              noText: l.noText ?? '', title: l.title, catchphrase: l.catchphrase ?? '', writer: l.writer,
              withText: l.withText, relId: l.relId ?? 'none', date: l.date ?? '',
              visibility: l.visibility, password: l.password ?? '', listHidden: !!l.listHidden,
            });
            // 本文・縮圖替換狀態初始化（預設：維持目前內容）
            setBodyMode('keep'); setEFile(null); setEText(bodyText ?? '');
            const bh = bd?.bodyHtml ?? l.bodyHtml;
            setBodyDisp(bh === undefined ? 'auto' : bh ? 'html' : 'text');
            // 即使「目前維持」也能調整位置・縮放，因此從目前裁切值開始
            setThumbMode('keep'); setEThumb(null); setEThumbUrl(''); setEThumbCrop(l.thumbCrop);
            setEColorMode(l.thumbColor ? (l.thumbColor.c2 ? 'grad' : 'solid') : 'grad');
            if (l.thumbColor) { setEC1(l.thumbColor.c1); if (l.thumbColor.c2) setEC2(l.thumbColor.c2); }
            setEOpen(true);
          }}>EDIT</button>}
          {isAdmin && <button className="btn btn-dark" onClick={() => setDelAsk(true)}>DELETE</button>}
        </div>
      </div>

      {/* 僅限制本文寬度 — 標題區維持全寬位置 */}
      <div className="panel" style={{ padding: 24, maxWidth: 1000, margin: '0 auto' }}>
        <h2 style={{
          fontFamily: l.serifTitle ? 'var(--serif)' : "'Noto Serif KR',serif",
          fontSize: 24, fontWeight: 700,
          marginBottom: l.catchphrase ? 2 : 18, // 沒有標語時避免與本文貼得太近
          letterSpacing: l.serifTitle ? '.12em' : '.04em',
        }}>{l.title}</h2>
        {l.catchphrase && (
          <p style={{ fontSize: 11.5, color: 'var(--faint)', letterSpacing: '.14em', marginBottom: 16 }}>{l.catchphrase}</p>
        )}
        {html ? (
          /* 保持原始樣式・腳本 — null origin sandbox 無法存取網站資料（6.3 隔離） */
          <LogFrame frameRef={frameRef} html={srcDoc} title={l.title} onFrameLoad={onFrameLoad} />
        ) : (
          body
            ? <div className="log-plain">{body}</div>
            : fallbackUrl
              /* 本文文件不存在或無法讀取時，如果伺服器上有保存的原始檔案，就直接顯示該檔案
                 （v2.0 使用者回報 — 即使本文儲存失敗，只要有原始檔案仍然可以閱讀）。
                 因為沒有注入高度調整，所以不會自動符合內容高度，但會在預設高度（65vh）內透過捲動閱讀 */
              ? (
                <>
                  <iframe className="log-frame" sandbox="allow-scripts" src={fallbackUrl} title={l.title} />
                  <p className="hint" style={{ marginTop: 6 }}>無法載入本文文件，目前正以保存的原始檔案顯示 — 在修改畫面重新儲存本文後即可恢復正常</p>
                </>
              )
              : (
                <p className="hint">
                  {bodyFailed
                    ? '無法載入本文檔案 — 如果重新整理後仍然如此，請在修改畫面重新登錄本文'
                    : '本文是空的 — 如果是以前版本登錄的項目，請刪除後重新登錄'}
                </p>
              )
        )}
        {/* 不顯示說明文字，只提供原始檔案下載連結（4.3 備份） */}
        <p className="hint" style={{ marginTop: 10 }}>
          {origFileId && (
            /^https?:/.test(origFileId)
              // 伺服器上的檔案直接以連結開啟 — 如果使用 fetch 下載，就需要設定 Bucket CORS
              ? (
                <a href={origFileId} target="_blank" rel="noreferrer" download={origName}
                  style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
                  ⤓ 原始檔案 ({origName})
                </a>
              ) : (
                <span style={{ color: 'var(--accent)', cursor: 'var(--cur-pointer,pointer)', fontWeight: 600 }}
                  onClick={async () => {
                    // 保存在此瀏覽器中的原始檔案（4.3 — 備份用途）
                    const b = await getBlob(origFileId);
                    if (!b) return;
                    const u = URL.createObjectURL(b);
                    const a = document.createElement('a');
                    a.href = u; a.download = origName ?? 'log.txt';
                    a.click();
                    URL.revokeObjectURL(u);
                  }}>
                  ⤓ 原始檔案 ({origName})
                </span>
              )
          )}
        </p>
      </div>

      {/* 日誌資訊修改 Modal — 中繼資料＋替換本文（檔案／直接修改）＋替換縮圖（圖片／顏色） */}
      <Modal open={eOpen} onClose={() => setEOpen(false)} title="修改日誌資訊"
        dirty
        actions={<>
          <button className="btn btn-ghost" onClick={() => setEOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={saveEdit}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <KInput placeholder="劇本標題（必填）" value={e.title} onChange={ev => setE(s => ({ ...s, title: ev.target.value }))} />
            {/* № 位置的顯示文字可直接完整輸入 — 留空則自動 № 0XX */}
            <KInput placeholder="№ 顯示（選填 — 留空則自動）" value={e.noText} onChange={ev => setE(s => ({ ...s, noText: ev.target.value }))}
              style={{ maxWidth: 200 }} />
          </div>
          <KInput placeholder="標語（選填）" value={e.catchphrase} onChange={ev => setE(s => ({ ...s, catchphrase: ev.target.value }))} />
          <div style={{ display: 'flex', gap: 8 }}>
            <KInput placeholder="作者（選填）" value={e.writer} onChange={ev => setE(s => ({ ...s, writer: ev.target.value }))} />
            <KInput placeholder="同行者（選填）" value={e.withText} onChange={ev => setE(s => ({ ...s, withText: ev.target.value }))} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={e.relId} onChange={v => setE(s => ({ ...s, relId: v }))}
              options={[{ value: 'none', label: '無自設關係連結' }, ...rels.map(r => ({ value: r.id, label: r.name }))]} />
            <KDate value={e.date} onChange={v => setE(s => ({ ...s, date: v }))} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={e.visibility} onChange={v => setE(s => ({ ...s, visibility: v as TrpgLog['visibility'] }))}
              options={[
                { value: 'public', label: '完全公開' },
                { value: 'member', label: '會員公開' },
                { value: 'private', label: '僅自己可見' },
              ]} />
            <KInput placeholder="查看密碼（選填）" value={e.password} onChange={ev => setE(s => ({ ...s, password: ev.target.value }))} style={{ flex: 1 }} />
          </div>
          {/* 列表顯示 — 與存取權限分開（v2.0 使用者要求） */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span className="cp-lb">列表</span>
            <KSelect minWidth={140} value={e.listHidden ? 'hidden' : 'show'}
              onChange={v => setE(s => ({ ...s, listHidden: v === 'hidden' }))}
              options={[
                { value: 'show', label: '顯示於列表' },
                { value: 'hidden', label: '從列表隱藏' },
              ]} />
          </div>

          {/* 替換縮圖 — 預設維持目前縮圖 */}
          <label className="k-label" style={{ margin: '4px 0 0' }}>縮圖</label>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={thumbMode === 'keep' ? 'on' : ''} onClick={() => setThumbMode('keep')}>目前維持</button>
            <button className={thumbMode === 'image' ? 'on' : ''} onClick={() => { setThumbMode('image'); if (!eThumb) eThumbRef.current?.click(); }}>替換圖片</button>
            <button className={thumbMode === 'color' ? 'on' : ''} onClick={() => setThumbMode('color')}>以顏色替換</button>
          </div>
          <input ref={eThumbRef} type="file" accept="image/*" style={{ display: 'none' }}
            onChange={ev => {
              const f = ev.target.files?.[0];
              if (f) { setEThumb(f); setEThumbUrl(URL.createObjectURL(f)); setEThumbCrop(undefined); setECropOpen(true); }
              ev.target.value = '';
            }} />
          {thumbMode === 'image' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div
                style={{
                  width: 128, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', cursor: 'var(--cur-pointer,pointer)',
                  border: '1.5px dashed var(--line)', flexShrink: 0, position: 'relative',
                }}
                onClick={() => eThumbRef.current?.click()}>
                {eThumbUrl && <CropImg src={eThumbUrl} crop={eThumbCrop} />}
              </div>
              {eThumb && (
                <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                  onClick={() => setECropOpen(true)}>✂ 調整位置・縮放</button>
              )}
            </div>
          )}
          {/* 目前維持 — 圖片保持不變，只調整位置・縮放（使用者要求） */}
          {thumbMode === 'keep' && l.thumbId && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                width: 128, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden',
                border: '1.5px solid var(--line)', flexShrink: 0, position: 'relative',
              }}>
                {curThumbUrl && <CropImg src={curThumbUrl} crop={eThumbCrop} />}
              </div>
              <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                disabled={!curThumbUrl} onClick={() => setECropOpen(true)}>✂ 調整位置・縮放</button>
            </div>
          )}
          {thumbMode === 'color' && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{
                width: 128, aspectRatio: '16/9', borderRadius: 8, flexShrink: 0,
                border: '1.5px solid var(--line)',
                background: eColorMode === 'grad' ? `linear-gradient(135deg, ${eC1} 0%, ${eC2} 100%)` : eC1,
              }} />
              <div className="mini-seg">
                <button className={eColorMode === 'grad' ? 'on' : ''} onClick={() => setEColorMode('grad')}>漸層</button>
                <button className={eColorMode === 'solid' ? 'on' : ''} onClick={() => setEColorMode('solid')}>單色</button>
              </div>
              <ColorField value={eC1} onChange={setEC1} />
              {eColorMode === 'grad' && (
                <>
                  <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                  <ColorField value={eC2} onChange={setEC2} />
                </>
              )}
            </div>
          )}

          {/* 本文替換 — 預設維持目前本文 */}
          <label className="k-label" style={{ margin: '4px 0 0' }}>本文</label>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={bodyMode === 'keep' ? 'on' : ''} onClick={() => setBodyMode('keep')}>目前維持</button>
            {/* 下方顯示方式區段與本文替換無關 — 儲存時一律會套用 */}
            <button className={bodyMode === 'text' ? 'on' : ''} onClick={() => { setBodyMode('text'); if (!eText) setEText(bodyText ?? ''); }}>直接修改</button>
            <button className={bodyMode === 'file' ? 'on' : ''} onClick={() => setBodyMode('file')}>上傳檔案</button>
          </div>
          {bodyMode === 'file' && (
            <>
              <input ref={eFileRef} type="file" accept=".txt,.html,.htm,text/*" style={{ display: 'none' }}
                onChange={ev => { const f = ev.target.files?.[0]; if (f) setEFile(f); ev.target.value = ''; }} />
              <div className="upzone" style={{ marginBottom: 0 }} onClick={() => eFileRef.current?.click()}
                onDragOver={ev => ev.preventDefault()}
                onDrop={ev => { ev.preventDefault(); const f = ev.dataTransfer.files?.[0]; if (f) setEFile(f); }}>
                {eFile
                  ? <b>{eFile.name} — 儲存時將使用此檔案替換本文</b>
                  : <b>拖曳 .txt / .html 檔案至此處，或點擊選擇</b>}
              </div>
            </>
          )}
          {bodyMode === 'text' && (
            <KTextarea style={{ minHeight: 160, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}
              placeholder="完整貼上 HTML 程式碼或直接撰寫文字" value={eText} onChange={ev => setEText(ev.target.value)} />
          )}

          {/* 本文顯示方式（v2.0）— 自動判斷有時會將直接撰寫的文章誤判為 HTML，因此可以手動選擇 */}
          <label className="k-label" style={{ margin: '4px 0 0' }}>本文顯示</label>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={bodyDisp === 'auto' ? 'on' : ''} onClick={() => setBodyDisp('auto')}>自動</button>
            <button className={bodyDisp === 'text' ? 'on' : ''} onClick={() => setBodyDisp('text')}>純文字</button>
            <button className={bodyDisp === 'html' ? 'on' : ''} onClick={() => setBodyDisp('html')}>以 HTML 顯示</button>
          </div>
          <p className="hint" style={{ margin: 0 }}>
            自動會根據內容進行判斷 — 如果直接撰寫的文字中出現像 &lt;標籤&gt; 的內容，可能會被誤判為 HTML，這時請選擇「純文字」。
          </p>
        </div>
      </Modal>

      {/* 縮圖裁切編輯器（6.1 — 16:9 票券規格） */}
      {/* 如果有新選擇的圖片，就使用該圖片；「目前維持」則以目前縮圖為對象 */}
      {(eThumbUrl || (thumbMode === 'keep' && curThumbUrl)) && (
        <CropEditor open={eCropOpen} src={eThumbUrl || curThumbUrl!} aspect="16:9" initial={eThumbCrop}
          onClose={() => setECropOpen(false)}
          onApply={c => { setEThumbCrop(c); setECropOpen(false); }} />
      )}

      <ConfirmModal open={delAsk} title="確定要刪除日誌嗎？" body="刪除後的日誌無法復原。"
        onClose={() => setDelAsk(false)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => {
            setLogs(logs.filter(x => x.id !== l.id));
            setBodies(bodies.filter(x => x.id !== l.id));   // 分開儲存的本文也一併刪除（v2.0）
            router.push(tt.href);
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelAsk(false) },
        ]} />
    </section>
  );
}