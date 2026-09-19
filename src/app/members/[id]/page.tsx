'use client';
// 會員資訊頁面 (v1.9 使用者要求) — 僅限管理員使用。
// 從會員／安全列表點擊姓名後進入：個人資料（頭像・暱稱・Email・標籤）・
// 已連結的角色（已授予權限的部分）・撰寫過的文章／留言全部內容（myActivity 共用收集）。
import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useAuth, mockMemberInfo, User } from '@/lib/auth';
import {
  useLocalList, BOARD_SEED, GUEST_SEED, Post, GuestEntry, fmtDate,
  CommentRow, COMMENT_KEY, COMMENT_SEED,
} from '@/lib/postStore';
import { Character, CHAR_SEED, charGrant } from '@/lib/charStore';
import { RoadItem, ROAD_SEED } from '@/lib/galleryStore';
import { useBoards } from '@/lib/boardStore';
import { collectMyItems } from '@/lib/myActivity';
import { useBlobUrl } from '@/lib/blobStore';
import { CroppedBlobImg } from '@/components/ui/CropEditor';
import { PageTitle } from '@/components/ui/PageText';
import { getSetting } from '@/lib/settingStore';
import { useMembers } from '@/lib/members';
import { isServerMode } from '@/lib/backend';
import { Pager } from '@/components/ui/Kit';

const PER = 15;

export default function MemberDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const [posts] = useLocalList<Post>('ohome.board.v1', BOARD_SEED);
  const [roads] = useLocalList<RoadItem>('ohome.road.v1', ROAD_SEED);
  const [guestEntries] = useLocalList<GuestEntry>('ohome.guest.v1', GUEST_SEED);
  // 留言會與文章分開儲存 (v2.0)
  const [cmtRows] = useLocalList<CommentRow>(COMMENT_KEY, COMMENT_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const { boards } = useBoards();
  const members = useMembers();

  const [member, setMember] = useState<User | null | undefined>(undefined); // undefined = 載入中
  const [tags, setTags] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  useEffect(() => {
    // 伺服器模式中，註冊會員存在 DB(profiles) 中 — 只查詢本機帳號列表會找不到
    if (isServerMode()) {
      if (members.length === 0) return;                       // 還在接收資料
      const hit = members.find(m => m.id === id);
      setMember(hit ? { id: hit.id, nickname: hit.nickname, role: hit.role ?? 'member' } : null);
    } else {
      setMember(mockMemberInfo(id));
    }
    setTags(getSetting<Record<string, string[]>>('ohome.membertags.v1', {})[id] ?? []);
  }, [id, members]);
  const avatarSrc = useBlobUrl(member?.avatarUrl);

  if (member === undefined) return <section className="page" />;
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>MEMBER</PageTitle><p>僅限管理員使用的頁面</p></div>
      </section>
    );
  }
  if (!member) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>MEMBER</PageTitle><p>找不到會員</p></div>
      </section>
    );
  }

  // 已連結的角色 — 已授予權限（play/edit）的角色
  const linked = chars
    .map(c => ({ c, level: charGrant(c, member.id) }))
    .filter((x): x is { c: Character; level: 'play' | 'edit' } => x.level !== null);

  const items = collectMyItems(member.id, posts, roads, guestEntries, boards, cmtRows);
  const pageItems = items.slice((page - 1) * PER, page * PER);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>MEMBER</PageTitle>
        <p>{member.nickname} 會員資訊</p>
      </div>

      <div className="panel" style={{ padding: 24, maxWidth: 860, margin: '0 auto 14px' }}>
        <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
          {/* 頭像 — 圖片／純色・漸層（無縮寫字母，v1.9 規則） */}
          <div style={{
            width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', flexShrink: 0,
            background: avatarSrc ? undefined : (member.avatarColor ?? 'linear-gradient(135deg,#6b7280,#3c434d)'),
          }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatarSrc && <img src={avatarSrc} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <b style={{ fontSize: 18 }}>{member.nickname}</b>
              <span className="pill">{member.role === 'admin' ? '管理員' : '會員'}</span>
              {tags.map(t => <span key={t} className="pill">{t}</span>)}
            </div>
            <div style={{ marginTop: 5, fontSize: 12, color: 'var(--faint)' }}>
              {member.id}{member.email ? ` · ${member.email}` : ' · 尚未登錄 Email'}
            </div>
          </div>
        </div>

        {/* 已連結的角色（第三版會員－角色連結） */}
        <h3 style={{ marginTop: 20 }}>已連結的角色</h3>
        {linked.length ? (
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8 }}>
            {linked.map(({ c, level }) => (
              <div key={c.id} onClick={() => router.push(`/chars/${c.id}`)}
                style={{ display: 'flex', gap: 8, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 12px 6px 6px', cursor: 'var(--cur-pointer,pointer)' }}>
                <div className={`ph ${c.thumbClass}`} style={{ width: 34, height: 34, borderRadius: 8, overflow: 'hidden', position: 'relative', flexShrink: 0 }}>
                  {(c.thumbId ?? c.arts?.[0]) && <CroppedBlobImg fileRef={c.thumbId ?? c.arts?.[0]} crop={c.thumbCrop} ph={c.thumbClass} />}
                </div>
                <b style={{ fontSize: 12.5 }}>{c.name}</b>
                <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{level === 'edit' ? '可編輯' : '角色扮演遊玩'}</small>
              </div>
            ))}
          </div>
        ) : (
          <p className="hint" style={{ marginTop: 6 }}>沒有已連結權限的角色</p>
        )}

        {/* 撰寫過的文章・留言 — 與我的頁面使用相同的收集方式（myActivity 共用） */}
        <h3 style={{ marginTop: 20 }}>撰寫過的文章 · 留言 <small style={{ color: 'var(--faint)', fontWeight: 400 }}>{items.length}筆</small></h3>
        {pageItems.length ? pageItems.map((it, i) => (
          <div key={i} onClick={() => router.push(it.href)}
            style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '9px 2px', borderBottom: '1px solid var(--line)', cursor: 'var(--cur-pointer,pointer)' }}>
            <span className="pill" style={{ flexShrink: 0 }}>{it.kind}</span>
            <span style={{ fontSize: 12.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.text}</span>
            <small style={{ marginLeft: 'auto', color: 'var(--faint)', fontSize: 10.5, whiteSpace: 'nowrap' }}>{fmtDate(it.date)}</small>
          </div>
        )) : <p className="hint" style={{ marginTop: 6 }}>沒有撰寫過的文章</p>}
        {items.length > PER && (
          <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
            <Pager page={page} total={Math.ceil(items.length / PER)} onChange={setPage} />
          </div>
        )}
      </div>
    </section>
  );
}