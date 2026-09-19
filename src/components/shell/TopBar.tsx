'use client';
// 頂部導覽列 — 規劃書第 3 章（階層選單）＋ 4.0（個人資料下拉選單・編輯模式・網格切換）
// 點擊 Logo = 移動至首頁（v1.5）・點擊上層選單 = 移動至第一個下層頁面（v1.8）
// 編輯模式中嘗試移動頁面 → 顯示退出確認 Modal（v1.8）
import React, { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { boardEntries, useMenuSettings, buildMenu } from '@/lib/menuStore';
import { useBoards } from '@/lib/boardStore';
import { useSections, sectionMenuEntries } from '@/lib/sectionStore';
import { useCustomLinks, linkEntries } from '@/lib/linkStore';
import { useSiteSettings } from '@/lib/siteStore';
import { useAuth } from '@/lib/auth';
import { useMainStore } from '@/lib/mainStore';
import { useBlobUrl } from '@/lib/blobStore';
import { refreshPage } from '@/lib/pageRefresh';
import { useToast } from '@/components/ui/Toast';
import { KToggle } from '@/components/ui/Kit';
import {
  Notif, NotifType, NOTIF_EVENT, NOTIF_TYPE_LABEL,
  readNotifs, markRead, markAllRead, clearReadNotifs, notifSettings, setNotifSetting, syncNotifs, selfTestNotif,
} from '@/lib/notifStore';
import { subscribeTable } from '@/lib/db';

const BellIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M6 9.5a6 6 0 0 1 12 0c0 4.2 1.6 5.6 2.2 6.3H3.8C4.4 15.1 6 13.7 6 9.5Z" />
    <path d="M10 18.8a2.1 2.1 0 0 0 4 0" />
  </svg>
);

export function TopBar() {
  const { user, isAdmin, logout } = useAuth();
  const { editOn, editAvailable, gridOn, setGridOn, toggleEdit, requestExit, guardNav } = useMainStore();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuSet, , menuLoaded] = useMenuSettings(); // 選單管理（5.2）— 顯示・順序・名稱
  const { boards, loaded: boardsLoaded } = useBoards(); // 多留言板（5.2）— 動態反映至留言板群組
  const { map: secMap } = useSections();
  const { links } = useCustomLinks();                    // 自訂連結（v2.0 使用者要求）                 // 多個建立的區段（v2.0）— 圖庫・日記等
  // 在載入儲存設定之前不繪製選單・Logo — 防止重新整理時預設配置閃爍（v1.9）
  const ready = menuLoaded && boardsLoaded;
  const menu = ready
    ? buildMenu(menuSet, [...boardEntries(boards), ...sectionMenuEntries(secMap), ...linkEntries(links)], { loggedIn: !!user, isAdmin, id: user?.id })
    : [];
  const [site, , siteLoaded] = useSiteSettings();    // Logo 文字／副標題／對齊（5.2）
  const avatarSrc = useBlobUrl(user?.avatarUrl);     // 個人資料圖片（我的頁面，v1.9）
  const userRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen && !notifOpen) return;
    const close = (e: MouseEvent) => {
      if (!userRef.current?.contains(e.target as Node)) { setMenuOpen(false); setNotifOpen(false); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen, notifOpen]);

  // 通知（4.13）— 透過發生位置的自訂事件更新
  const [notifs, setNotifs] = useState<Notif[]>([]);
  const [notifVer, setNotifVer] = useState(0); // 用於設定切換重新渲染
  useEffect(() => {
    const load = () => { setNotifs(readNotifs()); setNotifVer(v => v + 1); };
    load();
    window.addEventListener(NOTIF_EVENT, load);
    window.addEventListener('storage', load); // 其他分頁
    return () => { window.removeEventListener(NOTIF_EVENT, load); window.removeEventListener('storage', load); };
  }, []);
  /* 取得伺服器上累積的我的通知（v2.0 分支回報 — 因為儲存在裝置上，其他人留下的通知沒有收到）。
     登入時執行一次 + 即時訊號（新增資料列）+ 回到視窗時（30 秒間隔限制由 syncNotifs 負責） */
  useEffect(() => {
    if (!user) return;
    void syncNotifs(user.id, true);
    const off = subscribeTable('notifications', () => void syncNotifs(user.id, true));
    const onFocus = () => void syncNotifs(user.id);
    window.addEventListener('focus', onFocus);
    return () => { off(); window.removeEventListener('focus', onFocus); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);
  const myNotifs = user ? notifs.filter(n => n.toUserId === user.id) : [];
  const unread = myNotifs.filter(n => !n.read);
  // 選單上的小圓點 — 有未讀通知所指向的頁面（該選單顯示徽章，4.13）
  const dotHrefs = new Set(unread.map(n => n.href));
  const fmtNd = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const mySet = user ? notifSettings(user.id) : null;
  void notifVer;

  // 編輯模式中，移動前先確認是否退出（v1.8）
  // 再次點擊目前正在查看的選單時，重新載入該頁面 — 感覺像重新進入一次（v1.9 使用者要求）
  const nav = (href: string) => {
    // 自訂連結可以設定其他網站的完整網址（v2.0）— 外部網站以新視窗開啟
    if (/^https?:\/\//.test(href)) { window.open(href, '_blank'); return; }
    if (guardNav(href)) return;
    // 再次點擊相同選單 — 不使用瀏覽器重新整理，而是將頁面重新繪製為初始狀態（不讓 BGM 中斷，v1.9）。
    // **必須連 query 一起比較**（v2.0 使用者詢問後發現）— 只看路徑時，從 /board?b=2 點擊 /board
    // 會被誤認為是「相同選單」，導致整個移動被阻擋。因為多個建立的留言板・圖庫・日記
    // 都透過相同路徑搭配 query 區分，所以無法返回預設項目。
    const cur = pathname + window.location.search;
    if (href === cur) { refreshPage(); return; }
    router.push(href);
  };

  // 上層選單數量不限（v1.9）— 超出導覽列寬度的項目會自動移至「⋯」下拉選單（priority+）
  const gnbRef = useRef<HTMLElement>(null);
  const measureRef = useRef<HTMLDivElement>(null);
  const [visCount, setVisCount] = useState(menu.length);
  const menuKey = menu.map(m => m.label).join('|');
  useEffect(() => {
    const gnbEl = gnbRef.current, mEl = measureRef.current;
    if (!gnbEl || !mEl) return;
    const GAP = 2;
    const compute = () => {
      const avail = gnbEl.clientWidth;
      const kids = Array.from(mEl.children) as HTMLElement[];
      if (avail <= 0) {                            // gnb 隱藏（手機版）・未顯示狀態 — 無法測量時顯示全部
        setVisCount(kids.length - 1);
        return;
      }
      const moreW = kids[kids.length - 1]?.offsetWidth ?? 40;   // 最後一個 = ⋯ 測量用
      const widths = kids.slice(0, -1).map(k => k.offsetWidth);
      const total = widths.reduce((a, w) => a + w, 0) + GAP * Math.max(0, widths.length - 1);
      let count = widths.length;
      if (total > avail) {
        const limit = avail - moreW - GAP;
        let used = 0; count = 0;
        for (const w of widths) {
          if (used + w > limit) break;
          used += w + GAP; count++;
        }
      }
      setVisCount(c => (c === count ? c : count));
    };
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(gnbEl); ro.observe(mEl);
    window.addEventListener('resize', compute);
    return () => { ro.disconnect(); window.removeEventListener('resize', compute); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menuKey]);
  const visMenu = menu.slice(0, visCount);
  const moreMenu = menu.slice(visCount);

  return (
    <header className="topbar">
      {/* Logo — 文字・副標題・對齊設定位於環境設定 > 設計（5.2） */}
      <div className="brand" onClick={() => nav('/')}>
        {siteLoaded && site.title}
        {siteLoaded && site.subtitle && <small className={`al-${site.align}`}>{site.subtitle}</small>}
      </div>

      <nav className="gnb" ref={gnbRef}>
        {visMenu.map(item =>
          item.children ? (
            <div className="grp" key={item.label}>
              {/* 點擊上層 → 第一個下層頁面（v1.8）・有未讀通知的選單顯示小圓點（4.13） */}
              <button onClick={() => nav(item.children![0].href)}>
                {item.label}{item.children.some(c => dotHrefs.has(c.href)) && <small className="nd">●</small>}
              </button>
              <div className="sub">
                {item.children.map(c => (
                  <button key={c.href} onClick={() => nav(c.href)}>
                    {c.label}{dotHrefs.has(c.href) && <small className="nd">●</small>}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              key={item.label}
              className={pathname === item.href ? 'on' : ''}
              onClick={() => nav(item.href!)}
            >
              {item.label}{dotHrefs.has(item.href!) && <small className="nd">●</small>}
            </button>
          )
        )}
        {/* 超出寬度的上層選單 — ⋯ 下拉選單（群組顯示標題＋下層項目，單獨項目直接移動） */}
        {moreMenu.length > 0 && (
          <div className="grp more">
            <button aria-label="更多">
              ⋯{moreMenu.some(m => (m.children ?? [{ href: m.href! }]).some(c => dotHrefs.has(c.href!))) && <small className="nd">●</small>}
            </button>
            <div className="sub">
              {moreMenu.map(item =>
                item.children ? (
                  <div className="sub-grp" key={item.label}>
                    <div className="sub-cap">{item.label}</div>
                    {item.children.map(c => (
                      <button key={c.href} onClick={() => nav(c.href)}>
                        {c.label}{dotHrefs.has(c.href) && <small className="nd">●</small>}
                      </button>
                    ))}
                  </div>
                ) : (
                  <button key={item.label} onClick={() => nav(item.href!)}>
                    {item.label}{dotHrefs.has(item.href!) && <small className="nd">●</small>}
                  </button>
                ))}
            </div>
          </div>
        )}
        {/* 用於測量寬度的副本（不顯示）— 最後一個項目是 ⋯ 按鈕寬度 */}
        <div className="gnb gnb-measure" ref={measureRef} aria-hidden>
          {menu.map(item => <button key={item.label} tabIndex={-1}>{item.label}{item.children && <span> ▾</span>}</button>)}
          <button tabIndex={-1}>⋯</button>
        </div>
      </nav>

      {/* 新增 Widget — 位於網格切換左側（v1.9 使用者確認：取代正文下方按鈕） */}
      {editOn && pathname === '/' && (
        <button className="btn btn-ghost" style={{ height: 27, padding: '0 11px', fontSize: 10.5, whiteSpace: 'nowrap' }}
          onClick={() => window.dispatchEvent(new Event('ohome-add-widget'))}>＋ Widget</button>
      )}
      {/* 網格切換 — 僅在首頁開啟編輯模式時顯示（v1.9） */}
      <KToggle
        className={`grid-chip ${editOn && pathname === '/' ? 'show' : ''}`}
        label="網格"
        checked={gridOn}
        onChange={setGridOn}
      />
      {/* 編輯中顯示 — 點擊時確認退出（v1.8） */}
      <span className={`edit-flag ${editOn ? 'show' : ''}`} onClick={() => requestExit()}>
        ✎ 編輯中
      </span>

      {/* 使用者區域 — 未登入：登入按鈕／已登入：個人資料下拉選單（第 3 章註解，4.0） */}
      {user ? (
        <div className="user-wrap" ref={userRef}>
          <div className="user-chip" onClick={() => setMenuOpen(o => !o)}>
            {/* 通知鈴鐺（4.13）— 點擊時開啟通知下拉選單（與個人資料選單分開） */}
            <span className="badge-dot" data-n={String(Math.min(9, unread.length))}
              onClick={e => { e.stopPropagation(); setMenuOpen(false); setNotifOpen(o => !o); }}>
              <BellIcon />
            </span>
            {/* 預設頭像不使用縮寫字母，改為單色／漸層 */}
            <div className="avatar" style={!avatarSrc && user.avatarColor ? { background: user.avatarColor } : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            {user.nickname} <span style={{ fontSize: 9, color: '#8d939d' }}>▾</span>
          </div>
          {/* 通知下拉選單 — 列表＋全部讀取＋各項目開／關（4.13） */}
          <div className={`user-menu notif-menu ${notifOpen ? 'open' : ''}`}>
            <div className="nh">
              <b>通知</b>
              {unread.length > 0 && (
                <button className="all" onClick={() => markAllRead(user.id)}>全部讀取</button>
              )}
              {/* 已讀通知一天後會自動消失，但如果想立即清除，可以使用此功能（v2.0 使用者要求） */}
              {myNotifs.some(n => n.read) && (
                <button className="all" onClick={() => clearReadNotifs(user.id)}>整理已讀通知</button>
              )}
            </div>
            {myNotifs.length === 0 && <p className="empty">目前沒有通知</p>}
            {myNotifs.slice(0, 12).map(n => (
              <button key={n.id} className={`nt ${n.read ? 'rd' : ''}`}
                onClick={() => { markRead(n.id); setNotifOpen(false); nav(n.href); }}>
                <b>{n.title}</b>
                {n.body && <span>{n.body}</span>}
                <small>{fmtNd(n.date)}</small>
              </button>
            ))}
            {mySet && (
              <div className="nset">
                {(Object.keys(NOTIF_TYPE_LABEL) as NotifType[])
                  .filter(k => k !== 'guest' || isAdmin) // 訪客留言通知為管理員項目
                  .map(k => (
                    <label key={k} className="row">
                      <span>{NOTIF_TYPE_LABEL[k]}</span>
                      <KToggle checked={mySet[k]} onChange={v => setNotifSetting(user.id, k, v)} />
                    </label>
                  ))}
                {/* 通知傳遞自我診斷（v2.0）— 實際執行伺服器儲存→讀取，並告知結果 */}
                <button className="all" style={{ marginTop: 2 }}
                  onClick={async () => { toast(await selfTestNotif(user.id)); void syncNotifs(user.id, true); }}>
                  確認通知傳遞
                </button>
              </div>
            )}
          </div>
          <div className={`user-menu ${menuOpen ? 'open' : ''}`}>
            <button onClick={() => { setMenuOpen(false); nav('/mypage'); }}>修改資料</button>
            {isAdmin && (
              <>
                {/* 編輯模式項目僅在支援頁面顯示（編輯中時為了能關閉，所以始終顯示） */}
                {(editAvailable || editOn) && (
                  <button onClick={() => { setMenuOpen(false); toggleEdit(); }}>
                    編輯模式 {editOn ? '關閉' : '開啟'}
                  </button>
                )}
                <button onClick={() => { setMenuOpen(false); nav('/settings'); }}>環境設定</button>
              </>
            )}
            <button onClick={() => { setMenuOpen(false); logout(); }}>登出</button>
          </div>
        </div>
      ) : (
        <button className="login-link" onClick={() => nav('/login')}>登入</button>
      )}
    </header>
  );
}