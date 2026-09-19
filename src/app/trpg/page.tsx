'use client';
// TRPG 日誌備份（4.3）— 票券型／基本型面板 · 右側自設關係徽章篩選 · ＋ ADD LOG
// 本文輸入 3 種方式：檔案上傳（.txt/.html 內容自動判斷）／HTML 貼上／直接撰寫
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secStamp } from '@/lib/sectionStore';
import { useLocalList, newId } from '@/lib/postStore';
import { TrpgLog, TRPG_SEED, TrpgLogBody, TRPG_BODY_SEED, bodyVisibility, decodeLogText, logNo, saveLogBody } from '@/lib/galleryStore';
import { Relation, REL_SEED } from '@/lib/charStore';
import { SearchBar, KInput, KTextarea, KRadio, KSelect, KDate, Pager } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';
import { putBlob } from '@/lib/blobStore';
import { ColorField } from '@/components/ui/ColorField';
import { CropEditor, CroppedBlobImg, CropValue, CropImg } from '@/components/ui/CropEditor';
import { useToast } from '@/components/ui/Toast';

import { useSiteSettings } from '@/lib/siteStore';
import { useMainStore } from '@/lib/mainStore';
import { mergeOrder } from '@/lib/cardSort';
import { DragList } from '@/components/ui/DragList';
import { OrderMenu, orderNoOf, moveToOrder } from '@/components/ui/OrderMenu';

function TrpgPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const [site] = useSiteSettings(); // 票券底部文字 = Logo 副標題（5.2 連動）
  const [logsAll, setLogsAll] = useLocalList<TrpgLog>('ohome.trpg.v1', TRPG_SEED);
  // 多個區段（v2.0）— 只顯示網址 ?s= 所指定的區段
  const sec = useSectionParam('trpg');
  const logs = filterSection(logsAll, sec.id);
  // 儲存時只替換這個區段的位置 — 即使直接傳入篩選後的列表，也不會刪除其他區段
  const setLogs = sectionSetter(logsAll, sec.id, setLogsAll);
  // 本文與列表分開儲存（v2.0）— 為了讓僅自己可見的日誌也能出現在列表中，列表文件的查詢條件
  // 對 listHidden 放寬了；如果本文也放在一起，本文也會透過該查詢一起洩漏
  const [bodies, setBodies] = useLocalList<TrpgLogBody>('ohome.trpgbody.v1', TRPG_BODY_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const { editOn } = useMainStore();          // 編輯模式 — 上方工具列切換（與其他列表共用）
  const [filter, setFilter] = useState<string>('all');
  const [skin, setSkin] = useState<'ticket' | 'basic'>('ticket');
  const [q, setQ] = useState('');
  // 手機版不使用票券面板，一律使用基本型列表 — 避免在窄螢幕下票券版面變形（v1.9 使用者確認）
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:620px)');
    const f = () => setIsMobile(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  // ADD LOG Modal
  const [addOpen, setAddOpen] = useState(false);
  const [nNo, setNNo] = useState('');          // № 顯示文字 — 留空時自動 № 0XX
  const [nVis, setNVis] = useState<'public' | 'member' | 'private'>('public'); // 存取權限
  const [nListHidden, setNListHidden] = useState(false);   // 是否顯示於列表（v2.0 — 與存取權限分開）
  const [nPw, setNPw] = useState('');          // 查看密碼（選填）
  const [nTitle, setNTitle] = useState('');
  const [nCatch, setNCatch] = useState('');
  const [nWriter, setNWriter] = useState('');
  const [nWith, setNWith] = useState('');
  const [nRel, setNRel] = useState('none');
  const [nDate, setNDate] = useState('');
  const [nMode, setNMode] = useState<'file' | 'paste'>('paste');
  const [nBody, setNBody] = useState('');
  const [nFileName, setNFileName] = useState('');
  const [nFile, setNFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // 縮圖（選填）— 圖片或純色／漸層（v1.9 使用者要求）
  const [nThumb, setNThumb] = useState<File | null>(null);
  const [nThumbUrl, setNThumbUrl] = useState('');
  const [nColorMode, setNColorMode] = useState<'grad' | 'solid'>('grad');
  const [nThumbCrop, setNThumbCrop] = useState<CropValue | undefined>(undefined);
  const [cropOpen, setCropOpen] = useState(false);
  const [nC1, setNC1] = useState('#4c5a6e');
  const [nC2, setNC2] = useState('#242b36');
  const thumbRef = useRef<HTMLInputElement>(null);

  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    logs.forEach(l => { const k = l.relId ?? 'none'; m[k] = (m[k] ?? 0) + 1; });
    return m;
  }, [logs]);

  // 是否顯示於列表只由 listHidden 決定 — 存取權限（visibility）只決定「誰可以開啟」
  // 並不決定是否出現在列表中（v2.0 使用者確認：「即使僅自己可見也應該顯示在列表中」）。
  // 是否能開啟由詳細頁面再次獨立確認，因此即使出現在列表中也不會洩漏內容
  const canOpen = (l: TrpgLog) => isAdmin || l.visibility === 'public' || (l.visibility === 'member' && !!user);
  const visible = logs
    // 隱藏列表 — 管理員在非編輯模式下也看不到（用於整理列表，v2.0 使用者要求）。
    // 編輯模式下管理員可以例外看到，以便恢復
    .filter(l => !l.listHidden || (isAdmin && editOn))
    .filter(l => filter === 'all' || (filter === 'none' ? !l.relId : l.relId === filter))
    .filter(l => !q || l.title.includes(q) || l.writer.includes(q) || l.withText.includes(q));
  // 排序基準是儲存順序 — 編輯模式中透過拖曳修改的順序會直接反映在列表中（v2.0）。
  // 新日誌會放在前面，因此預設仍像之前一樣按照最新順序排列，而 № 編號只作為顯示用途。

  // 編輯模式卡片拖曳排序（v2.0 — 與角色列表相同的方式）
  // 拖曳排序 — 與其他頁面使用相同方式（v2.0 使用者要求：「參考其他頁面的拖放
  // 一樣實作」）。
  // · 票券型（垂直單列列表）與其他列表型頁面完全相同的 DragList — 拿起拖曳控制點後會
  //   平順地推開其他項目，放下後準確停在指定位置。
  // · 基本型（2 欄網格）不能直接使用 DragList，因為它預設為垂直單列 — 位置預覽仍照常顯示，
  //   但儲存（寫入伺服器）會在放開滑鼠時只執行一次，因此在此頁面直接實作。舊版 cardSort
  //   會在經過每個位置時都進行儲存（拖曳期間數十次），因此在伺服器模式下看起來會一頓一頓 —
  //   已移除該原因
  const gridSort = editOn && isAdmin;
  const [gridPreview, setGridPreview] = useState<TrpgLog[] | null>(null);
  const gridFromRef = useRef<number | null>(null);
  const basicShown = gridPreview ?? visible;

  /* ---------- 分頁（v2.0 使用者要求） ----------
     票券型一張較大，因此每頁 6 個；基本型一列放兩個，因此即使看到 20 個也不會太擁擠。
     拖曳排序以 `visible` 全部項目為基準處理（如下方 reorderPage·gridDragProps），
     因此即使在第 2 頁修改順序，項目也不會被拉到最前面。 */
  const ticketView = skin === 'ticket' && !isMobile;
  const PER_LOG = ticketView ? 6 : 20;
  const [logPage, setLogPage] = useState(1);
  const logPages = Math.max(1, Math.ceil(visible.length / PER_LOG));
  const logCur = Math.min(logPage, logPages);        // 因篩選而減少導致頁面消失時，拉回最後一頁
  const logStart = (logCur - 1) * PER_LOG;
  // 修改篩選、搜尋、檢視方式後從第 1 頁開始
  useEffect(() => { setLogPage(1); }, [filter, q, ticketView]);
  const pageLogs = visible.slice(logStart, logStart + PER_LOG);

  /** 將此頁面內修改後的順序重新放回完整順序 —
   * 如果只傳入目前顯示的項目，mergeOrder 會把這批項目移到最前面 */
  const reorderPage = (nextPage: TrpgLog[]) => {
    const nextVisible = [...visible];
    nextVisible.splice(logStart, nextPage.length, ...nextPage);
    setLogs(mergeOrder(logs, nextVisible));
  };

  /* ---------- 依編號移動位置（v2.0 使用者要求） ----------
     有分頁後，無法直接把第 1 頁的項目拖到第 3 頁 — 透過右鍵輸入編號來移動。
     編號不會被儲存，而是在位置上產生（10、20、30……）。透過拖曳改變排列後，編號也會自動調整。 */
  const [ordFor, setOrdFor] = useState<{ id: string; x: number; y: number } | null>(null);
  const ordIdx = ordFor ? visible.findIndex(l => l.id === ordFor.id) : -1;
  const openOrder = (e: React.MouseEvent, id: string) => {
    if (!isAdmin) return;
    e.preventDefault();
    setOrdFor({ id, x: e.clientX, y: e.clientY });
  };
  const applyOrder = (wanted: number) => {
    if (ordIdx >= 0) setLogs(mergeOrder(logs, moveToOrder(visible, ordIdx, wanted)));
    setOrdFor(null);
  };
  const gridDragProps = (i: number): React.HTMLAttributes<HTMLDivElement> => {
    if (!gridSort) return {};
    return {
      draggable: true,
      onDragStart: () => { gridFromRef.current = i; setGridPreview(null); },
      onDragOver: e => {
        e.preventDefault();
        const from = gridFromRef.current;
        if (from == null || from === i) return;
        const cur = gridPreview ?? visible;
        const next = [...cur];
        const [moved] = next.splice(from, 1);
        next.splice(i, 0, moved);
        gridFromRef.current = i;
        setGridPreview(next);
      },
      onDrop: e => e.preventDefault(),
      onDragEnd: () => {
        gridFromRef.current = null;
        setGridPreview(p => {
          if (p) setLogs(mergeOrder(logs, p));   // 放開時只儲存一次
          return null;
        });
      },
      style: { cursor: 'var(--cur-grab,grab)' },
    };
  };

  const decodeText = decodeLogText; // 共用工具（galleryStore）

  const readFile = (f: File | undefined) => {
    if (!f) return;
    setNFileName(f.name);
    setNFile(f); // 保留原始檔案用（4.3）
    // 用於預覽文字字數顯示 — 登錄時會直接重新從檔案讀取，因此不會有 race condition
    decodeText(f).then(setNBody);
  };

  const add = async () => {
    if (!nTitle.trim()) { toast('請輸入劇本標題'); return; }
    const id = newId();
    // 如果有檔案，在登錄時直接讀取 — 即使在讀取完成前按下 ADD，本文也不會是空的
    const bodyText = nFile ? await decodeText(nFile) : nBody;
    const log: TrpgLog = {
      id,
      no: Math.max(0, ...logs.map(l => l.no)) + 1, // 內部順序編號（排序用）
      noText: nNo.trim() || undefined,             // № 顯示文字 — 留空時自動 № 0XX
      title: nTitle.trim(), catchphrase: nCatch.trim() || undefined,
      writer: nWriter.trim(), withText: nWith.trim(),
      relId: nRel === 'none' ? undefined : nRel,
      date: nDate || undefined, ph: 'cool',
      visibility: nVis,
      password: nPw.trim() || undefined,
      listHidden: nListHidden,
      // 縮圖：圖片（選填）或純色／漸層
      thumbId: nThumb ? await putBlob(nThumb) : undefined,
      thumbCrop: nThumb ? nThumbCrop : undefined,
      thumbColor: nThumb ? undefined : { c1: nC1, c2: nColorMode === 'grad' ? nC2 : undefined },
    };
    // 本文／原始檔案另外儲存為獨立文件（v2.0）— 如果與列表文件(log)放在同一處，即使僅自己可見，
    // 一旦出現在列表中也會一起洩漏。此文件的查看權限會直接遵循日誌實際的 visibility
    const body: TrpgLogBody = {
      id,
      // 本文儲存位置由 saveLogBody 決定（伺服器模式直接存文件 · 本地模式或檔案過大時則存為檔案）
      ...(await saveLogBody(bodyText)),
      // 原始上傳檔案保持原樣保存（4.3 — 備份用途，IndexedDB → R2 預計移轉）
      originalFileId: nFile ? await putBlob(nFile) : undefined,
      originalName: nFile?.name,
      visibility: bodyVisibility(log),
      ...secStamp(sec.id),   // 所屬區段（v2.0）— 本文文件也會套用私密判定
    };
    setLogs([log, ...logs]);
    // 本文文件要**放在後面**（v2.0 Fork 回報）— 如果插入最前面，既有本文全部的位置都會被推動
    // 而需要重新儲存，在大型本文累積的首頁中，總量會超過單次寫入限制而導致儲存失敗。
    // 本文只透過 id 尋找，因此順序沒有任何意義。
    setBodies([...bodies, body]);
    setAddOpen(false);
    setNNo(''); setNVis('public'); setNPw(''); setNListHidden(false); setNTitle(''); setNCatch(''); setNWriter(''); setNWith(''); setNBody(''); setNFileName(''); setNDate(''); setNFile(null);
    setNThumb(null); setNThumbUrl(''); setNThumbCrop(undefined);
    toast(nFile ? '日誌已登錄 — 原始檔案也會保留' : '日誌已登錄');
  };

  // 票券縮圖 — 上傳圖片 > 指定顏色（純色／漸層）> Demo ph
  const thumbStyle = (l: TrpgLog): React.CSSProperties | undefined =>
    l.thumbColor
      ? { background: l.thumbColor.c2 ? `linear-gradient(135deg, ${l.thumbColor.c1} 0%, ${l.thumbColor.c2} 100%)` : l.thumbColor.c1 }
      : undefined;

  // sp: 編輯模式拖曳排序 props（與其他列表相同的方式，v2.0）
  const Ticket = ({ l }: { l: TrpgLog }) => (
    <div className="ticket"
      onContextMenu={e => openOrder(e, l.id)}
      onClick={() => { if (!editOn) router.push(`/trpg/${l.id}`); }}>
      <div className="stub-line" />
      <div className={`wide ${!l.thumbId && !l.thumbColor ? `ph ${l.ph}` : ''}`} style={thumbStyle(l)}>
        {l.thumbId && <CroppedBlobImg fileRef={l.thumbId} crop={l.thumbCrop} />}
        <span className="no">{l.noText ? `ADMIT ONE · ${l.noText}` : `ADMIT ONE · LOG ${String(l.no).padStart(3, '0')}`}</span>
        {!l.thumbId && !l.thumbColor && <span>WIDE THUMBNAIL</span>}
      </div>
      <div className="stub">
        <div className="sc-title" style={l.serifTitle ? { fontFamily: 'var(--serif)', letterSpacing: '.12em' } : undefined}>
          {/* 與其他列表型頁面相同的拖曳控制點 — 必須拿起來才能拖曳（v2.0） */}
          {editOn && <span className="drag-h" style={{ marginRight: 8 }}>⠿</span>}
          {l.title}
        </div>
        {/* 僅在編輯模式下 — 目前是列表隱藏，因此只有管理員會例外看到（v2.0） */}
        {editOn && l.listHidden && <span className="pill" style={{ marginTop: 4 }}>隱藏</span>}
        {l.catchphrase && <div className="sc-catch">{l.catchphrase}</div>}
        {/* 現在即使僅自己可見等內容也會出現在列表中（v2.0），無法開啟的日誌會顯示無法開啟的原因 */}
        {!canOpen(l) && (
          <div className="row"><b>查看</b> {l.password ? '需要密碼' : '沒有權限'}</div>
        )}
        {l.writer && <div className="row"><b>作者</b> {l.writer}</div>}
        {l.withText && <div className="row"><b>同行者</b> {l.withText}</div>}
        {l.date && <div className="row"><b>日期</b> {l.date.replace(/-/g, '.')}</div>}
        <div className="adm"><span>{site.subtitle}</span><span>{logNo(l)}</span></div>
      </div>
    </div>
  );

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'TRPG LOG' : sec.name}</PageTitle>
        <EditableDesc k="trpg-desc" def="票券型面板 · 可個別設定劇本標題字體 · 透過右側自設關係徽章篩選" />
        <div className="head-actions">
          <SearchBar onSearch={setQ} />
          {isAdmin && <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }} onClick={() => setAddOpen(true)}>＋ ADD LOG</button>}
        </div>
      </div>
      <div className="trpg-layout">
        <div>
          {ticketView
            ? (
              // 與其他列表型頁面相同的 DragList — 拿起拖曳控制點後平順推開其他項目，放下後停在指定位置（v2.0）
              <DragList items={pageLogs} keyOf={l => l.id}
                onReorder={reorderPage}
                disabled={!(editOn && isAdmin)}
                render={l => <Ticket l={l} />} />
            )
            : (
              // 基本型 — 一列兩個，不顯示編號，只顯示標題（v2.0 使用者確認）。
              // DragList 預設為垂直單列列表，因此無法用於 2 欄網格 — 位置預覽仍照常顯示
              // 儲存則在放開滑鼠時只執行一次（gridDragProps，參見上方）
              <div className="panel flush trpg-basic">
                {basicShown.slice(logStart, logStart + PER_LOG).map((l, i) => (
                  // 拖曳位置以完整列表為基準傳入 — 若只傳入頁面內位置，第 2 頁會產生偏移
                  <div key={l.id} className="list-item" {...gridDragProps(logStart + i)}
                    onContextMenu={e => openOrder(e, l.id)}
                    onClick={() => { if (!editOn) router.push(`/trpg/${l.id}`); }}>
                    {editOn && <span className="drag-h">⠿</span>}
                    <div className={`th ${!l.thumbId && !l.thumbColor ? `ph ${l.ph}` : ''}`} style={{ ...thumbStyle(l), position: 'relative' }}>
                      {l.thumbId && <CroppedBlobImg fileRef={l.thumbId} crop={l.thumbCrop} />}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <b>{l.title}</b>
                      {/* 僅在編輯模式下 — 因列表隱藏，所以只有管理員會例外看到（v2.0） */}
                      {editOn && l.listHidden && <span className="pill" style={{ marginLeft: 6 }}>隱藏</span>}
                      {/* 現在即使僅自己可見等內容也會出現在列表中（v2.0）— 無法開啟的日誌會顯示無法開啟的原因 */}
                      {!canOpen(l) && <span className="pill" style={{ marginLeft: 6 }}>{l.password ? '需要密碼' : '私密'}</span>}
                      <small>{[l.writer, l.withText].filter(Boolean).join(' · ')}{l.date ? ` · ${l.date.replace(/-/g, '.')}` : ''}</small>
                    </div>
                  </div>
                ))}
              </div>
            )}
          {/* 分頁器置中，數量顯示在最右側（v2.0 — 與自設關係問題列表相同的方式） */}
          {visible.length > PER_LOG && (
            <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
              <span />
              <Pager page={logCur} total={logPages} onChange={setLogPage} />
              <small style={{ color: 'var(--faint)', fontSize: 10.5, justifySelf: 'end' }}>總計 {visible.length} 項</small>
            </div>
          )}
          {visible.length === 0 && (
            <div className="panel" style={{ textAlign: 'center', padding: 44, fontSize: 13, color: 'var(--faint)' }}>
              目前沒有日誌
            </div>
          )}
          {/* 右鍵 > 順序編號（v2.0 使用者要求） */}
          {ordFor && ordIdx >= 0 && (
            <OrderMenu at={ordFor} current={orderNoOf(ordIdx)} total={visible.length}
              onApply={applyOrder} onClose={() => setOrdFor(null)} />
          )}
        </div>
        {/* 自設關係連動篩選（v1.2） */}
        <div className="panel tagside">
          <h4>自設關係篩選</h4>
          <div className={`tag ${filter === 'all' ? 'on' : ''}`} onClick={() => setFilter('all')}>
            全部 <small>{logs.length}</small>
          </div>
          {rels.filter(r => counts[r.id]).map(r => (
            <div key={r.id} className={`tag ${filter === r.id ? 'on' : ''}`} onClick={() => setFilter(r.id)}>
              {r.name} <small>{counts[r.id]}</small>
            </div>
          ))}
          {counts['none'] > 0 && (
            <div className={`tag ${filter === 'none' ? 'on' : ''}`} onClick={() => setFilter('none')}>
              單篇 <small>{counts['none']}</small>
            </div>
          )}
          {/* 手機版一律使用基本型 — 隱藏面板選擇（v1.9） */}
          {!isMobile && (
            <>
              <h4 style={{ marginTop: 18 }}>檢視</h4>
              <KRadio name="tsk" value="ticket" current={skin} onChange={v => setSkin(v as 'ticket')} label="票券型" />
              <div style={{ height: 7 }} />
              <KRadio name="tsk" value="basic" current={skin} onChange={v => setSkin(v as 'basic')} label="基本型" />
            </>
          )}
        </div>
      </div>

      {/* ＋ ADD LOG（4.3 — 本文輸入 3 種方式） */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="登錄日誌"
        desc="本文：檔案上傳（.txt/.html — 內容自動判斷）或貼上／直接撰寫"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setAddOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={add}>ADD</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <KInput placeholder="劇本標題（必填）" value={nTitle} onChange={e => setNTitle(e.target.value)} />
            {/* № 顯示文字可全部自行輸入 — 留空時自動 № 0XX */}
            <KInput placeholder="№ 顯示（選填 — 留空時自動）" value={nNo} onChange={e => setNNo(e.target.value)}
              style={{ maxWidth: 200 }} />
          </div>
          <KInput placeholder="標語（選填）" value={nCatch} onChange={e => setNCatch(e.target.value)} />
          <div style={{ display: 'flex', gap: 8 }}>
            <KInput placeholder="作者（選填）" value={nWriter} onChange={e => setNWriter(e.target.value)} />
            <KInput placeholder="同行者（選填）" value={nWith} onChange={e => setNWith(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={nRel} onChange={setNRel}
              options={[{ value: 'none', label: '無自設關係連動' }, ...rels.map(r => ({ value: r.id, label: r.name }))]} />
            <KDate value={nDate} onChange={setNDate} style={{ flex: 1 }} />
          </div>
          {/* 存取權限＋查看密碼（選填）— 即使沒有權限，只要知道密碼也可以查看。
              已連動自設關係的對方（會員－角色連結）一律可以查看 — 連結功能為第 3 階段 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <KSelect minWidth={140} value={nVis} onChange={v => setNVis(v as 'public')}
              options={[
                { value: 'public', label: '完全公開' },
                { value: 'member', label: '會員公開' },
                { value: 'private', label: '僅自己可見' },
              ]} />
            <KInput placeholder="查看密碼（選填）" value={nPw} onChange={e => setNPw(e.target.value)} style={{ flex: 1 }} />
          </div>
          {/* 列表顯示 — 與存取權限分開（v2.0 使用者要求）。即使隱藏，透過直接連結／密碼仍可正常開啟 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
            <span className="cp-lb">列表</span>
            <KSelect minWidth={140} value={nListHidden ? 'hidden' : 'show'}
              onChange={v => setNListHidden(v === 'hidden')}
              options={[
                { value: 'show', label: '顯示於列表' },
                { value: 'hidden', label: '從列表隱藏' },
              ]} />
          </div>

          {/* 縮圖（選填）— 圖片上傳或純色／漸層 */}
          <label className="k-label" style={{ margin: '4px 0 0' }}>縮圖（選填）</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div
              style={{
                width: 128, aspectRatio: '16/9', borderRadius: 8, overflow: 'hidden', cursor: 'var(--cur-pointer,pointer)',
                border: '1.5px dashed var(--line)', flexShrink: 0, position: 'relative',
                background: nThumbUrl ? undefined
                  : nColorMode === 'grad' ? `linear-gradient(135deg, ${nC1} 0%, ${nC2} 100%)` : nC1,
              }}
              onClick={() => thumbRef.current?.click()}>
              {nThumbUrl && <CropImg src={nThumbUrl} crop={nThumbCrop} />}
            </div>
            <input ref={thumbRef} type="file" accept="image/*" style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0];
                if (f) { setNThumb(f); setNThumbUrl(URL.createObjectURL(f)); setNThumbCrop(undefined); setCropOpen(true); }
                e.target.value = '';
              }} />
            {nThumb ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                  onClick={() => setCropOpen(true)}>✂ 調整位置・放大</button>
                <button className="btn btn-ghost" style={{ padding: '5px 11px', fontSize: 11 }}
                  onClick={() => { setNThumb(null); setNThumbUrl(''); setNThumbCrop(undefined); }}>移除圖片 → 使用顏色</button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="mini-seg">
                  <button className={nColorMode === 'grad' ? 'on' : ''} onClick={() => setNColorMode('grad')}>漸層</button>
                  <button className={nColorMode === 'solid' ? 'on' : ''} onClick={() => setNColorMode('solid')}>純色</button>
                </div>
                <ColorField value={nC1} onChange={setNC1} />
                {nColorMode === 'grad' && (
                  <>
                    <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
                    <ColorField value={nC2} onChange={setNC2} />
                  </>
                )}
              </div>
            )}
          </div>
          <div className="mini-seg" style={{ justifySelf: 'start' }}>
            <button className={nMode === 'paste' ? 'on' : ''} onClick={() => setNMode('paste')}>貼上／直接撰寫</button>
            <button className={nMode === 'file' ? 'on' : ''} onClick={() => setNMode('file')}>檔案上傳</button>
          </div>
          {nMode === 'file' ? (
            <>
              <input ref={fileRef} type="file" accept=".txt,.html,.htm,text/*" style={{ display: 'none' }}
                onChange={e => { readFile(e.target.files?.[0]); e.target.value = ''; }} />
              <div className="upzone" style={{ marginBottom: 0 }} onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); readFile(e.dataTransfer.files?.[0]); }}>
                {nFileName
                  ? <b>{nFileName} — 讀取完成（{nBody.length.toLocaleString()} 字）</b>
                  : <><b style={{ display: 'block', marginBottom: 3 }}>.txt / .html 檔案拖曳至此或點擊</b>直接使用 CrystalIA 等日誌工具的匯出檔案 — 內容自動判斷</>}
              </div>
            </>
          ) : (
            <KTextarea style={{ minHeight: 120, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12 }}
              placeholder="整段貼上 HTML 程式碼或直接撰寫文字" value={nBody} onChange={e => setNBody(e.target.value)} />
          )}
        </div>
      </Modal>

      {/* 縮圖裁切編輯器（6.1 — 16:9 票券規格） */}
      {nThumbUrl && (
        <CropEditor open={cropOpen} src={nThumbUrl} aspect="16:9" initial={nThumbCrop}
          onClose={() => setCropOpen(false)}
          onApply={c => { setNThumbCrop(c); setCropOpen(false); }} />
      )}
    </section>
  );
}

/** 需要讀取 ?s=，因此需要 Suspense 邊界（Next App Router） */
export default function TrpgPage() {
  return <Suspense fallback={<section className="page" />}><TrpgPageInner /></Suspense>;
}