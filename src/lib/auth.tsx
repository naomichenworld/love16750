'use client';
// 驗證 Context（v2.0）——委派給後端適配器（Supabase / Firebase）。
// 如果沒有後端設定（開發・離線），則使用瀏覽器內的本機帳號運作。
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { backend, isServerMode } from './backend';
import { setCurrentUserId } from './currentUser';
import { getSetting, setSetting } from './settingStore';

export type Role = 'admin' | 'member' | 'guest';

export interface User {
  id: string;
  nickname: string;
  role: Role;
  avatarUrl?: string;    // 個人檔案圖片（檔案參照或 URL）
  avatarColor?: string;  // 單色頭像（沒有圖片時使用）
  email?: string;
}

type Result = { ok: boolean; error?: string };

interface AuthCtx {
  user: User | null;          // null = 未登入
  isAdmin: boolean;
  login: (id: string, password: string) => Promise<Result>;
  signup: (id: string, password: string, nickname: string, inviteCode: string, email?: string) => Promise<Result>;
  findId: (email: string) => Promise<Result & { foundId?: string }>;
  resetPassword: (email: string) => Promise<Result & { tempPassword?: string }>;
  logout: () => Promise<void>;
  updateProfile: (patch: { nickname?: string; avatarUrl?: string | null; avatarColor?: string | null; currentPassword?: string; newPassword?: string }) => Promise<Result>;
  /** 是否在沒有連接伺服器（DB）的情況下，以瀏覽器帳號運作——開發・離線 */
  mock: boolean;
  /** 是否已確認目前正在查看的人是誰（v2.0）——剛開始的一個瞬間會一直顯示「未登入」。
   * 如果在這段時間判斷權限，管理員也會短暫閃現「非公開」畫面。 */
  ready: boolean;
}

const Ctx = createContext<AuthCtx | null>(null);
const MOCK_KEY = 'ohome.mockuser.v1';
const MOCK_REG_KEY = 'ohome.mockreg.v1';
const INVITE_KEY = 'ohome.invite.v1';    // 加入碼——環境設定 > 會員／安全性
const SETUP_KEY = 'ohome.setup.v1';      // 是否已完成安裝畫面

/** 目前的加入碼——管理員設定的值（伺服器共享），沒有設定時預設為 WELCOME */
export function inviteCode(): string {
  return getSetting<string>(INVITE_KEY, 'WELCOME') || 'WELCOME';
}
export function setInviteCode(code: string) {
  setSetting(INVITE_KEY, code.trim());
}

export function isSetupDone(): boolean {
  try { return !!localStorage.getItem(SETUP_KEY); } catch { return false; }
}
export function markSetupDone() {
  try { localStorage.setItem(SETUP_KEY, JSON.stringify({ done: true, at: new Date().toISOString() })); } catch { /* 忽略 */ }
}

/* ---------- 本機帳號（沒有後端時進行開發） ---------- */

const MOCK_ACCOUNTS: Record<string, { password: string; user: User }> = {
  admin: { password: '0000', user: { id: 'admin', nickname: '管理員', role: 'admin' } },
  guest: { password: '0000', user: { id: 'guest', nickname: '熟人會員', role: 'member' } },
};

function mockRegistry(): Record<string, { password: string; user: User }> {
  try { return JSON.parse(localStorage.getItem(MOCK_REG_KEY) ?? '{}'); } catch { return {}; }
}

/** 查詢會員個人檔案（管理員會員詳細資料）——僅在本機模式下有意義 */
export function mockMemberInfo(id: string): User | null {
  const hit = mockRegistry()[id]?.user ?? (isSetupDone() ? undefined : MOCK_ACCOUNTS[id]?.user);
  return hit ? { ...hit } : null;
}

export interface SetupInput {
  adminId: string; adminPw: string; adminNick?: string;
  guestPw?: string;
}

/** 安裝本機帳號（沒有後端時使用） */
export function completeSetup(v: SetupInput): { ok: boolean; error?: string } {
  const id = v.adminId.trim();
  if (!id || !v.adminPw) return { ok: false, error: '請輸入管理員帳號和密碼。' };
  try {
    const reg = mockRegistry();
    reg[id] = { password: v.adminPw, user: { id, nickname: v.adminNick?.trim() || '管理員', role: 'admin' } };
    if (v.guestPw?.trim()) {
      reg.guest = { password: v.guestPw.trim(), user: { id: 'guest', nickname: '訪客', role: 'member' } };
    }
    localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg));
    markSetupDone();
    return { ok: true };
  } catch { return { ok: false, error: '無法儲存設定。' }; }
}

/* ---------- Context ---------- */

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const server = isServerMode();
  const be = backend();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);   // 是否已完成確認（v2.0）

  useEffect(() => {
    if (!server || !be) {
      try {
        const raw = localStorage.getItem(MOCK_KEY);
        if (raw) setUser(JSON.parse(raw));
      } catch { /* 忽略 */ }
      setReady(true);
      return;
    }
    let alive = true;
    void be.currentUser().then(u => { if (alive) { setUser(u as User | null); setReady(true); } });
    const off = be.onAuthChange(u => { if (alive) { setUser(u as User | null); setReady(true); } });
    return () => { alive = false; off(); };
  }, [server, be]);

  const login = useCallback(async (id: string, password: string): Promise<Result> => {
    if (server && be) {
      const r = await be.signIn(id.trim(), password);
      return r.ok ? { ok: true } : { ok: false, error: r.error ?? '登入失敗。' };
    }
    const acc = mockRegistry()[id] ?? (isSetupDone() ? undefined : MOCK_ACCOUNTS[id]);
    if (!acc || acc.password !== password) return { ok: false, error: '帳號或密碼不正確。' };
    setUser(acc.user);
    try { localStorage.setItem(MOCK_KEY, JSON.stringify(acc.user)); } catch { /* 忽略 */ }
    return { ok: true };
  }, [server, be]);

  // 會員註冊——加入碼（邀請碼）方式
  const signup = useCallback(async (id: string, password: string, nickname: string, code: string): Promise<Result> => {
    if (!id || !password || !nickname) return { ok: false, error: '請輸入帳號・密碼・暱稱。' };
    if (code !== inviteCode()) return { ok: false, error: '加入碼不正確。' };
    if (server && be) {
      const r = await be.signUp(id.trim(), password, nickname.trim());
      if (!r.ok) return { ok: false, error: r.error ?? '註冊失敗。' };
      // 帳號建立的瞬間會進入登入狀態，使用者資訊會先被計算，
      // 這時暱稱（個人檔案）還沒儲存完成，所以電子郵件會暫時出現在名稱的位置。
      // 儲存完成後現在重新讀取一次，立即修正名稱。
      try { const u = await be.currentUser(); if (u) setUser(u); } catch { /* 忽略 */ }
      return { ok: true };
    }
    if (MOCK_ACCOUNTS[id] || mockRegistry()[id]) return { ok: false, error: '此帳號已被使用。' };
    const reg = mockRegistry();
    reg[id] = { password, user: { id, nickname, role: 'member' } };
    try { localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg)); } catch { /* 忽略 */ }
    return { ok: true };
  }, [server, be]);

  const findId = useCallback(async (email: string): Promise<Result & { foundId?: string }> => {
    if (!email.trim()) return { ok: false, error: '請輸入電子郵件。' };
    if (server) return { ok: false, error: '電子郵件就是帳號——請直接使用電子郵件登入。' };
    const hit = Object.values(mockRegistry()).find(a => a.user.email?.toLowerCase() === email.trim().toLowerCase());
    return hit ? { ok: true, foundId: hit.user.id } : { ok: false, error: '沒有使用此電子郵件註冊的帳號。' };
  }, [server]);

  const resetPassword = useCallback(async (email: string): Promise<Result & { tempPassword?: string }> => {
    if (!email.trim()) return { ok: false, error: '請輸入電子郵件。' };
    if (server && be) {
      const r = await be.resetPassword(email.trim());
      return r.ok ? { ok: true } : { ok: false, error: r.error };
    }
    const reg = mockRegistry();
    const hit = Object.entries(reg).find(([, a]) => a.user.email?.toLowerCase() === email.trim().toLowerCase());
    if (!hit) return { ok: false, error: '沒有使用此電子郵件註冊的帳號。' };
    const temp = Math.random().toString(36).slice(2, 8);
    reg[hit[0]] = { ...hit[1], password: temp };
    try { localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg)); } catch { /* 忽略 */ }
    return { ok: true, tempPassword: temp };
  }, [server, be]);

  const updateProfile = useCallback(async (patch: {
    nickname?: string; avatarUrl?: string | null; avatarColor?: string | null; currentPassword?: string; newPassword?: string;
  }): Promise<Result> => {
    if (!user) return { ok: false, error: '需要先登入。' };
    if (server && be) {
      const r = await be.updateProfile(patch);
      if (!r.ok) return r;
      setUser(u => (u ? {
        ...u,
        nickname: patch.nickname?.trim() || u.nickname,
        avatarUrl: patch.avatarUrl === null ? undefined : (patch.avatarUrl ?? u.avatarUrl),
        avatarColor: patch.avatarColor === null ? undefined : (patch.avatarColor ?? u.avatarColor),
      } : u));
      return { ok: true };
    }
    const reg = mockRegistry();
    const cur = reg[user.id] ?? (isSetupDone() ? undefined : MOCK_ACCOUNTS[user.id]);
    if (!cur) return { ok: false, error: '找不到帳號。' };
    if (patch.newPassword && patch.currentPassword !== cur.password) {
      return { ok: false, error: '目前的密碼不正確。' };
    }
    const nextUser: User = {
      ...cur.user,
      nickname: patch.nickname?.trim() || cur.user.nickname,
      avatarUrl: patch.avatarUrl === null ? undefined : (patch.avatarUrl ?? cur.user.avatarUrl),
      avatarColor: patch.avatarColor === null ? undefined : (patch.avatarColor ?? cur.user.avatarColor),
    };
    reg[user.id] = { password: patch.newPassword || cur.password, user: nextUser };
    try {
      localStorage.setItem(MOCK_REG_KEY, JSON.stringify(reg));
      localStorage.setItem(MOCK_KEY, JSON.stringify(nextUser));
    } catch { /* 忽略 */ }
    setUser(nextUser);
    return { ok: true };
  }, [server, be, user]);

  const logout = useCallback(async () => {
    if (server && be) { await be.signOut(); setUser(null); return; }
    setUser(null);
    try { localStorage.removeItem(MOCK_KEY); } catch { /* 忽略 */ }
  }, [server, be]);

  // 如果是管理員，則在 body 上加入 admin——例如頁面說明編輯鉛筆圖示等
  // 讓儲存層可以在 hook 外部取得目前使用者的 id，並一併記錄
  useEffect(() => {
    document.body.classList.toggle('admin', user?.role === 'admin');
    setCurrentUserId(user?.id ?? null);
  }, [user]);

  return (
    <Ctx.Provider value={{
      user, isAdmin: user?.role === 'admin', ready,
      login, signup, findId, resetPassword, logout, updateProfile, mock: !server,
    }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth(): AuthCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}