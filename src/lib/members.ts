'use client';
// 會員列表（v2.0）— 伺服器模式下使用 DB 的會員個人資料，否則使用瀏覽器帳號
import { useEffect, useState } from 'react';
import { backend, isServerMode } from './backend';

export interface MemberLite { id: string; nickname: string; role?: 'admin' | 'member' }

/** 本機（瀏覽器）帳號列表 — 沒有伺服器時進行開發使用 */
export function memberPool(): MemberLite[] {
  const base: MemberLite[] = [
    { id: 'admin', nickname: '管理員' },
    { id: 'guest', nickname: '熟人會員' },
  ];
  try {
    const reg = JSON.parse(localStorage.getItem('ohome.mockreg.v1') ?? '{}') as
      Record<string, { user?: MemberLite }>;
    for (const k of Object.keys(reg)) {
      const u = reg[k]?.user;
      if (u && !base.some(b => b.id === u.id)) base.push({ id: u.id, nickname: u.nickname });
    }
  } catch { /* 忽略 */ }
  return base;
}

/** 畫面使用的會員列表 — 伺服器模式下會從 DB 取得已註冊會員 */
export function useMembers(): MemberLite[] {
  const [list, setList] = useState<MemberLite[]>(() => (isServerMode() ? [] : memberPool()));
  useEffect(() => {
    const be = backend();
    if (!isServerMode() || !be) { setList(memberPool()); return; }
    let alive = true;
    be.listMembers()
      .then(rows => { if (alive) setList(rows.map(r => ({ id: r.id, nickname: r.nickname, role: r.role }))); })
      .catch(() => { /* 權限・網路問題時使用空列表 */ });
    return () => { alive = false; };
  }, []);
  return list;
}
