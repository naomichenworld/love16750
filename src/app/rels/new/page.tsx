'use client';
// 自設關係登錄頁面 (4.5) — 對方角色可在登錄後於詳細頁面新增
import React from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId } from '@/lib/postStore';
import { Character, CHAR_SEED, Relation, REL_SEED, RelMember } from '@/lib/charStore';
import { RelForm } from '@/components/rels/RelForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

export default function RelNewPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const [rels, setRels, loaded] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);

  if (!loaded) return <section className="page" />;
  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>ADD RELATION</PageTitle><p>僅限管理員</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>ADD RELATION</PageTitle>
        <EditableDesc k="rels-new-desc" def="自設關係登錄 — 對方角色可以在建立頁面後於詳細頁面新增" />
      </div>
      <RelForm
        initial={null}
        myChars={chars.filter(c => c.own)}
        existingIds={rels.flatMap(r => [r.id, ...(r.slug ? [r.slug] : [])])}
        onCancel={() => router.push('/rels')}
        onSave={v => {
          // 調色盤會在詳細頁面直接讀取角色端的設定 — 如果在這裡複製一份，
          // 之後修改角色顏色時，自設關係就不會跟著變更 (v2.0 — 統一與詳細頁面的規則)
          const members: RelMember[] = v.pickedCharIds.map(cid =>
            ({ charId: cid, quote: '', keywords: [], desc: '', palette: [] }));
          const rel: Relation = {
            id: v.slug ?? newId(),   // 指定的頁面網址 (v1.9) — 留空則自動建立
            name: v.name, catchphrase: v.catchphrase, kind: v.kind,
            fontId: v.fontId, bodyFontId: v.bodyFontId, visibility: v.visibility,
            arts: v.arts, thumbId: v.arts[0], thumbCrop: v.thumbCrop,
            headerImgId: v.headerImgId, headerCrop: v.headerCrop,
            themeMode: v.themeMode, themeColor: v.themeColor, themeTone: v.themeTone,
            illuBg: v.illuBg, illuOn: v.illuOn,
            nameColor: v.nameColor, cpColor: v.cpColor, cpTagBg: v.cpTagBg, cpTagFg: v.cpTagFg,
            nameShadowColor: v.nameShadowColor, nameShadow: v.nameShadow,
            headerBgG1: v.headerBgG1, headerBgG2: v.headerBgG2, headerBgAngle: v.headerBgAngle,
            pageBgG1: v.pageBgG1, pageBgG2: v.pageBgG2, pageBgAngle: v.pageBgAngle,
            members, thumbClass: '',
            illustMode: v.kind === 'pair' ? 'duo' : 'one',
            aus: [{ id: 'base', label: '原始資料', catchphrase: v.catchphrase }],
            timeline: [], questions: [],
          };
          setRels([...rels, rel]);
          toast('自設關係已登錄 — 對方角色・一句話等內容可在詳細頁面繼續新增');
          router.push(`/rels/${rel.id}`);
        }}
      />
    </section>
  );
}