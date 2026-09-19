'use client';
// 主頁 Widget 渲染器（4.0）— DIARY/LATEST/UPCOMING 等在對應功能（第 2・3 階段）完成前使用展示資料
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { WidgetConf, useMainStore, WIDGET_META, decoSlides } from '@/lib/mainStore';
import { useAuth } from '@/lib/auth';
import { boardEntries, useMenuSettings, buildMenu, canViewHref } from '@/lib/menuStore';
import { sectionHref, MAIN_SEC, useSections, sectionMenuEntries } from '@/lib/sectionStore';
import { useCustomLinks, linkEntries } from '@/lib/linkStore';
import { useBoards } from '@/lib/boardStore';
import { Modal } from '@/components/ui/Modal';
import { KTextarea, KSelect, KStep, KCheck } from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { useFonts } from '@/lib/fontStore';
import { BannerEditor, BannerSlide, DEMO_SLIDES, DdayEditor, DecoEditor, TodoEditor, TodoSetItem } from '@/components/main/widgetEditors';
import { CroppedBlobImg, CropValue } from '@/components/ui/CropEditor';
import { useLocalList } from '@/lib/postStore';
import { RoadItem, ROAD_SEED, BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { DiaryPost, DIARY_SEED, Mood, MOOD_SEED, moodTint } from '@/lib/diaryStore';
import { useSched, eventColor } from '@/lib/schedStore';
import { StickyMemo, MEMO_SEED, MEMO_SIZE_W, useMemoSettings } from '@/lib/memoStore';
import { BlobImg, useBlobUrl } from '@/lib/blobStore';
import { normalizeInternalLink } from '@/lib/link';
import {
  Applicant, APPLY_SEED, useCommSettings, badgeStyle, maskName, inTrash,
} from '@/lib/commStore';

/* 編輯模式右鍵「設定」→ 開啟對應 Widget 的設定 Modal（v1.9 使用者確認 — 透過事件連接） */
function useEditEvent(id: string, onOpen: () => void) {
  useEffect(() => {
    const h = (e: Event) => { if ((e as CustomEvent).detail?.id === id) onOpen(); };
    window.addEventListener('ohome-widget-edit', h);
    return () => window.removeEventListener('ohome-widget-edit', h);
  }, [id, onOpen]);
}

/* ---------- 投影片 Banner（固定元素，4.0）— 圖片・連結・間距・順序管理 ---------- */

export function BannerWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn, updateWidget } = useMainStore();
  const router = useRouter();
  const [cur, setCur] = useState(0);
  const [mngOpen, setMngOpen] = useState(false);
  useEditEvent(conf.id, () => setMngOpen(true));   // 編輯模式右鍵 → 設定（v1.9）
  const slides = ((conf.settings.slides as BannerSlide[]) ?? []).length > 0
    ? (conf.settings.slides as BannerSlide[]) : DEMO_SLIDES;
  const interval = (conf.settings.interval as number) ?? 4;

  useEffect(() => {
    if (slides.length < 2) return;
    const t = setInterval(() => setCur(c => (c + 1) % slides.length), Math.max(2, interval) * 1000);
    return () => clearInterval(t);
  }, [slides.length, interval]);

  const s = slides[Math.min(cur, slides.length - 1)];
  const go = () => {
    if (editOn || !s.link) return;
    // 即使既有儲存資料中有完整網址，只要是同一網站就視為內部移動（v1.9）
    const l = normalizeInternalLink(s.link);
    if (/^https?:\/\//.test(l)) window.open(l, '_blank');
    else router.push(l);
  };

  return (
    <div className="banner" style={{ cursor: s.link && !editOn ? 'pointer' : undefined }} onClick={go}>
      {slides.map((sl, i) => (
        <div key={sl.id} className={`slide ${i === Math.min(cur, slides.length - 1) ? 'on' : ''}`}>
          {sl.imgId
            /* 上傳圖片 — 保留原圖 + 只套用位置裁切（即使 Banner 大小改變，也能用比例座標還原） */
            ? <CroppedBlobImg fileRef={sl.imgId} crop={sl.crop} ph="" />
            : sl.img
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={sl.img} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
              : <div className={`ph ${sl.cls ?? ''}`} style={{ position: 'absolute', inset: 0 }}><span>SLIDE BANNER {String(i + 1).padStart(2, '0')}</span></div>}
        </div>
      ))}
      <div className="cap"><b>{s.cap}</b><span>{s.sub}</span></div>
      <div className="dots" onClick={e => e.stopPropagation()}>
        {slides.map((sl, i) => (
          <i key={sl.id} className={i === Math.min(cur, slides.length - 1) ? 'on' : ''} onClick={() => setCur(i)} />
        ))}
      </div>
      {/* Banner 管理（管理員）— 只有滑鼠移到 Banner 上時才顯示 */}
      {isAdmin && !editOn && (
        <button className="hv-actions"
          style={{
            position: 'absolute', top: 10, right: 10, zIndex: 4, fontSize: 10.5, letterSpacing: '.06em',
            padding: '5px 11px', borderRadius: 999, background: 'rgba(15,17,20,.55)', color: '#dfe2e7',
          }}
          onClick={e => { e.stopPropagation(); setMngOpen(true); }}>MANAGE</button>
      )}
      <div onClick={e => e.stopPropagation()}>
        <Modal open={mngOpen} onClose={() => setMngOpen(false)} title="投影片 Banner 管理"
          desc="圖片上傳 · Caption · 連結（內部路徑或外部 URL）· ⠿ 拖曳調整順序 · 原圖不會被裁切">
          {mngOpen && <BannerEditor conf={conf} onSaved={() => setMngOpen(false)} onClose={() => setMngOpen(false)} />}
        </Modal>
      </div>
    </div>
  );
}

/* ---------- 選單列表（僅行動版，規劃書第 8 章） ---------- */
export function MenuListWidget() {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [menuSet, , menuLoaded] = useMenuSettings(); // 套用選單管理（5.2）
  const { boards, loaded: boardsLoaded } = useBoards(); // 多留言板（5.2）
  const { user: wUser, isAdmin: wIsAdmin } = useAuth(); // 公開範圍篩選（v1.9）
  const { map: wSecMap } = useSections();      // 多個建立的區段（v2.0 — 之前遺漏）
  const { links: wLinks } = useCustomLinks();  // 自訂連結（v2.0）
  return (
    <div className="panel menu-list wgt-menu">
      {(menuLoaded && boardsLoaded
        ? buildMenu(menuSet, [...boardEntries(boards), ...sectionMenuEntries(wSecMap), ...linkEntries(wLinks)], { loggedIn: !!wUser, isAdmin: wIsAdmin, id: wUser?.id })
        : []).map(m =>
        m.children ? (
          <div key={m.label} className={`mgrp ${open === m.label ? 'open' : ''}`}>
            <a onClick={() => setOpen(o => (o === m.label ? null : m.label))}>{m.label}</a>
            <div className="msub">
              {/* 自訂連結的外部網址開啟新視窗（v2.0）— 與上方選單相同的規則 */}
              {m.children.map(c => (
                <a key={c.href} onClick={() => (/^https?:\/\//.test(c.href) ? window.open(c.href, '_blank') : router.push(c.href))}>{c.label}</a>
              ))}
            </div>
          </div>
        ) : (
          <a key={m.label} onClick={() => (/^https?:\/\//.test(m.href!) ? window.open(m.href!, '_blank') : router.push(m.href!))}>{m.label}</a>
        )
      )}
    </div>
  );
}

/* ---------- MEMO — 管理員點擊時開啟大型編輯 Modal（4.12 v1.8） ---------- */
export function MemoWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn, updateWidget } = useMainStore();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const text = (conf.settings.text as string) ?? '';
  useEditEvent(conf.id, () => { setDraft(text); setOpen(true); });   // 編輯模式右鍵 → 設定（v1.9）
  return (
    <div className="panel widget" style={{ cursor: isAdmin ? 'pointer' : undefined }}
      onClick={e => { if ((e.target as HTMLElement).closest('.modal-ov')) return; if (isAdmin && !editOn) { setDraft(text); setOpen(true); } }}>
      <h4>MEMO {isAdmin && <span className="more">管理 ›</span>}</h4>
      <p style={{ fontSize: 12, lineHeight: 1.7, color: '#3a3f47', whiteSpace: 'pre-line' }}>{text || '備忘錄是空的'}</p>

      <Modal open={open} onClose={() => setOpen(false)} title="備忘錄管理" desc="主頁備忘錄 Widget 內容 — 僅限管理員"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            updateWidget(conf.id, { settings: { ...conf.settings, text: draft } }, { persist: true }); setOpen(false);
          }}>SAVE</button>
        </>}>
        <KTextarea value={draft} onChange={e => setDraft(e.target.value)} />
      </Modal>
    </div>
  );
}

/* ---------- DIARY（最近日記 — 實際資料，4.14） ---------- */
export function DiaryWidget() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [posts] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  const [moods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  // 選單中設為私密的日記也不會出現在 Widget 中（v2.0 使用者發現 — 之前會從 Widget 洩漏）
  const [menuSet] = useMenuSettings();
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
  const canSee = canViewHref(menuSet, '/diary', viewer);
  // 私密日記絕對不會顯示在 Widget 中 — 即使是管理員也不會（4.14）
  const latest = posts
    .filter(p => canViewHref(menuSet, sectionHref('diary', p.secId ?? MAIN_SEC), viewer))
    .filter(p => p.visibility === 'public' || (p.visibility === 'member' && !!user))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);
  if (!canSee) return null;   // 選單為私密時，不顯示 Widget 本身（v2.0）
  return (
    <div className="panel widget" style={{ margin: 0 }}>
      <h4>DIARY <span className="more" onClick={() => router.push('/diary')}>查看更多 ›</span></h4>
      {latest.map(p => {
        const m = moods.find(x => x.id === p.moodId);
        return (
          <div key={p.id} className="diary-mini" onClick={() => router.push(`/diary#${p.id}`)}>
            <div className="mood" style={{ background: moodTint(m?.color ?? '#888'), color: m?.color }}>{m?.icon ?? '·'}</div>
            <div className="t"><span className="tt">{p.title}</span> <small>{p.date.slice(5).replace('-', '.')}{m ? ` · ${m.name}` : ''}</small></div>
          </div>
        );
      })}
      {latest.length === 0 && <p className="hint">沒有公開的日記</p>}
    </div>
  );
}

/* ---------- LATEST（最新圖片 — 載入紀錄 + 圖庫整合最新 3 張，v1.9 使用者回饋） ---------- */
export function LatestWidget() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [roads] = useLocalList<RoadItem>('ohome.road.v1', ROAD_SEED);
  const [backups] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  /* 排除選單中設為私密的地方（v2.0 使用者發現）— 載入紀錄與圖庫會一起顯示，
     因此會**分別依來源**判斷。其中一方為私密時，另一方仍會正常顯示。 */
  const [menuSet] = useMenuSettings();
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
  const seeRoad = canViewHref(menuSet, '/loadb', viewer);
  const seeGal = canViewHref(menuSet, '/gallery', viewer);
  const latest = [
    ...(seeRoad ? roads : []).filter(it => canViewHref(menuSet, sectionHref('roadview', it.secId ?? MAIN_SEC), viewer)).map(it => ({
      id: `r-${it.id}`, date: it.date, ref: it.imgId ?? it.imgUrl, ph: it.ph,
      href: '/loadb', tip: `載入紀錄 · No.${String(it.no ?? 0).padStart(3, '0')}`,
    })),
    // 圖庫 — 完全公開 + 沒有摺疊的文章中的代表（第一張）圖片
    ...(seeGal ? backups : [])
      .filter(p => canViewHref(menuSet, sectionHref('gallery', p.secId ?? MAIN_SEC), viewer))
      .filter(p => p.visibility === 'public' && !p.fold).map(p => ({
      id: `b-${p.id}`, date: p.date, ref: p.images[0], ph: p.phList[0] ?? 'cool',
      href: `/gallery/${p.id}`, tip: `圖庫 · ${p.title}`,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);
  const phFallback = ['cool', 'warm', 'red'];
  if (!seeRoad && !seeGal) return null;   // 兩者都是私密時，不顯示 Widget 本身（v2.0）
  return (
    <div className="panel widget" style={{ margin: 0 }}>
      <h4>LATEST <span className="more" onClick={() => router.push('/gallery')}>查看更多 ›</span></h4>
      <div className="latest-grid">
        {[0, 1, 2].map(i => {
          const it = latest[i];
          return (
            <div key={it?.id ?? i} style={{ aspectRatio: '1', borderRadius: 9, overflow: 'hidden', position: 'relative', cursor: it ? 'pointer' : undefined }}
              onClick={() => { if (it) router.push(it.href); }} data-tip={it?.tip}>
              <BlobImg fileRef={it?.ref} ph={it?.ph || phFallback[i]} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------- D-DAY（4.12 — 行事曆串接為第 3 階段） ---------- */
interface DdayItem { title: string; date: string; plusOne?: boolean }
function ddayLabel(date: string, plusOne?: boolean): { label: string; passed: boolean; near: boolean } {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const d = new Date(date + 'T00:00:00');
  const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
  // +1 Day：將開始日算作第 1 天的紀念日計算（例如情侶紀念日）— 當天 = D+1
  if (plusOne && diff <= 0) return { label: `D+${-diff + 1}`, passed: true, near: false };
  if (diff === 0) return { label: 'D-DAY', passed: false, near: true };
  return diff > 0
    ? { label: `D-${diff}`, passed: false, near: diff <= 7 }
    : { label: `D+${-diff}`, passed: true, near: false };
}

export function DdayWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const { familyOf } = useFonts();
  const [open, setOpen] = useState(false);
  const items = (conf.settings.items as DdayItem[]) ?? [];
  // 日期顯示（D-2・D+3 等）的字型・顏色 — 未指定時維持原本的襯線預設值（v2.0 使用者要求）
  // 'serif' 是字型庫的實際（鎖定）字型，因此會始終與編輯器的預設選項和值一致
  const dFontId = (conf.settings.fontId as string | undefined) ?? 'serif';
  const dColor = conf.settings.color as string | undefined;
  useEditEvent(conf.id, () => setOpen(true));   // 編輯模式右鍵 → 設定（v1.9）
  return (
    <div className="panel widget" style={{ cursor: isAdmin ? 'pointer' : undefined }}
      onClick={e => { if ((e.target as HTMLElement).closest('.modal-ov')) return; if (isAdmin && !editOn) setOpen(true); }}>
      <h4>D-DAY {isAdmin && <span className="more">管理 ›</span>}</h4>
      {items.map(it => {
        const d = ddayLabel(it.date, it.plusOne);
        return (
          <div className="dday-row" key={it.title}>
            <span>{it.title}</span>
            <b className={d.near && !dColor ? 'd-red' : ''}
              style={{ fontFamily: familyOf(dFontId), color: dColor }}>{d.label}</b>
          </div>
        );
      })}
      {items.length === 0 && <p className="hint">沒有已登錄的 D-day</p>}

      <Modal open={open} onClose={() => setOpen(false)} title="D-day 管理"
        desc="新增 · 修改 · 刪除 · ⠿ 拖曳調整順序 — 也可以在環境設定「Widget」中管理"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>}>
        {open && <DdayEditor conf={conf} />}
      </Modal>
    </div>
  );
}

/* ---------- TO-DO — 管理員點擊時開啟管理 Modal（4.12 確定） ---------- */
export function TodoWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn, updateWidget } = useMainStore();
  const [open, setOpen] = useState(false);
  const items = (conf.settings.items as TodoSetItem[]) ?? [];
  useEditEvent(conf.id, () => setOpen(true));   // 編輯模式右鍵 → 設定（v1.9）

  const setItems = (next: TodoSetItem[]) => {
    updateWidget(conf.id, { settings: { ...conf.settings, items: next } }, { persist: true });
  };

  return (
    <div className="panel widget" style={{ cursor: isAdmin ? 'pointer' : undefined }}
      onClick={e => {
        if (!isAdmin || editOn) return;
        if ((e.target as HTMLElement).closest('.k-check') || (e.target as HTMLElement).closest('.modal-ov')) return;
        setOpen(true);
      }}>
      <h4>TO-DO {isAdmin && <span className="more">管理 ›</span>}</h4>
      {items.map((it, i) => (
        <label className={`todo-row k-check ${it.done ? 'done' : ''}`} key={`${it.text}-${i}`}
          style={!isAdmin ? { pointerEvents: 'none' } : undefined}>
          <input type="checkbox" checked={it.done}
            onChange={ev => setItems(items.map((x, j) => (j === i ? { ...x, done: ev.target.checked } : x)))} />
          <span className="box" /><span>{it.text}</span>
        </label>
      ))}
      {items.length === 0 && <p className="hint">沒有待辦事項</p>}

      <Modal open={open} onClose={() => setOpen(false)} title="待辦事項管理"
        desc="新增 · 勾選 · 刪除 · ⠿ 拖曳調整順序 — 也可以在環境設定「Widget」中管理">
        {open && <TodoEditor conf={conf} />}
        <div className="modal-actions">
          <button className="btn btn-dark" onClick={() => setOpen(false)}>CLOSE</button>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- UPCOMING（即將到來的行程 — 行事曆實際資料，4.12） ---------- */
export function UpcomingWidget() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { st } = useSched();   // 不帶參數 = 所有行事曆（v2.0 — 不論哪一個，未來行程都會顯示）
  /* 選單中設為私密的行事曆也不會出現在 Widget 中（v2.0）。
     可以建立多個行事曆，因此**每個行程都以所屬行事曆為基準**判斷，
     只有在完全沒有任何可查看的行事曆時，才會整個隱藏 Widget。 */
  const [menuSet] = useMenuSettings();
  const { list } = useSections();
  const viewer = { loggedIn: !!user, isAdmin, id: user?.id };
  const seeSec = (secId?: string) => canViewHref(menuSet, sectionHref('sched', secId ?? MAIN_SEC), viewer);
  const canSee = list('sched').some(s => seeSec(s.id));
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  // 包含今天之後的行程 — 每年重複的項目換算成今年日期後，取最近的 3 個
  const upcoming = st.events
    .filter(e => seeSec(e.secId))
    .filter(e => isAdmin || e.visibility === 'public' || (e.visibility === 'member' && !!user))
    .map(e => {
      let d = e.start;
      if (e.repeat === 'yearly') {
        const thisYear = `${today.getFullYear()}-${e.start.slice(5)}`;
        d = thisYear >= todayStr ? thisYear : `${today.getFullYear() + 1}-${e.start.slice(5)}`;
      }
      return { e, d };
    })
    .filter(x => x.d >= todayStr)
    .sort((a, b) => a.d.localeCompare(b.d))
    .slice(0, 3);
  if (!canSee) return null;   // 選單為私密時，不顯示 Widget 本身（v2.0）
  return (
    <div className="panel widget" style={{ cursor: 'var(--cur-pointer,pointer)' }} onClick={() => router.push('/cal')}>
      <h4>UPCOMING <span className="more">查看更多 ›</span></h4>
      {upcoming.map(({ e, d }) => (
        <div key={e.id} className="dday-row">
          <span>{d.slice(5).replace('-', '.')} · {e.title}</span>
          <b style={{ fontSize: 11, color: eventColor(e, st.cats) }}>●</b>
        </div>
      ))}
      {upcoming.length === 0 && <p className="hint">沒有即將到來的行程</p>}
    </div>
  );
}

/* ---------- 自由文字（v1.9 改版 — 使用者確定） ----------
   不使用面板，只顯示文字 — 可指定字型・大小・顏色・對齊方式，像裝飾一樣放置在任何位置（Widget 拖曳・大小共用）。
   僅能在編輯模式中編輯 — 右鍵「設定」（v1.9 使用者確定：移除平常點擊編輯）。 */
export function FreeTextWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { updateWidget } = useMainStore();
  const { fonts, familyOf } = useFonts();
  const [open, setOpen] = useState(false);
  const s = conf.settings as { text?: string; fontId?: string; size?: number; color?: string; align?: 'left' | 'center' | 'right'; bold?: boolean };
  const [draft, setDraft] = useState(s);
  useEditEvent(conf.id, () => { setDraft({ ...s }); setOpen(true); });
  return (
    <div>
      <p style={{
        fontFamily: familyOf(s.fontId) ?? 'var(--sans)',
        fontSize: s.size ?? 15, color: s.color ?? 'var(--page-desc)',
        textAlign: s.align ?? 'left', fontWeight: s.bold ? 700 : 400,
        lineHeight: 1.7, whiteSpace: 'pre-line', margin: 0, wordBreak: 'keep-all',
      }}>
        {s.text || (isAdmin ? '自由文字 — 在編輯模式中右鍵 → 設定' : '')}
      </p>
      <Modal open={open} onClose={() => setOpen(false)} title="自由文字"
        desc="不使用面板，只顯示文字 — 指定字型・大小・顏色・對齊方式，位置在編輯模式中拖曳"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setOpen(false)}>CANCEL</button>
          <button className="btn btn-dark" onClick={() => {
            updateWidget(conf.id, { settings: { ...conf.settings, ...draft } }, { persist: true }); setOpen(false);
          }}>SAVE</button>
        </>}>
        <div style={{ display: 'grid', gap: 10 }}>
          <KTextarea value={draft.text ?? ''} onChange={e => setDraft(d => ({ ...d, text: e.target.value }))} />
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect minWidth={170} value={draft.fontId ?? 'default'}
              onChange={v => setDraft(d => ({ ...d, fontId: v }))}
              options={fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> }))} />
            <span className="cp-lb">大小</span>
            <KStep value={draft.size ?? 15} min={10} max={64} step={1} suffix="px"
              onChange={v => setDraft(d => ({ ...d, size: v }))} />
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="cp-lb">文字顏色</span>
            <ColorField value={draft.color ?? '#5d636d'} onChange={hex => setDraft(d => ({ ...d, color: hex }))} />
            <div className="mini-seg">
              {(['left', 'center', 'right'] as const).map(a => (
                <button key={a} className={(draft.align ?? 'left') === a ? 'on' : ''}
                  onClick={() => setDraft(d => ({ ...d, align: a }))}>
                  {a === 'left' ? '左側' : a === 'center' ? '置中' : '右側'}
                </button>
              ))}
            </div>
            <KCheck label="粗體" checked={!!draft.bold} onChange={v => setDraft(d => ({ ...d, bold: v }))} />
          </div>
        </div>
      </Modal>
    </div>
  );
}

/* ---------- 裝飾圖片 — 不使用面板，只顯示圖片（裝飾用） ---------- */
/** 保持比例（不裁切）渲染 — cover（裁切）與選擇制（v1.9 使用者要求）
 *  圓角是套用在**圖片大小**上，而不是 Widget 方框（v1.9 使用者回饋 — 如果連空白處也有圓角就不明顯） */
function ContainImg({ fileRef, rounded, onActivate }: {
  fileRef: string; rounded: boolean; onActivate?: () => void;
}) {
  const url = useBlobUrl(fileRef);
  const imgRef = useRef<HTMLImageElement>(null);
  // 用於讀取透明像素的 Canvas — 每張圖片只繪製一次
  const cacheRef = useRef<{ url: string; c: HTMLCanvasElement } | null>(null);
  if (!url) return null;
  /* 判斷點擊位置是否真的位於圖片上（v2.0 使用者要求 — 「透明區域不是點擊區域」）。
     裝飾圖片很多是透明背景 PNG — 點擊空白處卻跳轉會很奇怪。
     讀取像素透明度，如果幾乎透明就不算點擊。若外部網址圖片因 Canvas 安全性而無法讀取，
     則只依圖片矩形區域判斷。 */
  const hitTest = (e: React.MouseEvent): boolean => {
    const img = imgRef.current;
    if (!img || !img.naturalWidth) return true;
    const r = img.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * img.naturalWidth);
    const y = Math.floor((e.clientY - r.top) / r.height * img.naturalHeight);
    try {
      if (!cacheRef.current || cacheRef.current.url !== url) {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d', { willReadFrequently: true })!.drawImage(img, 0, 0);
        cacheRef.current = { url, c };
      }
      return cacheRef.current.c.getContext('2d')!.getImageData(x, y, 1, 1).data[3] > 8;
    } catch { return true; }
  };
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={url} alt="" draggable={false}
        onClick={e => { if (onActivate && hitTest(e)) onActivate(); }}
        style={{
          maxWidth: '100%', maxHeight: '100%', width: 'auto', height: 'auto', display: 'block',
          borderRadius: rounded ? 'var(--radius)' : 0,
          cursor: onActivate ? 'var(--cur-pointer,pointer)' : undefined,
        }} />
    </div>
  );
}

export function DecoWidget({ conf }: { conf: WidgetConf }) {
  const { isAdmin } = useAuth();
  const { editOn } = useMainStore();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rounded = (conf.settings.rounded as boolean) ?? true;
  const fit = (conf.settings.fit as 'cover' | 'contain') ?? 'cover';   // 填滿（裁切）/ 保持比例（v1.9）
  // 多張投影片（v2.0）— 舊版只放一張的儲存資料也會以相同列表讀取
  const slides = decoSlides(conf.settings);
  const sec = (conf.settings.interval as number) ?? 5;
  const [idx, setIdx] = useState(0);
  const cur = slides[Math.min(idx, slides.length - 1)];
  // 自動切換 — 編輯中或設定 Modal 開啟時停止（因為正在調整位置）
  useEffect(() => {
    if (slides.length < 2 || editOn || open) return;
    const t = setInterval(() => setIdx(i => (i + 1) % slides.length), Math.max(1, sec) * 1000);
    return () => clearInterval(t);
  }, [slides.length, sec, editOn, open]);
  useEffect(() => { if (idx >= slides.length) setIdx(0); }, [slides.length, idx]);
  useEditEvent(conf.id, () => setOpen(true));   // 編輯僅限編輯模式右鍵「設定」（v1.9 使用者確定）
  // 連結移動（v1.9 — 圖片+連結不使用 Widget 邊框）— 每個場景的連結分開設定（v2.0）
  const onBody = () => {
    if (editOn) return;
    if (cur?.link) {
      const l = normalizeInternalLink(cur.link);
      if (/^https?:\/\//.test(l)) window.open(l, '_blank');
      else router.push(l);
    }
  };
  // 直接指定的大小（v2.0 使用者要求）— 留空時維持目前依位置（Grid 欄位）自動調整
  const wPx = conf.settings.wPx as number | undefined;
  const hPx = conf.settings.hPx as number | undefined;
  const canGo = !editOn && !!cur?.link;
  return (
    <div className="deco-wgt"
      style={{
        position: 'relative', overflow: 'hidden',
        width: wPx ? `${wPx}px` : '100%', maxWidth: '100%',
        height: hPx ? `${hPx}px` : '100%', minHeight: hPx ? undefined : 80,
        margin: wPx ? '0 auto' : undefined,
        aspectRatio: conf.h == null && !hPx ? '1/1' : undefined, // 尺寸凍結前預設正方形
        borderRadius: rounded ? 'var(--radius)' : 0,
      }}>
      {/* 只有圖片上方可以點擊（v2.0 使用者要求）— 以前整個 Widget 區域都可以點擊。
          填滿模式會讓圖片填滿整個區域，因此等同於整個區域；保持比例模式則依圖片像素判斷（排除透明區域） */}
      {cur
        ? (fit === 'contain'
          ? <ContainImg key={cur.id} fileRef={cur.imgId} rounded={rounded} onActivate={canGo ? onBody : undefined} />
          : (
            <div style={{ position: 'absolute', inset: 0, cursor: canGo ? 'var(--cur-pointer,pointer)' : undefined }}
              onClick={canGo ? onBody : undefined}>
              <CroppedBlobImg key={cur.id} fileRef={cur.imgId} crop={cur.crop} ph="" />
            </div>
          ))
        : (
          <div className="ph" style={{ position: 'absolute', inset: 0 }}>
            <span style={{ fontSize: 10 }}>{isAdmin ? 'DECO — 在編輯模式中右鍵 → 設定' : 'DECO'}</span>
          </div>
        )}
      {/* 只有多張時顯示目前第幾張 — 也可以直接點擊切換（v2.0） */}
      {slides.length > 1 && !editOn && (
        <div className="deco-dots" onClick={e => e.stopPropagation()}>
          {slides.map((sl, i) => (
            <i key={sl.id} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} />
          ))}
        </div>
      )}
      <div onClick={e => e.stopPropagation()}>
        <Modal open={open} onClose={() => setOpen(false)} small title="裝飾圖片"
          desc="加入多張圖片後會依序切換 — 位置裁切以目前 Widget 比例為基準，原圖不會被裁切">
          {open && <DecoEditor conf={conf} onClose={() => setOpen(false)} />}
        </Modal>
      </div>
    </div>
  );
}

/* ---------- 貼紙備忘錄迷你看板（4.6）— 僅供閱讀的縮小看板，點擊後前往 /memo ---------- */
export function MemoBoardWidget() {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const [memos] = useLocalList<StickyMemo>('ohome.memo.v1', MEMO_SEED);
  const [settings] = useMemoSettings();
  // 選單中設為私密的備忘錄也不會出現在 Widget 中（v2.0）
  const [menuSet] = useMenuSettings();
  if (!canViewHref(menuSet, '/memo', { loggedIn: !!user, isAdmin, id: user?.id })) return null;
  return (
    <div className="panel widget" style={{ display: 'flex', flexDirection: 'column' }}>
      <h4>STICKY</h4>
      <div className="memo-mini" onClick={() => router.push('/memo')}>
        {memos.map(m => (
          <div key={m.id} className="postit"
            style={{
              left: `${m.x}%`, top: `${m.y}%`, zIndex: m.z,
              transform: `rotate(${m.rot}deg)`, background: m.color,
              width: Math.round(MEMO_SIZE_W[m.size] * 0.53),
            }}>
            {settings.showAuthor && <b>{m.author}</b>}
            {m.text}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------- 委託申請者（v2.0 使用者要求） ----------
   按即將到來的截止日期由近到遠排列。顯示幾人由設定決定（預設 5 人）。
   姓名依照申請者列表的**相同規則**遮罩 — 僅管理員顯示完整名稱，其餘只顯示前幾個字。
   沒有截止日期的申請不算「即將到來的截止日期」，因此不加入。已過截止日期的也排除。 */
export function ApplyWidget({ conf }: { conf: WidgetConf }) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const { editOn, updateWidget } = useMainStore();
  // 選單中設為私密的申請者列表也不會出現在 Widget 中（v2.0）
  const [menuSet] = useMenuSettings();
  const [settings] = useCommSettings();
  const [apps] = useLocalList<Applicant>('ohome.commapply.v1', APPLY_SEED);
  const [open, setOpen] = useState(false);
  useEditEvent(conf.id, () => setOpen(true));

  const max = Math.max(1, Math.min(20, (conf.settings.count as number) ?? 5));
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const shown = apps
    .filter(a => !inTrash(a) && !!a.deadline && a.deadline >= todayStr)
    .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''))
    .slice(0, max);

  /** 剩餘天數 — 今天則顯示 D-DAY */
  const dleft = (d: string) => {
    const ms = Date.parse(`${d}T00:00:00`) - Date.parse(`${todayStr}T00:00:00`);
    const n = Math.round(ms / 86400000);
    return n === 0 ? 'D-DAY' : `D-${n}`;
  };

  // 等所有 Hook 都呼叫完後再判定 — 如果中途 return，會導致每次渲染的 Hook 數量不同
  if (!canViewHref(menuSet, '/comm-apply', { loggedIn: !!user, isAdmin, id: user?.id })) return null;

  return (
    /* 點擊後不論是否為管理員都會前往申請者頁面（v2.0 使用者要求）。
       設定僅能在編輯模式中右鍵 > 設定 — 如果為了查看列表而點擊卻跳出管理視窗是不對的 */
    <div className="panel widget" style={{ cursor: 'var(--cur-pointer,pointer)' }}
      onClick={e => {
        if ((e.target as HTMLElement).closest('.modal-ov')) return;
        if (editOn) return;   // 編輯模式下優先處理配置・右鍵選單
        router.push('/comm-apply');
      }}>
      <h4>COMMISSION <span className="more" onClick={e => { e.stopPropagation(); router.push('/comm-apply'); }}>全部 ›</span></h4>
      {shown.map(a => {
        const badge = settings.applyBadges.find(b => b.id === a.badgeId);
        return (
          <div className="apply-row" key={a.id}>
            <b>{dleft(a.deadline!)}</b>
            <span>{isAdmin ? a.name : maskName(a.name, a.nameOpen ?? 1)}</span>
            {badge && <i style={badgeStyle(badge, settings.badgeShape)}>{badge.label}</i>}
          </div>
        );
      })}
      {shown.length === 0 && <p className="hint">沒有即將到來的截止日期</p>}

      <Modal open={open} onClose={() => setOpen(false)} small title="委託申請者 Widget"
        desc="依截止日期接近程度顯示 — 沒有截止日期或已過截止日期的申請不會計入"
        actions={<button className="btn btn-dark" onClick={() => setOpen(false)}>確認</button>}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span className="cp-lb">最多幾人</span>
          <KStep value={(conf.settings.count as number) ?? 5} min={1} max={20} suffix="人"
            onChange={v => updateWidget(conf.id, { settings: { ...conf.settings, count: v } }, { persist: true })} />
        </div>
      </Modal>
    </div>
  );
}

/* ---------- 類型 → 渲染器 ---------- */
export function renderWidget(conf: WidgetConf) {
  switch (conf.type) {
    case 'banner': return <BannerWidget conf={conf} />;
    case 'menu': return <MenuListWidget />;
    case 'memo': return <MemoWidget conf={conf} />;
    case 'diary': return <DiaryWidget />;
    case 'latest': return <LatestWidget />;
    case 'dday': return <DdayWidget conf={conf} />;
    case 'todo': return <TodoWidget conf={conf} />;
    case 'upcoming': return <UpcomingWidget />;
    case 'freetext': return <FreeTextWidget conf={conf} />;
    case 'deco': return <DecoWidget conf={conf} />;
    case 'memoboard': return <MemoBoardWidget />;
    case 'apply': return <ApplyWidget conf={conf} />;
    default: return <div className="panel widget"><h4>{WIDGET_META[conf.type]?.title ?? conf.type}</h4></div>;
  }
}