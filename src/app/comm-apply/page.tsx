'use client';
// 申請者列表（4.18 v1.9）— 截止日期放大 + 狀態標籤（固定寬度）+ 申請者／申請日期 + 委託種類 +
// 鎖定圖示（自訂提示）· 右側篩選側欄（狀態別 + 委託別同時套用）·
// 僅在編輯模式下可拖曳排序 · 公開範圍位於環境設定 > 委託分頁
// v2.0：回收桶 — 一次清理已完成的申請，並可在保存期限（環境設定 > 委託）內復原。
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMainStore } from '@/lib/mainStore';
import { useLocalList } from '@/lib/postStore';
import {
  Applicant, APPLY_SEED, CommItem, COMM_SEED, useCommSettings, badgeStyle, maskName,
  applyVis, APPLY_VIS_LABEL, inTrash, trashExpired, trashLeft,
} from '@/lib/commStore';
import { SearchBar, Tip } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { useConfirmDelete } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

/** 鎖定圖示（線條圖示） */
function LockIcon({ open }: { open?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round' }}>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      {open
        ? <path d="M8 11V7a4 4 0 0 1 7.6-1.7" />
        : <path d="M8 11V7a4 4 0 0 1 8 0v4" />}
    </svg>
  );
}

export default function CommApplyPage() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const toast = useToast();
  const del = useConfirmDelete();   // 所有刪除都使用警告 Modal（v1.9）
  const [apps, setApps, loaded] = useLocalList<Applicant>('ohome.commapply.v1', APPLY_SEED);
  const [comms] = useLocalList<CommItem>('ohome.comm.v1', COMM_SEED);
  const [settings, , setLoaded] = useCommSettings();
  const [q, setQ] = useState('');
  const [fStatus, setFStatus] = useState<string>('all');
  const [fComm, setFComm] = useState<string>('all');

  const trashDays = settings.trashDays ?? 30;

  // 打開列表時清理已超過保存期限的申請（v2.0）— 只有具有寫入權限的管理員
  useEffect(() => {
    if (!loaded || !setLoaded || !isAdmin) return;
    const gone = trashExpired(apps, trashDays);
    if (gone.length) setApps(apps.filter(a => !gone.includes(a)));
    // 每次列表變更時都會確認 — 只有符合條件時才會刪除一次
  }, [loaded, setLoaded, isAdmin, apps, trashDays, setApps]);

  if (!loaded || !setLoaded) return <section className="page" />;

  // 列表公開範圍（環境設定 > 委託 — 4.18）
  if ((settings.applyVisibility === 'private' && !isAdmin)
    || (settings.applyVisibility === 'member' && !user)) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>APPLICANTS</PageTitle><p>
          {settings.applyVisibility === 'private' ? '這是私密列表' : '會員公開 — 登入後才能查看'}
        </p></div>
      </section>
    );
  }

  // 對無權限者顯示遮罩後的名稱（只顯示允許公開的字數 — 4.18 v1.9）
  const dispName = (a: Applicant) => (isAdmin ? a.name : maskName(a.name, a.nameOpen ?? 1));

  // 回收桶只有管理員可以查看 — 已進入回收桶的申請會從一般列表中移除
  const trashView = fStatus === 'trash' && isAdmin;
  const trashed = apps.filter(inTrash);
  const live = apps.filter(a => !inTrash(a));
  const pool = trashView ? trashed : live;

  const query = q.trim().toLowerCase();
  const shown = pool
    .filter(a => trashView || fStatus === 'all' || a.badgeId === fStatus)
    .filter(a => fComm === 'all' || a.commId === fComm)
    // 搜尋也依照畫面上顯示的名稱 — 避免從被遮罩的文字中洩漏姓名
    .filter(a => !query || dispName(a).toLowerCase().includes(query));

  const commName = (id?: string) => comms.find(x => x.id === id)?.name ?? '';
  const cntS = (sid: string) => live.filter(a => sid === 'all' || a.badgeId === sid).length;
  const cntC = (cid: string) => pool.filter(a => cid === 'all' || a.commId === cid).length;

  const statusLabel = settings.applyBadges.find(b => b.id === fStatus)?.label;
  // 只有完成（done）可以批次移入回收桶（v2.0 使用者發現）— 之前在其他狀態篩選下也會顯示按鈕，
  // 導致等待中・處理中的申請也會一次被移入回收桶。「完成」標籤使用固定 id，因此
  // 即使修改標籤名稱，也能安全判斷
  const canBulkTrash = fStatus === 'done';

  /* 將目前視為完成的申請一次移入回收桶（v2.0 使用者要求 — 用於整理已完成的申請） */
  const toTrash = () => {
    const ids = new Set(shown.map(a => a.id));
    if (!ids.size) return;
    del.ask(
      `${statusLabel ? `「${statusLabel}」 ` : '目前列表中顯示的'}申請 ${ids.size} 件要移入回收桶嗎？`,
      () => {
        const at = new Date().toISOString();
        setApps(apps.map(a => (ids.has(a.id) ? { ...a, trashedAt: at } : a)));
        toast(`${ids.size} 件已移入回收桶`);
      },
      `可以從回收桶復原，經過 ${trashDays} 天後將永久消失。`,
      '移入回收桶',   // 不是刪除，而是移動，因此確認按鈕文字也使用移入回收桶
    );
  };

  const restore = (a: Applicant) => {
    setApps(apps.map(x => (x.id === a.id ? { ...x, trashedAt: undefined } : x)));
    toast('已恢復至列表');
  };

  const dropOne = (a: Applicant) =>
    del.ask(`${dispName(a)} 的申請要永久刪除嗎？`,
      () => { setApps(apps.filter(x => x.id !== a.id)); toast('已刪除'); },
      '無法復原。');

  const emptyTrash = () =>
    del.ask(`要永久刪除回收桶中的 ${trashed.length} 件申請嗎？`,
      () => { setApps(live); toast('回收桶已清空'); },
      '無法復原。');

  const row = (a: Applicant) => {
    const badge = settings.applyBadges.find(b => b.id === a.badgeId);
    const vis = applyVis(a);
    // 本人查看 — 僅指定會員（selfId）可以查看，未指定的舊版資料則允許登入會員查看
    const canSee = isAdmin || vis === 'public'
      || (vis === 'self' && !!user && (a.selfId ? user.id === a.selfId : true));
    return (
      <div className="ap-row" key={a.id}
        style={{ width: '100%', cursor: 'var(--cur-pointer,pointer)' }}
        onClick={() => { if (!editOn) router.push(`/comm-apply/${a.id}`); }}>
        {/* 拖曳控制點 — 僅在編輯模式顯示（回收桶中不需要調整順序） */}
        {editOn && !trashView && <span className="drag-h">⠿</span>}
        <div className="dl">
          <small>DEADLINE</small>
          <b>{a.deadline ? a.deadline.replace(/-/g, '.') : '—'}</b>
        </div>
        <span className="bwrap">
          {badge && <span style={badgeStyle(badge, settings.badgeShape)}>{badge.label}</span>}
        </span>
        <div className="who">
          <b>{dispName(a)}</b>
          {(a.appliedDate || a.source) && (
            <small>{[a.appliedDate && `申請 ${a.appliedDate.replace(/-/g, '.')}`, a.source].filter(Boolean).join(' · ')}</small>
          )}
        </div>
        <span className="kind">{commName(a.commId)}</span>
        {trashView ? (
          <span className="ap-trash" onClick={e => e.stopPropagation()}>
            <small>{trashLeft(a, trashDays)}天後移除</small>
            <button className="btn btn-ghost" onClick={() => restore(a)}>復原</button>
            <button className="btn btn-ghost" onClick={() => dropOne(a)}>永久刪除</button>
          </span>
        ) : (
          <span className="lock" onClick={e => e.stopPropagation()}>
            {/* 僅顯示公開範圍提示 — 內容不會直接顯示在畫面上（維持私密含義，使用者確認） */}
            <Tip dd tip={APPLY_VIS_LABEL[vis]}>
              <span style={{ color: canSee ? 'var(--accent)' : 'var(--faint)' }}><LockIcon open={canSee} /></span>
            </Tip>
          </span>
        )}
      </div>
    );
  };

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>APPLICANTS</PageTitle>
        <EditableDesc k="commapply-desc" def="公開申請順序列表 — 內容為私密" />
        <div className="head-actions">
          <SearchBar placeholder="搜尋申請者" onSearch={setQ} />
          {isAdmin && (trashView
            ? trashed.length > 0 && <button className="btn btn-ghost" onClick={emptyTrash}>清空回收桶</button>
            : (
              <>
                {canBulkTrash && shown.length > 0 && (
                  <button className="btn btn-ghost" onClick={toTrash}>
                    {statusLabel ? `「${statusLabel}」 ` : ''}{shown.length}件移入回收桶
                  </button>
                )}
                <button className="btn btn-dark" onClick={() => router.push('/comm-apply/new')}>＋ ADD APPLICANT</button>
              </>
            ))}
        </div>
      </div>

      <div className="ap-layout">
        {/* overflow visible — 讓鎖定圖示的自訂提示可以顯示到卡片外部 */}
        <div className="panel" style={{ padding: '8px 18px', overflow: 'visible' }}>
          {editOn && isAdmin && !trashView ? (
            <DragList items={shown} keyOf={a => a.id}
              onReorder={list => {
                // 僅以未套用篩選的狀態作為儲存基準（部分篩選時會將該順序排到前面）
                const rest = apps.filter(a => !list.some(x => x.id === a.id));
                setApps([...list, ...rest]);
              }}
              render={row} />
          ) : (
            shown.map(a => row(a))
          )}
          {shown.length === 0 && (
            <p className="hint" style={{ padding: 14 }}>
              {trashView ? '回收桶是空的' : '沒有可顯示的申請'}
            </p>
          )}
        </div>

        {/* 右側篩選側欄 — 同時套用狀態別 + 委託種類別（4.18） */}
        <div className="panel tagside" style={{ padding: 16 }}>
          <h4>進行狀態</h4>
          <div className={`tag ${fStatus === 'all' ? 'on' : ''}`} onClick={() => setFStatus('all')}>全部 <small>{cntS('all')}</small></div>
          {settings.applyBadges.map(b => (
            <div key={b.id} className={`tag ${fStatus === b.id ? 'on' : ''}`} onClick={() => setFStatus(b.id)}>
              {b.label} <small>{cntS(b.id)}</small>
            </div>
          ))}
          {/* 回收桶 — 僅管理員可見，超過保存期限後會自動消失（v2.0） */}
          {isAdmin && (
            <div className={`tag ${trashView ? 'on' : ''}`} onClick={() => setFStatus(trashView ? 'all' : 'trash')}>
              回收桶 <small>{trashed.length}</small>
            </div>
          )}
          <h4 style={{ marginTop: 18 }}>委託種類</h4>
          <div className={`tag ${fComm === 'all' ? 'on' : ''}`} onClick={() => setFComm('all')}>全部 <small>{cntC('all')}</small></div>
          {comms.map(cm => (
            <div key={cm.id} className={`tag ${fComm === cm.id ? 'on' : ''}`} onClick={() => setFComm(cm.id)}>
              {cm.name} <small>{cntC(cm.id)}</small>
            </div>
          ))}
        </div>
      </div>
      {del.element}
    </section>
  );
}