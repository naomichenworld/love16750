'use client';
// BGM 迷你播放器（4.1）— YouTube IFrame API，畫面隱藏，只顯示自訂控制項
// 預設位置右下角 · 歌曲列表彈窗（v1.9）· 頁面切換時也維持（常駐版面）
// 受瀏覽器政策限制，聲音播放會從使用者第一次點擊開始
import React, { useEffect, useRef, useState } from 'react';
import { useBgm } from '@/lib/bgmStore';

/** 流動文字 — 只有播放中且文字超出時才無限捲動，平時使用省略號。
 *  超出判定使用隱藏測量用 span — 如果只在元件掛載後（版面・字型尚未確定時）測量 1 次，
 *  短標題也會被誤判為需要流動文字的 Bug，因此使用 ResizeObserver 持續重新測量 */
function Marquee({ text, active, className }: { text: string; active: boolean; className?: string }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const measRef = useRef<HTMLSpanElement>(null);
  const [over, setOver] = useState(false);
  useEffect(() => {
    const box = boxRef.current, meas = measRef.current;
    if (!box || !meas) return;
    const m = () => setOver(meas.scrollWidth > box.clientWidth + 1);
    m();
    const ro = new ResizeObserver(m);
    ro.observe(box);
    ro.observe(meas);
    return () => ro.disconnect();
  }, [text]);
  const run = active && over;
  return (
    <div ref={boxRef} className={`mq ${className ?? ''} ${run ? 'run' : ''}`} style={{ position: 'relative' }}>
      <span ref={measRef} aria-hidden
        style={{ position: 'absolute', visibility: 'hidden', whiteSpace: 'nowrap', pointerEvents: 'none' }}>
        {text}
      </span>
      {run ? <span className="mq-in"><span>{text}</span><span>{text}</span></span> : text}
    </div>
  );
}

/* 最基本的 YT IFrame API 型別 */
interface YTPlayer {
  loadVideoById: (id: string) => void;
  cueVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setVolume: (v: number) => void;
  destroy: () => void;
}
declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, opts: unknown) => YTPlayer; PlayerState: { ENDED: number } };
    onYouTubeIframeAPIReady?: () => void;
  }
}

// 歌曲列表圖示（列表線條 + 音符）— 顏色與 CSS 的 currentColor（--bgm-ic）連動
const ListIcon = () => (
  <svg viewBox="0 0 24 24">
    <path d="M21 15V6" />
    <circle cx="18.5" cy="15.5" r="2.5" />
    <path d="M16 6H3" /><path d="M12 12H3" /><path d="M12 18H3" />
  </svg>
);

export function BgmPlayer() {
  const { state } = useBgm();
  const { tracks, settings } = state;
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [volume, setVolume] = useState(settings.volume);
  // 摺疊狀態 — 每位訪客分別記憶（4.1）
  const [folded, setFolded] = useState(false);
  const playerRef = useRef<YTPlayer | null>(null);
  const readyRef = useRef(false);       // 只有在 onReady 之後 playVideo 才會實際運作（之前會被忽略）
  const startedRef = useRef(false);     // 曾經實際開始播放過 — 第一次播放必須走 loadVideoById 路徑
  const rootRef = useRef<HTMLDivElement>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const volRef = useRef<HTMLDivElement>(null);
  const idxRef = useRef(0);
  idxRef.current = idx;
  const track = tracks[idx] ?? tracks[0];

  useEffect(() => { setVolume(settings.volume); playerRef.current?.setVolume(settings.volume); }, [settings.volume]);

  useEffect(() => {
    try { setFolded(localStorage.getItem('ohome.bgm.fold') === '1'); } catch { /* 忽略 */ }
  }, []);
  const setFold = (v: boolean) => {
    setFolded(v);
    setListOpen(false);
    try { localStorage.setItem('ohome.bgm.fold', v ? '1' : '0'); } catch { /* 忽略 */ }
  };

  // 載入 YT API + 建立播放器
  useEffect(() => {
    if (!settings.enabled || tracks.length === 0) return;
    let cancelled = false;
    const create = () => {
      if (cancelled || !holderRef.current || playerRef.current) return;
      playerRef.current = new window.YT!.Player(holderRef.current, {
        width: 0, height: 0,
        videoId: tracks[0].videoId,
        playerVars: { controls: 0, disablekb: 1 },
        events: {
          onReady: () => {
            readyRef.current = true;
            // 自動播放已進入準備狀態（第一次互動早於播放器準備完成）時，立即開始
            if (armedRef.current) {
              armedRef.current = false;
              playAtRef.current(idxRef.current);
            }
          },
          onStateChange: (e: { data: number }) => {
            // 1=播放，2=暫停，0=結束 — 忽略緩衝（3）· 排程（5）等過渡狀態
            if (e.data === 0) {
              nextRef.current(); // 歌曲結束 → 重複／下一首歌曲（支援隨機播放）
            } else if (e.data === 1) {
              startedRef.current = true;
              setPlaying(true);
            } else if (e.data === 2) {
              setPlaying(false);
            } else if (e.data === -1) {
              // 未開始（包括播放被瀏覽器政策阻擋的情況）— 不要顯示成「正在播放」
              // （正常開始時也會經過 -1→3→1，因此會短暫顯示 ▶，之後在 1 時恢復）
              setPlaying(false);
              startedRef.current = false;
            }
          },
        },
      });
    };
    if (window.YT?.Player) create();
    else {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); create(); };
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script');
        s.id = 'yt-iframe-api';
        s.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(s);
      }
    }
    return () => {
      cancelled = true;
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.enabled, tracks.length > 0]);

  const playAt = (i: number) => {
    const t = tracks[i];
    if (!t || !playerRef.current) { setIdx(i); return; }
    setIdx(i);
    startedRef.current = true;
    // loadVideoById 是載入 + 立即播放 — 為避免只進入佇列的第一部影片呼叫 playVideo() 被忽略的
    // YouTube IFrame 問題，第一次播放也必須經過這條路徑
    playerRef.current.loadVideoById(t.videoId);
    playerRef.current.setVolume(volume);
    playerRef.current.playVideo();
    setPlaying(true); // 按鈕立即反映（事件僅作為修正）
  };
  const playAtRef = useRef(playAt);
  playAtRef.current = playAt;

  const next = () => {
    if (tracks.length === 0) return;
    const cur = idxRef.current;
    let n: number;
    if (settings.shuffle && tracks.length > 1) {
      do { n = Math.floor(Math.random() * tracks.length); } while (n === cur);
    } else {
      n = cur + 1;
      if (n >= tracks.length) {
        if (!settings.repeat) { setPlaying(false); return; }
        n = 0;
      }
    }
    playAt(n);
  };
  const nextRef = useRef(next);
  nextRef.current = next;

  // 進入時自動播放（4.1）— 受瀏覽器政策限制，無法完全自動播放，
  // 因此會在訪客的「第一次互動（點擊／按鍵）」同時開始播放（僅 1 次）
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const armedRef = useRef(false);
  useEffect(() => {
    if (!settings.autoplay || !settings.enabled || tracks.length === 0) return;
    const fire = (ev: Event) => {
      remove();
      // 操作播放器本身的點擊（播放／上一首／下一首等）交由按鈕處理 —
      // 如果在這裡先開始播放，緊接著到來的按鈕 click 會變成「暫停」
      if (rootRef.current?.contains(ev.target as Node)) return;
      if (playingRef.current) return;
      if (readyRef.current && playerRef.current) {
        // 第一次播放使用 loadVideoById 路徑（避免佇列狀態下 playVideo 被忽略的問題）
        playAtRef.current(idxRef.current);
      } else {
        // 播放器準備完成前（onReady 之前）播放指令會被忽略 — 設定為待命，準備完成後立即播放
        armedRef.current = true;
      }
    };
    const remove = () => {
      window.removeEventListener('pointerdown', fire, true);
      window.removeEventListener('keydown', fire, true);
    };
    window.addEventListener('pointerdown', fire, true);
    window.addEventListener('keydown', fire, true);
    return remove;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings.autoplay, settings.enabled, tracks.length]);

  const prev = () => playAt((idxRef.current - 1 + tracks.length) % tracks.length);

  const togglePlay = () => {
    if (!playerRef.current) return;
    if (playing) {
      playerRef.current.pauseVideo();
      setPlaying(false); // 按鈕立即反映
    } else if (!readyRef.current) {
      armedRef.current = true; // 準備完成前先待命 — onReady 時立即播放
    } else if (!startedRef.current) {
      playAt(idxRef.current); // 第一次播放 — 避免佇列狀態下 playVideo 被忽略的問題
    } else {
      // 暫停後恢復 — 為了維持播放位置，使用 playVideo
      playerRef.current.setVolume(volume);
      playerRef.current.playVideo();
      setPlaying(true);
    }
  };

  const onVolDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const set = (clientX: number) => {
      const r = volRef.current!.getBoundingClientRect();
      const v = Math.round(Math.min(1, Math.max(0, (clientX - r.left) / r.width)) * 100);
      setVolume(v);
      playerRef.current?.setVolume(v);
    };
    set(e.clientX);
    const mv = (ev: PointerEvent) => set(ev.clientX);
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv);
    window.addEventListener('pointerup', up);
  };

  if (!settings.enabled || tracks.length === 0) return null;

  return (
    <div
      ref={rootRef}
      className={`bgm ${folded ? 'folded' : ''} ${settings.position === 'bl' ? 'bgm-left' : ''}`}
      style={settings.position === 'bl' ? { right: 'auto', left: 20 } : undefined}
      onClick={() => { if (folded) setFold(false); }}
      data-tip={folded ? '展開' : undefined}
    >
      {/* 隱藏的 YouTube 播放器 */}
      <div style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', opacity: 0, pointerEvents: 'none' }}>
        <div ref={holderRef} />
      </div>
      <div className="disc" style={{ animationPlayState: playing ? 'running' : 'paused' }} />
      <div className="title">
        {/* 流動文字只套用於標題 — 說明文字始終使用省略號（避免畫面太混亂） */}
        <Marquee className="tt" text={track?.title ?? ''} active={playing} />
        {track?.desc && <div className="mq">{track.desc}</div>}
      </div>
      <div className="ctrl">
        <button onClick={prev} data-tip="上一首">◂◂</button>
        <button onClick={togglePlay} data-tip={playing ? '暫停' : '播放'}>{playing ? '❚❚' : '▶'}</button>
        <button onClick={next} data-tip="下一首">▸▸</button>
        <button className="lst" data-tip="BGM 列表" onClick={e => { e.stopPropagation(); setListOpen(o => !o); }}>
          <ListIcon />
        </button>
      </div>
      <div className="vol" ref={volRef} onPointerDown={onVolDrag} data-tip={`音量 ${volume}`}>
        <i style={{ width: `${volume}%` }} />
      </div>
      {/* 摺疊 — 只留下唱片（4.1）· 箭頭朝摺疊方向（螢幕邊緣方向） */}
      <button className="fold-btn" data-tip="摺疊" onClick={e => { e.stopPropagation(); setFold(true); }}>
        {settings.position === 'bl' ? '«' : '»'}
      </button>
      {/* 歌曲列表彈窗（v1.9）— 點擊外部時關閉 */}
      {listOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: -1 }} onClick={() => setListOpen(false)} />
          <div className="bgm-list on">
            <div className="h">BGM LIST</div>
            {tracks.map((t, i) => (
              <div key={t.id} className={`it ${i === idx ? 'on' : ''}`}
                onClick={() => { playAt(i); setListOpen(false); }}>
                <b>{t.title}</b><small>{t.desc}</small>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}