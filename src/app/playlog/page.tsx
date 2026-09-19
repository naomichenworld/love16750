'use client';
// TRPG 遊玩紀錄 (4.16) — 表格格式 · Date 排序 · 搜尋 · 分頁 ·
// Url 欄位使用剪輯圖示（新分頁） · 有連結日誌時點擊 Playtime 可前往日誌
import React, { Suspense, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter, secQuery } from '@/lib/sectionStore';
import { useLocalList } from '@/lib/postStore';
import { PlayRecord, PLAYLOG_SEED } from '@/lib/galleryStore';
import { useMenuSettings } from '@/lib/menuStore';
import { useMainStore } from '@/lib/mainStore';
import { useCardSort, mergeOrder } from '@/lib/cardSort';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const PAGE_SIZE = 15;

/** 剪輯圖示（線條圖示 — 非 Emoji） */
function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 13, height: 13, stroke: 'currentColor', fill: 'none', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <path d="M21 12.5 12.2 21.3a5.6 5.6 0 0 1-8-8L13.5 4a3.7 3.7 0 0 1 5.3 5.3l-9.2 9.2a1.9 1.9 0 0 1-2.7-2.7l8.5-8.4" />
    </svg>
  );
}

function PlaylogPageInner() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [recordsAll, setRecordsAll, loaded] = useLocalList<PlayRecord>('ohome.playlog.v1', PLAYLOG_SEED);
  // 多個區段 (v2.0) — 只顯示網址中的 ?s= 所指定的區段
  const sec = useSectionParam('playlog');
  const records = filterSection(recordsAll, sec.id);
  // 儲存時只替換這個區段的位置 — 即使直接傳入篩選後的列表，也不會刪除其他區段
  const setRecords = sectionSetter(recordsAll, sec.id, setRecordsAll);
  const [q, setQ] = useState('');
  const [desc, setDesc] = useState(true);       // Date 排序方向
  const [page, setPage] = useState(1);
  const [delFor, setDelFor] = useState<PlayRecord | null>(null);

  // 顯示欄位 — 在環境設定 > 選單管理中分別選擇 PC／手機版本 (4.16 v1.8)
  const [menuSet] = useMenuSettings();
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:620px)');
    const f = () => setIsMobile(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);
  const cols = isMobile ? menuSet.playlogMobile : menuSet.playlogPc;
  const show = (k: string) => cols.includes(k);

  // 編輯模式資料列拖曳排序 (v1.9) — 編輯期間不進行排序與分頁，顯示完整儲存順序
  const { editOn } = useMainStore();
  const rowSort = useCardSort(records, next => setRecords(mergeOrder(records, next)), editOn && isAdmin);

  if (!loaded) return <section className="page" />;

  const query = q.trim().toLowerCase();
  const filtered = records.filter(r => !query
    || r.scenario.toLowerCase().includes(query)
    || r.writer.toLowerCase().includes(query)
    || r.withText.toLowerCase().includes(query));

  // Date 排序 — 沒有日期的紀錄永遠排在最下面 (4.16)
  const sorted = [...filtered].sort((a, b) => {
    if (!a.date && !b.date) return 0;
    if (!a.date) return 1;
    if (!b.date) return -1;
    return desc ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date);
  });
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  // 編輯模式：顯示完整儲存順序（與拖曳索引 1:1 對應）
  const shown = editOn ? records : sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 手機專用 — 沒有 URL 欄位，因此透過 Playtime 下劃線點擊前往日誌 (4.16)
  const openLogMobile = (r: PlayRecord) => {
    if (r.logId && window.matchMedia('(max-width:620px)').matches) router.push(`/trpg/${r.logId}`);
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'PLAY LOG' : sec.name}</PageTitle>
        <EditableDesc k="playlog-desc" def="曾參加過的 Session 紀錄 — 表格格式" />
        <div className="head-actions">
          <SearchBar placeholder="搜尋劇本・作者・同行" onSearch={v => { setQ(v); setPage(1); }} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/playlog/new' + secQuery('playlog', sec.id))}>＋ ADD RECORD</button>}
        </div>
      </div>

      <div className="panel" style={{ padding: '10px 16px 16px', overflowX: 'auto' }}>
        <table className="pl-table">
          {/* 欄位配置 — 在環境設定 > 選單管理中分別選擇 PC／手機版本 (4.16 v1.8) */}
          <colgroup>
            {show('date') && <col className="c-date" />}
            {show('scenario') && <col className="c-sc" />}
            {show('writer') && <col className="c-wr" />}
            {show('with') && <col className="c-with" />}
            {show('role') && <col className="c-role" />}
            {show('playtime') && <col className="c-pt" />}
            {show('url') && <col className="c-url" />}
            {isAdmin && !isMobile && <col className="c-mng" />}
          </colgroup>
          <thead>
            <tr>
              {show('date') && (
                <th className="sortable" onClick={() => { if (!editOn) setDesc(d => !d); }}>
                  Date {editOn ? '⠿' : desc ? '▾' : '▴'}
                </th>
              )}
              {show('scenario') && <th>Scenario</th>}
              {show('writer') && <th>Writer</th>}
              {show('with') && <th>With</th>}
              {show('role') && <th>Role</th>}
              {show('playtime') && <th>Playtime</th>}
              {show('url') && <th aria-label="Url" />}
              {isAdmin && !isMobile && <th aria-label="管理" />}
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={r.id} {...(editOn ? rowSort(i) : {})}>
                {show('date') && <td className="td-date">{r.date ? r.date.replace(/-/g, '.') : ''}</td>}
                {show('scenario') && (
                  <td className="td-sc">
                    {r.scenarioLink
                      ? <a href={r.scenarioLink} target="_blank" rel="noreferrer" data-tip="劇本連結（新分頁）">{r.scenario}</a>
                      : r.scenario}
                  </td>
                )}
                {show('writer') && <td>{r.writer}</td>}
                {show('with') && <td>{r.withText}</td>}
                {show('role') && <td className="td-role">{r.role}</td>}
                {show('playtime') && (
                  <td className={`td-pt ${r.logId ? 'linked' : ''}`}
                    onClick={() => openLogMobile(r)}>
                    {r.playtime}
                  </td>
                )}
                {/* 剪輯欄位 — 外部 URL 或備份日誌連結 (4.16) */}
                {show('url') && (
                  <td className="td-url">
                    {r.url ? (
                      <a href={r.url} target="_blank" rel="noreferrer" data-tip="開啟連結（新分頁）"><ClipIcon /></a>
                    ) : r.logId ? (
                      <a data-tip="查看備份日誌" style={{ cursor: 'var(--cur-pointer,pointer)' }}
                        onClick={() => router.push(`/trpg/${r.logId}`)}><ClipIcon /></a>
                    ) : null}
                  </td>
                )}
                {isAdmin && !isMobile && (
                  <td className="td-mng">
                    <button onClick={() => router.push(`/playlog/${r.id}/edit`)} data-tip="編輯">✎</button>
                    <button onClick={() => setDelFor(r)} data-tip="刪除">✕</button>
                  </td>
                )}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr><td colSpan={cols.length + (isAdmin && !isMobile ? 1 : 0)} style={{ textAlign: 'center', padding: 32, color: 'var(--faint)' }}>
                {query ? '沒有搜尋結果' : '目前沒有紀錄'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
        {!editOn && <Pager page={page} total={totalPages} onChange={setPage} />}
      </div>

      <ConfirmModal open={delFor !== null} title="確定要刪除紀錄嗎？"
        body={`"${delFor?.scenario}" — 刪除後將無法復原。`}
        onClose={() => setDelFor(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setRecords(records.filter(x => x.id !== delFor!.id)); setDelFor(null); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelFor(null) },
        ]} />
    </section>
  );
}

/** 需要讀取 ?s=，因此需要 Suspense 邊界（Next App Router） */
export default function PlaylogPage() {
  return <Suspense fallback={<section className="page" />}><PlaylogPageInner /></Suspense>;
}