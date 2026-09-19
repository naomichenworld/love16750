'use client';
// 會員資訊框（固定元素，4.0）— 未登入：僅顯示登入按鈕（維持 Widget 尺寸 · 表單位於 /login 頁面）
// 登入：個人資料摘要 + 我的頁面／登出
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useBlobUrl } from '@/lib/blobStore';

export function MemberBox() {
  const router = useRouter();
  const { user, logout } = useAuth();
  const avatarSrc = useBlobUrl(user?.avatarUrl);

  return (
    <div className="panel login-box" style={{ display: 'flex', flexDirection: 'column' }}>
      <h3>MEMBER</h3>
      {user ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 14 }}>
            {/* 預設頭像不使用縮寫字母，採單色／漸層（v1.9） */}
            <div style={{
              width: 42, height: 42, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
              background: avatarSrc ? undefined : (user.avatarColor ?? 'linear-gradient(135deg,#6b7280,#3c434d)'),
            }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
            </div>
            <div style={{ flex: 1 }}>
              <b style={{ fontSize: 13.5 }}>{user.nickname}</b>
              <small style={{ display: 'block', fontSize: 10.5, color: 'var(--faint)' }}>
                {user.role === 'admin' ? '管理員' : '會員'} · 通知 <span style={{ color: 'var(--accent)', fontWeight: 700 }}>0</span>
              </small>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
              onClick={() => router.push('/mypage')}>我的頁面</button>
            <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
              onClick={logout}>登出</button>
          </div>
        </>
      ) : (
        /* 未登入 — 在剩餘高度內垂直置中（v1.9） */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <p style={{ fontSize: 11.5, color: 'var(--faint)', margin: '0 0 12px', lineHeight: 1.6 }}>
            登入後即可查看會員專屬內容
          </p>
          <button className="btn btn-dark" style={{ width: '100%', justifyContent: 'center', padding: 10 }}
            onClick={() => router.push('/login')}>登入</button>
        </div>
      )}
    </div>
  );
}