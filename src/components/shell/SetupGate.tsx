'use client';
// 安裝初始畫面（v2.0）— 部署版本是公開首頁專用，因此伺服器連線是必要的。
// 選擇 Supabase / Firebase 其中一個，輸入連線資訊 → 套用規則（Schema）→ 確認連線 →
// 建立管理員帳號 → 下載設定檔（ohome.config.json），依照這個順序進行。
// 如果有備份 zip，則可以跳過上述流程直接復原。
import React, { useEffect, useState } from 'react';
import { markSetupDone, isSetupDone } from '@/lib/auth';
import { importBackup } from '@/lib/backup';
import { KInput, KTextarea } from '@/components/ui/Kit';
import { fileDrop } from '@/lib/dnd';
import {
  saveLocalConfig, configFileText, validateConfig, serverConfig, parseFirebaseSnippet,
} from '@/lib/serverConfig';
import type { BackendConfig, BackendKind } from '@/lib/backend/types';
import { createBackend } from '@/lib/backend';
import type { BackendCheck } from '@/lib/backend/types';
import { SCHEMA_SQL } from '@/lib/schemaSql';
import { FIRESTORE_RULES, STORAGE_RULES } from '@/lib/firebaseRules';

export function SetupGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [need, setNeed] = useState(false);
  const [kind, setKind] = useState<BackendKind | null>(null);

  // Supabase 輸入
  const [sbUrl, setSbUrl] = useState('');
  const [sbKey, setSbKey] = useState('');
  // Firebase 輸入 — 將從主控台複製的設定整段貼上後，會自動解析出內容
  const [fbPaste, setFbPaste] = useState('');
  const [fb, setFb] = useState({ apiKey: '', authDomain: '', projectId: '', storageBucket: '', appId: '', messagingSenderId: '' });
  // 只有在主控台建立的資料庫名稱不是 (default) 時才需要輸入（通常留空）
  const [fbDbId, setFbDbId] = useState('');

  const [checking, setChecking] = useState(false);
  const [check, setCheck] = useState<BackendCheck | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [copied, setCopied] = useState('');

  // 管理員帳號
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [nick, setNick] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);

  // 設定註冊助手 — 輸入儲存庫網址後，直接前往 GitHub 上傳頁面（不需要終端機）
  const [repo, setRepo] = useState('');
  const uploadUrl = (() => {
    const m = repo.trim().match(/github\.com\/([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i);
    return m ? `https://github.com/${m[1]}/${m[2]}/upload/main/public` : '';
  })();

  useEffect(() => {
    if (serverConfig() || isSetupDone()) { setReady(true); return; }
    setNeed(true);
    setReady(true);
  }, []);

  if (!ready) return null;
  if (!need) return <>{children}</>;

  const cfg = (): BackendConfig => (kind === 'firebase'
    ? {
        kind: 'firebase',
        apiKey: fb.apiKey.trim(),
        authDomain: fb.authDomain.trim() || `${fb.projectId.trim()}.firebaseapp.com`,
        projectId: fb.projectId.trim(),
        storageBucket: fb.storageBucket.trim() || `${fb.projectId.trim()}.appspot.com`,
        appId: fb.appId.trim(),
        messagingSenderId: fb.messagingSenderId.trim() || undefined,
        databaseId: fbDbId.trim() || undefined,
      }
    : { kind: 'supabase', url: sbUrl.trim(), anonKey: sbKey.trim() });

  // 開啟儲存空間 CORS 的指令 — 直接帶入輸入的 Bucket 名稱（備份需要包含圖片時必須設定）
  const corsCmd = [
    `echo '[{"origin":["*"],"method":["GET"],"maxAgeSeconds":3600}]' > cors.json`,
    `gcloud storage buckets update gs://${fb.storageBucket.trim() || `${fb.projectId.trim() || '我的專案'}.firebasestorage.app`} --cors-file=cors.json`,
  ].join('\n');

  const restore = async (f: File) => {
    setErr(''); setBusy(true);
    try {
      await importBackup(f);
      markSetupDone();
      window.location.reload();
    } catch {
      setErr('復原失敗 — 請確認備份 zip 檔案。');
      setBusy(false);
    }
  };

  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setRulesOpen(true);
      setErr('自動複製功能受到阻擋 — 請直接選取下方內容並複製。');
    }
  };

  const applyPaste = (text: string) => {
    setFbPaste(text);
    const v = parseFirebaseSnippet(text);
    if (v) {
      setFb(f => ({
        apiKey: v.apiKey ?? f.apiKey,
        authDomain: v.authDomain ?? f.authDomain,
        projectId: v.projectId ?? f.projectId,
        storageBucket: v.storageBucket ?? f.storageBucket,
        appId: v.appId ?? f.appId,
        messagingSenderId: v.messagingSenderId ?? f.messagingSenderId,
      }));
      setErr('');
    }
  };

  const runCheck = async () => {
    setErr(''); setCheck(null);
    const c = cfg();
    const bad = validateConfig(c);
    if (bad) { setErr(bad); return; }
    setChecking(true);
    try {
      const be = await createBackend(c);
      const r = await be.check();
      setCheck(r);
      if (!r.ok && r.reachable) setRulesOpen(true);
    } catch (e) {
      setErr(`連線失敗 — ${(e as { message?: string })?.message ?? '請確認設定值。'}`);
    }
    setChecking(false);
  };

  const signUpAdmin = async () => {
    setErr('');
    if (!email.trim() || !pw) { setErr('請輸入電子郵件與密碼。'); return; }
    if (pw !== pw2) { setErr('兩次輸入的密碼不一致。'); return; }
    if (pw.length < 6) { setErr('密碼必須至少 6 個字元。'); return; }
    setSigning(true);
    try {
      const be = await createBackend(cfg());
      let r = await be.signUp(email.trim(), pw, nick.trim() || email.split('@')[0]);
      // 如果前一次嘗試在儲存過程中中斷，只留下登入帳號 — 使用相同密碼登入後繼續進行
      if (!r.ok && /已被使用/.test(r.error ?? '')) {
        const back = await be.signIn(email.trim(), pw);
        r = back.ok ? { ok: true } : {
          ok: false,
          error: '帳號已存在 — 如果密碼不同，請到 Firebase 主控台的 Authentication → Users 刪除該帳號後再試一次。',
        };
      }
      if (!r.ok) { setErr(`建立帳號失敗 — ${r.error}`); setSigning(false); return; }
      // Firebase 必須將第一個帳號註冊為擁有者，才能成為管理員（Supabase 由 Trigger 處理）
      const claim = await be.claimOwner();
      if (!claim.ok) { setErr(`管理員註冊失敗 — ${claim.error}`); setSigning(false); return; }
      setSigned(true);
    } catch (e) {
      setErr(`建立帳號失敗 — ${(e as { message?: string })?.message ?? ''}`);
    }
    setSigning(false);
  };

  /** 註冊為 Vercel 環境變數時要貼上的內容 */
  const envText = () => {
    const c = cfg();
    return c.kind === 'supabase'
      ? `NEXT_PUBLIC_SUPABASE_URL=${c.url}\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${c.anonKey}`
      : [
          `NEXT_PUBLIC_FIREBASE_API_KEY=${c.apiKey}`,
          `NEXT_PUBLIC_FIREBASE_PROJECT_ID=${c.projectId}`,
          `NEXT_PUBLIC_FIREBASE_APP_ID=${c.appId}`,
          `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${c.authDomain}`,
          `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${c.storageBucket}`,
          ...(c.databaseId ? [`NEXT_PUBLIC_FIREBASE_DATABASE_ID=${c.databaseId}`] : []),
        ].join('\n');
  };

  const downloadConfig = () => {
    const blob = new Blob([configFileText(cfg())], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'ohome.config.json';
    a.click();
    URL.revokeObjectURL(u);
  };

  const start = () => {
    saveLocalConfig(cfg());
    markSetupDone();
    window.location.reload();
  };

  const doneStep = signed || (check?.ok && check.hasAdmin);

  return (
    <div className="setup-wrap">
      <div className="panel setup-box wide">
        <h1>O.HOME</h1>
        <p className="d">正在首次開啟首頁 — 連接資料庫後即可開始</p>
        {/* 進入別人已完成的首頁卻出現這個畫面的情況（v2.0 Fork 回報）— 擁有者的連線設定
            只儲存在該瀏覽器中，沒有部署到網站。留下提示，讓訪客可以將相關資訊告知擁有者 */}
        <p className="hint" style={{ margin: '2px 0 10px' }}>
          如果你是透過已完成的首頁網址進入，卻看到這個畫面 — 代表首頁擁有者還沒有完成安裝最後一步
          「讓訪客也能看到」（上傳 ohome.config.json）。請告知首頁擁有者。
        </p>

        {/* ── 後端選擇 ───────────────────────────────────── */}
        {!kind && (
          <>
            <button type="button" className="setup-pick" onClick={() => setKind('supabase')}>
              <b>Supabase</b>
              <small>基於 Postgres。免費開始（儲存空間 1GB）— 適合文章較多、圖片較少的首頁。</small>
            </button>
            <button type="button" className="setup-pick" onClick={() => setKind('firebase')}>
              <b>Firebase</b>
              <small>依使用量計費（無固定費用）。圖片儲存免費額度有 5GB — 適合圖片較多的首頁。</small>
            </button>
          </>
        )}

        {/* ── 連線步驟 ─────────────────────────────────────── */}
        {kind && (
          <ol className="setup-steps">
            {kind === 'supabase' ? (
              <>
                <li>
                  <b>建立 Supabase 專案</b>
                  <small>
                    在 <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer">supabase.com</a>
                    按下 <b>[New project]</b>。只需要注意以下兩項。
                  </small>
                  <ul className="setup-picks">
                    <li>
                      <b>Region</b> — <b>Northeast Asia (Seoul)</b>
                      <em className="warn">之後無法更改。</em>
                      <em>即使是免費方案也可以自由選擇，因此距離較近的首爾通常會比較快。</em>
                    </li>
                    <li>
                      <b>Database Password</b> — <b>建立後請儲存到某個地方</b>
                      <em>之後無法再次查看。首頁本身不需要它，但之後如果需要直接連接資料庫，就會用到這個值。</em>
                    </li>
                  </ul>
                  <small style={{ marginTop: 8 }}>
                    建立需要 1～2 分鐘。完成後前往 <b>Project Settings → API</b>。
                  </small>
                </li>
                <li>
                  <b>貼上網址與金鑰</b>
                  <small>這裡需要 Project URL 與 <b>anon public</b> 金鑰。絕對不要輸入 service_role 金鑰。</small>
                  <label className="k-label">Project URL</label>
                  <KInput value={sbUrl} onChange={e => setSbUrl(e.target.value)} placeholder="https://xxxx.supabase.co" />
                  <label className="k-label">anon public key</label>
                  <KInput value={sbKey} onChange={e => setSbKey(e.target.value)} />
                </li>
                <li>
                  <b>執行一次 Schema</b>
                  <small>貼到 SQL Editor 後按 [Run]。會建立資料表・權限・圖片儲存空間。</small>
                  <div className="setup-row">
                    <button className="btn btn-dark" onClick={() => copy(SCHEMA_SQL, 'sql')}>
                      {copied === 'sql' ? '已複製 ✓' : '複製 SQL'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setRulesOpen(o => !o)}>
                      {rulesOpen ? '收起內容' : '查看內容'}
                    </button>
                  </div>
                  {rulesOpen && <pre className="setup-sql">{SCHEMA_SQL}</pre>}
                </li>
              </>
            ) : (
              <>
                <li>
                  <b>建立 Firebase 專案</b>
                  <small>
                    在 <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">Firebase 主控台</a>
                    建立專案後，依序完成以下四項。
                    <b> 位置之後無法更改</b>，請確認後再選擇。
                  </small>
                  <ul className="setup-picks">
                    <li>
                      <b>1. Authentication</b> → 開始使用 → 啟用 <b>電子郵件／密碼</b>
                      <em>如果沒有開啟，之後無法建立管理員帳號。</em>
                    </li>
                    <li>
                      <b>2. Firestore Database</b> → 建立資料庫 <span className="warn">（文章・設定儲存的位置）</span>
                      <em>· 版本 <b>Standard</b> — Enterprise 是給大型服務使用，沒有選擇的必要</em>
                      <em>· 位置 <b>asia-northeast3 (Seoul)</b> — 各地區的免費額度相同，因此選擇較近的地方較有利</em>
                      <em>· 安全規則 <b>從正式環境模式開始</b> — 測試模式會在 30 天內允許任何人讀取與寫入</em>
                      <em>· 資料庫 ID 保持 <b>(default)</b> — 如果更改，首頁將無法找到資料庫</em>
                    </li>
                    <li>
                      <b>3. Storage</b> → 開始使用 <span className="warn">（圖片儲存的位置）</span>
                      <em>· 如果要維持免費 5GB，選擇 <b>us-west1 (Oregon)</b> — 免費額度只適用於美國區域</em>
                      <em>· 如果希望速度較快，選擇 <b>asia-northeast3 (Seoul)</b> — 每月大約需要 1,000 韓元</em>
                      <em>· 即使選擇美國，文章・列表仍然從首爾載入，因此頁面會立即出現，只有圖片會稍晚載入</em>
                      <em>· 可能會要求切換至隨用量計費（Blaze）— 在免費額度內不會產生費用</em>
                    </li>
                    <li>
                      <b>4. 註冊 Web App</b> → ⚙️ <b>專案設定 → 一般 → 最下方「我的應用程式」→ 新增應用程式 → Web</b>
                      <em className="warn">不是左側選單的「App Hosting（應用程式託管）」。</em>
                      <em>那是直接在 Firebase 上運行首頁的功能，但這個首頁已經部署到 Vercel，因此不需要使用。</em>
                    </li>
                    <li>
                      <b>5. 開啟 Storage CORS</b> <span className="warn">（使用備份時需要 — 現在先設定會比較方便）</span>
                      <em>Firebase Storage 預設會阻止從其他網址<strong>讀取檔案</strong>。在首頁查看圖片不會受到影響，但<strong>建立備份 zip 時，圖片會全部遺漏。</strong></em>
                      <em>
                        在 <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer">Google Cloud Console</a>
                        選擇這個專案後，開啟右上角的 <b>{'>_'}（Cloud Shell）</b>，貼上以下兩行並按 Enter — 不需要安裝任何程式。
                      </em>
                      <div className="setup-row" style={{ marginTop: 6 }}>
                        <button className="btn btn-ghost" onClick={() => copy(corsCmd, 'cors')}>
                          {copied === 'cors' ? '已複製 ✓' : '複製指令'}
                        </button>
                      </div>
                      <pre className="setup-sql" style={{ maxHeight: 92, marginTop: 6 }}>{corsCmd}</pre>
                      <em>開啟的只有<strong>讀取（GET）</strong>，而且已經公開的圖片不會因此產生新的風險。之後再設定也可以，但在設定之前建立的備份都不會包含圖片。</em>
                    </li>
                  </ul>
                </li>
                <li>
                  <b>貼上設定值</b>
                  <small>新增 Web App 後出現的 <b>firebaseConfig</b> 程式碼整段貼上後，會自動填入各項數值。</small>
                  <KTextarea value={fbPaste} onChange={e => applyPaste(e.target.value)}
                    style={{ minHeight: 90, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5 }} />
                  <div className="setup-2">
                    <div>
                      <label className="k-label">apiKey</label>
                      <KInput value={fb.apiKey} onChange={e => setFb(f => ({ ...f, apiKey: e.target.value }))} />
                    </div>
                    <div>
                      <label className="k-label">projectId</label>
                      <KInput value={fb.projectId} onChange={e => setFb(f => ({ ...f, projectId: e.target.value }))} />
                    </div>
                  </div>
                  <div className="setup-2">
                    <div>
                      <label className="k-label">appId</label>
                      <KInput value={fb.appId} onChange={e => setFb(f => ({ ...f, appId: e.target.value }))} />
                    </div>
                    <div>
                      <label className="k-label">storageBucket</label>
                      <KInput value={fb.storageBucket} onChange={e => setFb(f => ({ ...f, storageBucket: e.target.value }))} />
                    </div>
                  </div>
                  <label className="k-label">資料庫 ID（請留空）</label>
                  <KInput value={fbDbId} onChange={e => setFbDbId(e.target.value)} />
                  <p className="hint" style={{ margin: '4px 0 0' }}>
                    只有在建立 Firestore 時，將名稱指定為不是 <b>(default)</b> 的其他名稱時，才需要填入該名稱。
                  </p>
                </li>
                <li>
                  <b>貼上安全規則</b>
                  <small>
                    分別貼到 Firestore → <b>規則</b> 與 Storage → <b>規則</b>，然後按 [發布]。
                    這些規則負責管理公開範圍・作者修改權限。
                  </small>
                  <div className="setup-row">
                    <button className="btn btn-dark" onClick={() => copy(FIRESTORE_RULES, 'fs')}>
                      {copied === 'fs' ? '已複製 ✓' : '複製 Firestore 規則'}
                    </button>
                    <button className="btn btn-dark" onClick={() => copy(STORAGE_RULES, 'st')}>
                      {copied === 'st' ? '已複製 ✓' : '複製 Storage 規則'}
                    </button>
                    <button className="btn btn-ghost" onClick={() => setRulesOpen(o => !o)}>
                      {rulesOpen ? '收起內容' : '查看內容'}
                    </button>
                  </div>
                  {rulesOpen && (
                    <>
                      <pre className="setup-sql">{FIRESTORE_RULES}</pre>
                      <pre className="setup-sql">{STORAGE_RULES}</pre>
                    </>
                  )}
                </li>
              </>
            )}

            <li>
              <b>確認連線</b>
              <small>檢查設定值是否正確，以及規則是否已套用。</small>
              <button className="btn btn-dark" style={{ height: 33, padding: '0 16px', fontSize: 11, marginTop: 6 }}
                disabled={checking} onClick={runCheck}>{checking ? '確認中…' : '確認連線'}</button>
              {check && <p className={check.ok ? 'setup-ok' : 'setup-err'} style={{ marginTop: 8 }}>{check.message}</p>}
            </li>

            {check?.ok && !check.hasAdmin && !signed && (
              <li>
                <b>建立管理員帳號</b>
                <small>在這裡建立的第一個帳號會成為此首頁的管理員。</small>
                <label className="k-label">電子郵件</label>
                <KInput value={email} onChange={e => setEmail(e.target.value)} />
                <div className="setup-2">
                  <div>
                    <label className="k-label">密碼</label>
                    <KInput type="password" value={pw} onChange={e => setPw(e.target.value)} />
                  </div>
                  <div>
                    <label className="k-label">確認密碼</label>
                    <KInput type="password" value={pw2} onChange={e => setPw2(e.target.value)} />
                  </div>
                </div>
                <label className="k-label">顯示名稱（選填）</label>
                <KInput value={nick} onChange={e => setNick(e.target.value)} />
                <button className="btn btn-dark" style={{ height: 33, padding: '0 16px', fontSize: 11, marginTop: 10 }}
                  disabled={signing} onClick={signUpAdmin}>{signing ? '建立中…' : '建立管理員帳號'}</button>
              </li>
            )}

            {doneStep && (
              <li>
                <b>讓訪客也能看到</b>
                <small>
                  目前只在<b>這個瀏覽器</b>上完成連線。以下兩種方式選一種，只需要設定一次，
                  訪客就能看到相同的資料庫。（兩者都是公開用的值，即使曝光也沒有問題）
                </small>

                <div className="setup-way">
                  <b>方法 1 — 上傳檔案（推薦）</b>
                  <p>下載設定檔後，將它上傳到儲存庫的 <code>public</code> 資料夾。不需要終端機，直接在網頁上即可完成。</p>
                  <div className="setup-row">
                    <button className="btn btn-dark" onClick={downloadConfig}>① 下載設定檔</button>
                  </div>
                  <label className="k-label">② 輸入我的儲存庫網址後，會直接開啟上傳頁面</label>
                  <KInput value={repo} onChange={e => setRepo(e.target.value)}
                    placeholder="https://github.com/我的帳號/儲存庫" />
                  {uploadUrl ? (
                    <div className="setup-row">
                      <a className="btn btn-dark" href={uploadUrl} target="_blank" rel="noreferrer">
                        開啟 GitHub 上傳頁面 ↗
                      </a>
                      <span className="hint" style={{ alignSelf: 'center' }}>
                        在開啟的頁面中將檔案拖曳進去並按 [Commit changes] — 1～2 分鐘後會自動套用
                      </span>
                    </div>
                  ) : (
                    repo.trim() && <p className="setup-err">儲存庫網址格式不正確 — https://github.com/帳號/儲存庫</p>
                  )}
                </div>

                <div className="setup-way">
                  <b>方法 2 — Vercel 環境變數</b>
                  <p>在 Vercel 專案 → Settings → Environment Variables 中加入以下內容後重新部署。</p>
                  <div className="setup-row">
                    <button className="btn btn-ghost" onClick={() => copy(envText(), 'env')}>
                      {copied === 'env' ? '已複製 ✓' : '複製環境變數'}
                    </button>
                  </div>
                  <pre className="setup-sql" style={{ maxHeight: 150 }}>{envText()}</pre>
                </div>
              </li>
            )}

            {doneStep && (
              <li>
                <b>將伺服器位置設為首爾（如果在韓國使用）</b>
                <small>
                  Vercel 預設會將伺服器放在<b>美國東部</b>，如果保持原設定，每次開啟頁面時
                  都需要往返太平洋。<b>不會自動變更，因此需要手動按一次</b> — 30 秒即可完成。
                </small>
                <ul className="setup-picks">
                  <li>
                    <b>Settings → Functions → Function Region → Seoul (icn1) → 儲存</b>
                    <em className="warn">只儲存還不會生效 — 還需要到 Deployments → 最上方部署的 ⋯ → Redeploy 才會套用。</em>
                    <em>確認方式：在首頁按 F12 → Network → 最上方請求 → Response Headers 中的 x-vercel-id 如果以 icn1 開頭，就代表成功。</em>
                  </li>
                </ul>
              </li>
            )}
          </ol>
        )}

        {signed && <p className="setup-ok">管理員帳號已建立。如果啟用了電子郵件驗證，請完成驗證後再登入。</p>}
        {err && <p className="setup-err">{err}</p>}

        {doneStep && <button className="btn btn-accent setup-go" onClick={start}>開始使用首頁</button>}
        {kind && (
          <button className="btn btn-ghost setup-back"
            onClick={() => { setKind(null); setErr(''); setCheck(null); setRulesOpen(false); }}>← 選擇其他服務</button>
        )}

        <div className="setup-sep" />
        <label className="k-label">如果已經有備份</label>
        <p className="hint" style={{ margin: '0 0 8px' }}>
          放入備份 zip 後，可以跳過上述流程並直接使用備份內容開始。
        </p>
        <input id="setupZip" type="file" accept=".zip" style={{ display: 'none' }}
          onChange={e => { const f = e.target.files?.[0] ?? null; setFile(f); e.target.value = ''; if (f) restore(f); }} />
        <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
          disabled={busy}
          onClick={() => document.getElementById('setupZip')?.click()}
          {...fileDrop(fl => { const f = fl[0]; if (f) { setFile(f); restore(f); } })}>
          {busy ? '復原中…' : file ? file.name : '選擇備份 zip · 拖曳放入'}
        </button>
      </div>
    </div>
  );
}