'use client';
// 日記（4.14）— 手風琴列表：標題＋心情＋日期同一行，點擊後在原位置展開 ·
// 心情篩選 · 分頁 · 公開範圍（私密僅管理員可見）
import React, { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useSectionParam, filterSection, sectionSetter } from '@/lib/sectionStore';
import { useLocalList } from '@/lib/postStore';
import { DiaryPost, DIARY_SEED, Mood, MOOD_SEED, moodTint } from '@/lib/diaryStore';
import { renderBody } from '@/lib/sanitize';
import { SearchBar, Pager } from '@/components/ui/Kit';
import { ConfirmModal } from '@/components/ui/Modal';
import { Lightbox } from '@/components/ui/Lightbox';
import { BlobImg } from '@/lib/blobStore';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

const PAGE_SIZE = 10;

function MoodIcon({ mood, size = 30 }: { mood?: Mood; size?: number }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      // 行高設為 1 才能讓文字本身置中，而不是讓文字方框置中（v2.0 使用者發現）
      display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
      fontSize: size * 0.45,
      background: moodTint(mood?.color ?? '#888'), color: mood?.color ?? 'var(--sub)',
    }}>{mood?.icon ?? '·'}</span>
  );
}

function DiaryBody({ p, onOpen }: { p: DiaryPost; onOpen: (ids: string[], idx: number) => void }) {
  const html = useMemo(() => renderBody('md', p.body), [p.body]);
  return (
    <div className="dy-body">
      <div className="post-body" dangerouslySetInnerHTML={{ __html: html }} />
      {/* 圖片以縮圖列表顯示 — 點擊後開啟檢視器（可左右切換）（v1.9 使用者確認） */}
      {p.imgIds.length > 0 && (
        <div className="dy-thumbs">
          {p.imgIds.map((id, i) => (
            <div key={id} className="dy-thumb" onClick={() => onOpen(p.imgIds, i)}>
              <BlobImg fileRef={id} ph="" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DiaryPageInner() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [postsAll, setPostsAll, loaded] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  // 多個區段（v2.0）— 只顯示網址中的 ?s= 所指向的區段
  const sec = useSectionParam('diary');
  const posts = filterSection(postsAll, sec.id);
  // 儲存時只替換這個區段的位置 — 即使直接傳入篩選後的列表，也不會刪除其他區段
  const setPosts = sectionSetter(postsAll, sec.id, setPostsAll);
  const [moods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  const [open, setOpen] = useState<string | null>(null);
  const [fMood, setFMood] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [delFor, setDelFor] = useState<DiaryPost | null>(null);
  const [lb, setLb] = useState<{ srcs: string[]; idx: number } | null>(null); // 圖片檢視器（v1.9）
  // 小型行事曆（4.14 行事曆檢視）— 切換月份後只顯示該月份的日記
  const now = new Date();
  const [view, setView] = useState<{ y: number; m: number }>({ y: now.getFullYear(), m: now.getMonth() });
  const [monthFilter, setMonthFilter] = useState(false);

  // 從主頁 Widget 進入特定日記 — /diary#id（4.14）
  useEffect(() => {
    const h = window.location.hash.slice(1);
    if (h) setOpen(h);
  }, [loaded]);

  if (!loaded) return <section className="page" />;

  const query = q.trim().toLowerCase();
  const monthKey = `${view.y}-${String(view.m + 1).padStart(2, '0')}`;
  const canSee = (p: DiaryPost) => isAdmin || (p.visibility === 'public' || (p.visibility === 'member' && !!user));
  const visible = posts
    .filter(canSee)
    .filter(p => fMood === 'all' || p.moodId === fMood)
    .filter(p => !query || p.title.toLowerCase().includes(query))
    .filter(p => !monthFilter || p.date.startsWith(monthKey))
    .sort((a, b) => b.date.localeCompare(a.date));

  // 行事曆顯示用 — 目前顯示月份的日記（日期 → 文章列表）
  const byDay = new Map<number, DiaryPost[]>();
  posts.filter(canSee).filter(p => p.date.startsWith(monthKey)).forEach(p => {
    const d = parseInt(p.date.slice(8, 10), 10);
    byDay.set(d, [...(byDay.get(d) ?? []), p]);
  });
  const firstDay = new Date(view.y, view.m, 1).getDay();
  const dim = new Date(view.y, view.m + 1, 0).getDate();
  const mv = (d: number) => {
    setView(v => { const nm = v.m + d; return { y: v.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 }; });
    setMonthFilter(true); setPage(1);
  };
  const totalPages = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const shown = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const moodOf = (id: string) => moods.find(m => m.id === id);
  const cnt = (mid: string) => posts
    .filter(p => isAdmin || (p.visibility === 'public' || (p.visibility === 'member' && !!user)))
    .filter(p => mid === 'all' || p.moodId === mid).length;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>{sec.id === 'main' ? 'DIARY' : sec.name}</PageTitle>
        <EditableDesc k="diary-desc" def="心情日記 — 點擊後會在原位置展開" />
      </div>

      {/* 心情篩選 + 月份篩選顯示 + 搜尋・WRITE — 篩選列靠右對齊（v1.9 使用者要求）。
          位於網格外（全寬）：讓行事曆從與日記面板相同的高度開始 */}
      <div className="toolrow" style={{ marginBottom: 16 }}>
        <div className="tag-row">
          <div className={`tag ${fMood === 'all' ? 'on' : ''}`} onClick={() => { setFMood('all'); setPage(1); }}>
            全部 <small>{cnt('all')}</small>
          </div>
          {moods.map(m => (
            <div key={m.id} className={`tag ${fMood === m.id ? 'on' : ''}`} onClick={() => { setFMood(m.id); setPage(1); }}>
              <span style={{ color: m.color }}>{m.icon}</span> {m.name} <small>{cnt(m.id)}</small>
            </div>
          ))}
          {monthFilter && (
            <div className="tag on" onClick={() => { setMonthFilter(false); setPage(1); }}
              data-tip="取消月份篩選">
              {view.y}.{String(view.m + 1).padStart(2, '0')} ✕
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <SearchBar placeholder="搜尋標題" onSearch={v => { setQ(v); setPage(1); }} />
          {isAdmin && <button className="btn btn-dark" onClick={() => router.push('/diary/write')}>＋ WRITE</button>}
        </div>
      </div>

      {/* 左側列表 + 右側小型行事曆（4.14 行事曆檢視）— 兩個面板的起始高度相同 */}
      <div className="dy-layout">
      <div>
      <div className="panel" style={{ padding: '6px 20px' }}>
        {shown.map(p => {
          const m = moodOf(p.moodId);
          const opened = open === p.id;
          return (
            <div key={p.id} id={p.id} className={`dy-row ${opened ? 'open' : ''}`}>
              {/* 收合：標題垂直置中 / 展開：靠上對齊（4.14 v1.8） */}
              <div className="hd" onClick={() => setOpen(o => (o === p.id ? null : p.id))}>
                <MoodIcon mood={m} />
                <b className="tt">{p.title}</b>
                {p.visibility !== 'public' && (
                  <span className="pill" style={{ flexShrink: 0 }}>{p.visibility === 'member' ? '會員' : '私密'}</span>
                )}
                <small className="dt">{p.date.replace(/-/g, '.')}{m ? ` · ${m.name}` : ''}</small>
                <span className={`arr ${opened ? 'up' : ''}`} />
              </div>
              {/* 始終渲染 + 使用 grid-rows 過渡效果平滑展開（避免卡頓感） */}
              <div className="dy-fold" aria-hidden={!opened}>
                <div className="dy-fold-in">
                  <DiaryBody p={p} onOpen={(ids, idx) => setLb({ srcs: ids, idx })} />
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', padding: '0 0 14px' }}>
                      <button className="btn btn-ghost" style={{ padding: '4px 11px', fontSize: 10.5 }}
                        onClick={() => router.push(`/diary/${p.id}/edit`)}>EDIT</button>
                      <button className="btn btn-ghost" style={{ padding: '4px 11px', fontSize: 10.5 }}
                        onClick={() => setDelFor(p)}>DELETE</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="hint" style={{ padding: 16 }}>{query ? '沒有搜尋結果' : '目前沒有日記'}</p>}
      </div>

      <div style={{ marginTop: 14, display: 'flex', justifyContent: 'center' }}>
        <Pager page={page} total={totalPages} onChange={setPage} />
      </div>
      </div>

      {/* 右側：小型行事曆 — 有撰寫日記的日期會顯示心情色圓點，切換月份後列表也只顯示該月份 */}
      <div className="panel dy-cal">
        <div className="hd">
          <button type="button" onClick={() => mv(-1)}>‹</button>
          <b>{view.y}年 {view.m + 1}月</b>
          <button type="button" onClick={() => mv(1)}>›</button>
        </div>
        <div className="wk">{['日', '一', '二', '三', '四', '五', '六'].map(w => <span key={w}>{w}</span>)}</div>
        <div className="days">
          {Array.from({ length: firstDay }, (_, i) => <span key={`e${i}`} />)}
          {Array.from({ length: dim }, (_, i) => {
            const d = i + 1;
            const entries = byDay.get(d);
            return (
              <button type="button" key={d} className={entries ? 'has' : ''}
                data-tip={entries ? entries.map(p => p.title).join(' · ') : undefined}
                onClick={() => {
                  if (!entries) return;
                  setMonthFilter(true); setPage(1); setOpen(entries[0].id);
                }}>
                {d}
                <span className="dots">
                  {(entries ?? []).slice(0, 2).map(p => (
                    <i key={p.id} style={{ background: moodOf(p.moodId)?.color ?? 'var(--faint)' }} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      </div>

      <ConfirmModal open={delFor !== null} title="確定要刪除日記嗎？"
        body={`"${delFor?.title}" — 刪除後將無法復原。`}
        onClose={() => setDelFor(null)}
        buttons={[
          { label: 'DELETE', kind: 'accent', onClick: () => { setPosts(posts.filter(x => x.id !== delFor!.id)); setDelFor(null); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setDelFor(null) },
        ]} />
      {/* 圖片檢視器 — 點擊縮圖後（v1.9 使用者確認） */}
      {lb && <Lightbox srcs={lb.srcs} index={lb.idx} onClose={() => setLb(null)} />}
    </section>
  );
}

/** 需要讀取 ?s=，因此需要 Suspense 邊界（Next App Router） */
export default function DiaryPage() {
  return <Suspense fallback={<section className="page" />}><DiaryPageInner /></Suspense>;
}