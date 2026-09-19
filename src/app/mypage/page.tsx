'use client';
// 我的頁面 (v1.9) — 修改我的資訊（暱稱・個人資料圖片・密碼） +
// 一般會員：與我連結的角色列表・我撰寫的文章／留言列表（管理員只顯示基本資訊）
import React, { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, GUEST_SEED, Post, GuestEntry, fmtDate,
  CommentRow, COMMENT_KEY, COMMENT_SEED,
} from '@/lib/postStore';
import { Character, CHAR_SEED } from '@/lib/charStore';
import { RoadItem, ROAD_SEED } from '@/lib/galleryStore';
import { useBoards } from '@/lib/boardStore';
import { collectMyItems, MyItem } from '@/lib/myActivity';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { putBlob, useBlobUrl, promoteToStorage } from '@/lib/blobStore';
import { KInput } from '@/components/ui/Kit';
import { Modal } from '@/components/ui/Modal';
import { ColorField } from '@/components/ui/ColorField';
import { fileDrop } from '@/lib/dnd';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

export default function MyPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, isAdmin, updateProfile } = useAuth();
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [posts] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  const [roads] = useLocalList<RoadItem>('ohome.road.v1', ROAD_SEED);
  const [guestEntries] = useLocalList<GuestEntry>('ohome.guest.v1', GUEST_SEED);
  // 留言會與文章分開儲存 (v2.0)
  const [cmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const { boards } = useBoards();

  const [nick, setNick] = useState('');
  const [nickInit, setNickInit] = useState(false);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [newPw2, setNewPw2] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const avatarSrc = useBlobUrl(user?.avatarUrl);
  // 個人資料圖片選擇 Modal (v1.9) — 純色／圖片上傳／預設
  const [avOpen, setAvOpen] = useState(false);
  const [avColor, setAvColor] = useState('#6b7280');

  // 在連接後端之前上傳的個人資料圖片，其參照是此瀏覽器的檔案 id，因此從其他地方登入時
  // 無法顯示（v2.0 使用者發現）。如果原始檔案還留在這裡，就上傳至儲存區並改成網址。
  //
  // 一開始是靜默處理，但失敗時什麼都不顯示，使用者會卡在「明明上傳了，為什麼看不到」
  // （v2.0 使用者指出）。如果無法移動，就在照片下方直接顯示**無法移動的原因**。
  const avatarRef = user?.avatarUrl;
  const [avNote, setAvNote] = useState('');
  useEffect(() => {
    if (!avatarRef) { setAvNote(''); return; }
    let alive = true;
    void (async () => {
      const r = await promoteToStorage(avatarRef);
      if (!alive) return;
      if (r.kind === 'uploaded') {
        const up = await updateProfile({ avatarUrl: r.url });
        if (!alive) return;
        setAvNote(up.ok ? '' : `已上傳至儲存區，但無法套用至個人資料 — ${up.error}`);
      } else if (r.kind === 'no-origin') {
        setAvNote('此照片的原始檔案不在此瀏覽器中，因此無法移至儲存區 — 請重新上傳照片');
      } else if (r.kind === 'local-mode') {
        setAvNote('尚未連接伺服器，因此此照片只會儲存在此瀏覽器中');
      } else if (r.kind === 'failed') {
        setAvNote(`無法上傳至儲存區 — ${r.error}`);
      } else {
        setAvNote('');
      }
    })();
    return () => { alive = false; };
  }, [avatarRef, updateProfile]);

  // 暱稱初始值 — user 載入後設定一次
  if (user && !nickInit) { setNick(user.nickname); setNickInit(true); }

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>MY PAGE</PageTitle><p>登入後才能使用</p></div>
      </section>
    );
  }

  const saveNick = async () => {
    if (!nick.trim()) { toast('請輸入暱稱'); return; }
    const r = await updateProfile({ nickname: nick });
    toast(r.ok ? '已儲存 — 之前撰寫的文章，其顯示名稱會維持原樣' : r.error!);
  };
  const changeAvatar = async (f: File | undefined) => {
    if (!f) return;
    // 如果上傳失敗，以前會直接在這裡中斷，**什麼都不顯示** — Modal 會維持開啟，
    // 使用者會以為已經儲存，直到在其他瀏覽器看不到才發現（v2.0 使用者指出：「沒有儲存，其他瀏覽器看不到」）。
    // 如果沒有套用儲存區規則或沒有設定 Bucket，就會在這裡被攔截，因此直接顯示原因。
    let id: string;
    try {
      id = await putBlob(f);
    } catch (e) {
      toast(`無法將圖片上傳至儲存區 — ${e instanceof Error ? e.message : String(e)}`);
      return;
    }
    const r = await updateProfile({ avatarUrl: id });
    setAvOpen(false);
    toast(r.ok ? '個人資料圖片已變更' : r.error!);
  };
  const changePw = async () => {
    if (!curPw || !newPw) { toast('請輸入目前密碼與新密碼'); return; }
    if (newPw !== newPw2) { toast('兩次輸入的新密碼不同'); return; }
    const r = await updateProfile({ currentPassword: curPw, newPassword: newPw });
    if (r.ok) { setCurPw(''); setNewPw(''); setNewPw2(''); }
    toast(r.ok ? '密碼已變更' : r.error!);
  };

  // 與我連結的角色（一般會員）
  const myChars = chars.filter(c => c.grants?.some(g => g.userId === user.id));

  // 我撰寫的文章／留言（一般會員）— 僅顯示 6 筆，其餘前往完整列表（v1.9）
  const myItems: MyItem[] = collectMyItems(user.id, posts, roads, guestEntries, boards, cmtRows);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>MY PAGE</PageTitle>
        <EditableDesc k="mypage-desc" def="修改我的資訊" />
      </div>

      <div style={{ maxWidth: 620, margin: '0 auto', display: 'grid', gap: 14 }}>
        {/* 基本資訊 */}
        <div className="panel" style={{ padding: 24 }}>
          <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 16 }}>PROFILE</h4>
          <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {/* 個人資料圖片 — 點擊後開啟純色／圖片選擇 Modal (v1.9，不顯示縮寫字母) */}
            <div style={{ display: 'grid', gap: 8, justifyItems: 'center' }}>
              <div style={{
                width: 84, height: 84, borderRadius: '50%', overflow: 'hidden', cursor: 'var(--cur-pointer,pointer)',
                background: avatarSrc ? undefined : (user.avatarColor ?? 'linear-gradient(135deg,#6b7280,#3c434d)'),
                border: '1px solid var(--line)',
              }} onClick={() => { setAvColor(user.avatarColor ?? '#6b7280'); setAvOpen(true); }} data-tip="變更個人資料圖片"
                {...fileDrop(fl => changeAvatar(fl[0]))}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }}
                onChange={e => { changeAvatar(e.target.files?.[0]); e.target.value = ''; }} />
              {/* 此照片無法在其他地方顯示的原因 — 只有在有原因時顯示 (v2.0 使用者指出) */}
              {avNote && (
                <p className="hint" style={{ margin: 0, maxWidth: 190, textAlign: 'center', lineHeight: 1.5 }}>
                  {avNote}
                </p>
              )}
            </div>
            <div style={{ flex: 1, minWidth: 220, display: 'grid', gap: 10 }}>
              <div>
                <label className="k-label" style={{ marginBottom: 5 }}>ID</label>
                <KInput value={user.id} disabled style={{ opacity: 0.6 }} />
              </div>
              <div>
                <label className="k-label" style={{ marginBottom: 5 }}>暱稱</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <KInput value={nick} onChange={e => setNick(e.target.value)} style={{ flex: 1 }} />
                  <button className="btn btn-dark" onClick={saveNick}>儲存</button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 密碼變更 */}
        <div className="panel" style={{ padding: 24 }}>
          <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 16 }}>PASSWORD</h4>
          <div style={{ display: 'grid', gap: 9 }}>
            <KInput type="password" placeholder="目前密碼" value={curPw} onChange={e => setCurPw(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <KInput type="password" placeholder="新密碼" value={newPw} onChange={e => setNewPw(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
              <KInput type="password" placeholder="確認新密碼" value={newPw2} onChange={e => setNewPw2(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-dark" onClick={changePw}>變更</button>
            </div>
          </div>
        </div>

        {/* 與我連結的角色 — 僅一般會員（管理員擁有全部權限，因此不需要） */}
        {!isAdmin && (
          <div className="panel" style={{ padding: 24 }}>
            <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 14 }}>MY CHARACTERS</h4>
            {myChars.length === 0 && <p className="hint" style={{ margin: 0 }}>沒有已連結的角色</p>}
            {/* 1:1 縮圖網格 (v1.9) — 8 欄平均排列（較窄時自動減少），沒有圖片時使用角色主題色，懸停提示名稱 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 10 }}>
              {myChars.map(c => (
                <div key={c.id}
                  data-tip={c.name}
                  onClick={() => router.push(`/chars/${c.id}`)}
                  style={{
                    aspectRatio: '1/1', borderRadius: 12, overflow: 'hidden', position: 'relative',
                    cursor: 'var(--cur-pointer,pointer)', background: c.color, border: '1px solid var(--line)',
                  }}>
                  {(c.thumbId ?? c.arts?.[0]) && (
                    <CroppedBlobImg fileRef={c.thumbId ?? c.arts?.[0]} crop={c.thumbCrop} ph={c.thumbClass} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 我撰寫的文章／留言 — 僅一般會員 */}
        {!isAdmin && (
          <div className="panel" style={{ padding: 24 }}>
            <h4 style={{ fontSize: 11.5, letterSpacing: '.12em', color: 'var(--faint)', marginBottom: 14 }}>
              MY POSTS {myItems.length > 0 && <span style={{ color: 'var(--accent)' }}>{myItems.length}</span>}
              {myItems.length > 6 && (
                <span style={{ float: 'right', fontSize: 11, color: 'var(--accent)', cursor: 'var(--cur-pointer,pointer)', letterSpacing: 0 }}
                  onClick={() => router.push('/mypage/posts')}>查看更多 ›</span>
              )}
            </h4>
            {myItems.length === 0 && <p className="hint" style={{ margin: 0 }}>沒有撰寫過的文章</p>}
            <div style={{ display: 'grid', gap: 2 }}>
              {myItems.slice(0, 6).map((it, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', cursor: 'var(--cur-pointer,pointer)' }}
                  onClick={() => router.push(it.href)}>
                  <span className="pill" style={{ flexShrink: 0 }}>{it.kind}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.text}</span>
                  <small style={{ color: 'var(--faint)', flexShrink: 0 }}>{fmtDate(it.date)}</small>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 個人資料圖片選擇 (v1.9) — 純色或圖片上傳（包含拖放） */}
      <Modal open={avOpen} onClose={() => setAvOpen(false)} small title="個人資料圖片"
        actions={<button className="btn btn-ghost" onClick={() => setAvOpen(false)}>取消</button>}>
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <span className="cp-lb">純色</span>
            <ColorField value={avColor} onChange={setAvColor} />
            <button className="btn btn-dark" style={{ marginLeft: 'auto', padding: '5px 14px', fontSize: 11 }}
              onClick={async () => {
                const r = await updateProfile({ avatarColor: avColor, avatarUrl: null });
                setAvOpen(false);
                toast(r.ok ? '已變更為純色個人資料圖片' : r.error!);
              }}>套用</button>
          </div>
          <div className="upzone" style={{ padding: '18px 14px', textAlign: 'center' }}
            onClick={() => fileRef.current?.click()}
            {...fileDrop(fl => changeAvatar(fl[0]))}>
            <b style={{ display: 'block', marginBottom: 3 }}>將圖片拖曳至此或點擊</b>
          </div>
          {(user.avatarUrl || user.avatarColor) && (
            <button className="btn btn-ghost" style={{ padding: '6px 12px', fontSize: 11, justifySelf: 'end' }}
              onClick={async () => {
                const r = await updateProfile({ avatarUrl: null, avatarColor: null });
                setAvOpen(false);
                toast(r.ok ? '已恢復為預設個人資料圖片' : r.error!);
              }}>恢復預設</button>
          )}
        </div>
      </Modal>
    </section>
  );
}