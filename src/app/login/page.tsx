'use client';
// 登入頁面 (4.8) — 會員資訊視窗 Widget 只保留按鈕並移動到這裡（維持 Widget 尺寸的目的）
// 會員註冊（註冊碼）· 包含尋找密碼
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { KInput } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { EditableDesc } from '@/components/ui/PageText';

export default function LoginPage() {
  const router = useRouter();
  const { user, login, signup, findId, resetPassword, mock } = useAuth();
  const toast = useToast();
  const [id, setId] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const [signupOpen, setSignupOpen] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  // 會員註冊表單
  const [sId, setSId] = useState('');
  const [sPw, setSPw] = useState('');
  const [sNick, setSNick] = useState('');
  const [sEmail, setSEmail] = useState('');   // 註冊 Email (v1.9 — 用於尋找 ID／重設密碼)
  const [sCode, setSCode] = useState('');
  const [sErr, setSErr] = useState('');
  // 尋找 ID／密碼
  const [fEmail, setFEmail] = useState('');
  const [fErr, setFErr] = useState('');
  const [fInfo, setFInfo] = useState('');     // 結果提示（ID・臨時密碼）

  // 如果已經登入，則前往主頁
  useEffect(() => { if (user) router.replace('/'); }, [user, router]);

  const doLogin = async () => {
    setErr('');
    const r = await login(id.trim(), pw);
    if (!r.ok) { setErr(r.error ?? '登入失敗'); return; }
    toast('已登入');
    router.push('/');
  };

  const doSignup = async () => {
    setSErr('');
    // 伺服器模式中，ID 就是 Email — 不另外取得，直接使用
    const r = await signup(sId.trim(), sPw, sNick.trim(), sCode.trim(), (mock ? sEmail : sId).trim());
    if (!r.ok) { setSErr(r.error ?? '註冊失敗'); return; }
    setSignupOpen(false);
    toast(mock ? '已註冊 — 請使用建立的帳號登入' : '已註冊 — 請完成 Email 驗證後登入');
  };

  // 尋找 ID (v1.9) — 使用註冊 Email
  const doFindId = async () => {
    setFErr(''); setFInfo('');
    const r = await findId(fEmail.trim());
    if (!r.ok) { setFErr(r.error ?? '請求失敗'); return; }
    setFInfo(`ID: ${r.foundId}`);
  };

  const doFind = async () => {
    setFErr(''); setFInfo('');
    const r = await resetPassword(fEmail.trim());
    if (!r.ok) { setFErr(r.error ?? '請求失敗'); return; }
    if (r.tempPassword) setFInfo(`臨時密碼: ${r.tempPassword} — 登入後請在我的頁面修改`);
    else { setFindOpen(false); toast('重設連結已寄送至 Email'); }
  };

  return (
    <section className="page">
      {/* 標題置中於卡片內 (v1.9 — 不是選單頁面，因此不在上方放置大標題) */}
      <div className="panel" style={{ padding: 28, maxWidth: 480, margin: '40px auto 0' }}>
        <h1 style={{
          fontFamily: 'var(--serif)', fontSize: 24, letterSpacing: '.3em', textAlign: 'center',
          margin: '4px 0 6px', color: 'var(--ink)',
        }}>LOGIN</h1>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <EditableDesc k="login-desc" def="登入後即可查看會員專屬內容" />
        </div>
        <div style={{ display: 'grid', gap: 9 }}>
          <KInput placeholder="ID" value={id} onChange={e => setId(e.target.value)} />
          <KInput placeholder="密碼" type="password" value={pw} onChange={e => setPw(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') doLogin(); }} />
          {err && <p style={{ fontSize: 11.5, color: 'var(--accent)' }}>{err}</p>}
          <button className="btn btn-dark" style={{ justifyContent: 'center', padding: 10 }} onClick={doLogin}>登入</button>
        </div>
        <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
            onClick={() => setSignupOpen(true)}>會員註冊</button>
          <button className="btn btn-ghost" style={{ flex: 1, justifyContent: 'center', padding: 7, fontSize: 11 }}
            onClick={() => setFindOpen(true)}>尋找密碼</button>
        </div>
        {/* (v1.9) 移除開發用預設帳號提示 — 因為可在安裝頁面直接指定帳號，正式部署版本不需要 */}
      </div>

      {/* 會員註冊 Modal (4.8 — 註冊碼方式) */}
      <Modal open={signupOpen} onClose={() => setSignupOpen(false)} small
        title="會員註冊" desc="需要註冊碼（邀請碼）才能註冊"
        dirty={!!(sId || sPw || sNick || sCode)}
        actions={<>
          <button className="btn btn-ghost" onClick={() => setSignupOpen(false)}>取消</button>
          <button className="btn btn-dark" onClick={doSignup}>註冊</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <KInput placeholder={mock ? 'ID' : 'Email（ID）'} value={sId} onChange={e => setSId(e.target.value)} />
          <KInput placeholder="密碼" type="password" value={sPw} onChange={e => setSPw(e.target.value)} />
          <KInput placeholder="暱稱" value={sNick} onChange={e => setSNick(e.target.value)} />
          {/* 伺服器模式中 Email 就是 ID，因此不再次輸入（只有本機帳號需要另外輸入） */}
          {mock && (
            <KInput placeholder="Email — 用於尋找 ID・密碼" value={sEmail} onChange={e => setSEmail(e.target.value)} />
          )}
          <KInput placeholder="註冊碼" value={sCode} onChange={e => setSCode(e.target.value)} />
          {sErr && <p style={{ fontSize: 11.5, color: 'var(--accent)' }}>{sErr}</p>}
        </div>
      </Modal>

      {/* 尋找 ID・密碼 Modal (4.8, v1.9) — 以註冊 Email 為依據 */}
      <Modal open={findOpen} onClose={() => { setFindOpen(false); setFInfo(''); setFErr(''); }} small
        title={mock ? '尋找 ID・密碼' : '重設密碼'}
        desc={mock
          ? '可以使用註冊時登錄的 Email 尋找 ID 或取得臨時密碼'
          : '將重設連結寄送至註冊的 Email'}
        dirty={!!fEmail}
        actions={<>
          <button className="btn btn-ghost" onClick={() => { setFindOpen(false); setFInfo(''); setFErr(''); }}>取消</button>
          {/* 伺服器模式中 Email 就是 ID，因此「尋找 ID」沒有意義 */}
          {mock && <button className="btn btn-ghost" onClick={doFindId}>尋找 ID</button>}
          <button className="btn btn-dark" onClick={doFind}>{mock ? '臨時密碼' : '寄送'}</button>
        </>}>
        <div style={{ display: 'grid', gap: 9 }}>
          <KInput placeholder="Email" value={fEmail} onChange={e => setFEmail(e.target.value)} />
          {fErr && <p style={{ fontSize: 11.5, color: 'var(--accent)' }}>{fErr}</p>}
          {fInfo && <p style={{ fontSize: 12, color: 'var(--ink)', fontWeight: 600 }}>{fInfo}</p>}
        </div>
      </Modal>
    </section>
  );
}