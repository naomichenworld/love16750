'use client';
// 伺服器連接啟動（v2.0）— 在 App 開始繪製之前，先讀取一次執行時設定（ohome.config.json → localStorage → env）
// 並確定 Supabase 用戶端。確定之前不繪製子元件，
// 避免出現「先以本機模式繪製一次，再切換成伺服器模式重新繪製」的閃爍。
import React, { useEffect, useState } from 'react';
import { initSupabase } from '@/lib/supabase';
import { primeSettings } from '@/lib/settingStore';

export function ServerBoot({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  // 只有等待時間較長時才顯示 — 如果很快就完成，反而會讓載入動畫閃一下，更加讓人不舒服
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let alive = true;
    const t = setTimeout(() => { if (alive) setSlow(true); }, 400);
    // 確定後端 → 一次取得網站設定（主題・選單・字體……）並快取 → 然後才繪製畫面。
    // 因為各個 Store 會在渲染時同步讀取設定，所以順序非常重要。
    initSupabase()
      .then(() => primeSettings())
      .finally(() => { if (alive) { clearTimeout(t); setReady(true); } });
    return () => { alive = false; clearTimeout(t); };
  }, []);
  // 背景（主題漸層）會在第一次繪製之前就由 body 先完成，因此這裡只需要疊加顯示內容
  if (!ready) return slow ? <div className="boot-wait"><i /></div> : null;
  return <>{children}</>;
}