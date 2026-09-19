'use client';
// 角色個人資料編輯頁面（4.4）— 專用頁面（不是 Modal）
// 透過 ?au=<relId:auId> 進入時，則為該 AU 專用的個人資料編輯（v1.9 使用者確認）—
// 完全像建立新的個人資料一樣，名稱・規格・插圖・分頁全部填寫該 AU 專屬的值。base 不會受到影響。
import React, { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, charGrant, charWithAu, Relation, REL_SEED , findByKey } from '@/lib/charStore';
import { CharEditForm } from '@/components/chars/CharEditForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function CharEditInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const auKey = params.get('au');   // `${relId}:${auId}`
  const [chars, setChars, loaded] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);

  // 也可以透過別名網址開啟（v2.0 使用者要求 — 即使之後更改網址，舊網址仍然有效）
  const ch = findByKey(chars, id);
  // 管理員，或被授予「可以編輯」權限的會員（第三階段會員－角色連結，v1.9）
  const canEdit = isAdmin || (ch && charGrant(ch, user?.id) === 'edit');
  if (!loaded) return <section className="page" />;
  if (!canEdit || !ch) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>EDIT</PageTitle><p>{!ch ? '找不到角色' : '沒有編輯權限'}</p></div>
      </section>
    );
  }

  // AU 標籤（用於標題顯示）
  const auLabel = (() => {
    if (!auKey) return null;
    const [relId, auId] = auKey.split(':');
    return rels.find(r => r.id === relId)?.aus.find(a => a.id === auId)?.label ?? auKey;
  })();

  const back = auKey ? `/chars/${ch.id}?au=${encodeURIComponent(auKey)}` : `/chars/${ch.id}`;

  // AU 個人資料初始值（v1.9 使用者確認）— 如果已經建立 AU 就使用該值，第一次建立則像「完全重新登錄」一樣使用空白表單
  // （名稱・規格・插圖・分頁全部清空 — 字體・代表色等樣式預設值則從 base 繼承）
  const auProf = auKey ? ch.auProfiles?.[auKey] : undefined;
  const formInitial = auKey
    ? (auProf
      ? charWithAu(ch, auKey)
      : {
        ...ch, name: '', sub: '', basicHtml: '', tabs: [], colors: [], colorTipMode: 'hex' as const,
        specs: [{ label: '性別', value: '' }, { label: '身高', value: '' }],
        arts: [], artId: undefined, thumbId: undefined, thumbCrop: undefined,
      })
    : ch;

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>EDIT — {auKey ? `${ch.name} · ${auLabel}` : ch.name}</PageTitle>
        {!auKey && <EditableDesc k="chars-edit-desc" def="個人資料編輯 — 必須按下 [SAVE] 才會儲存變更" />}
      </div>
      <CharEditForm
        initial={formInitial}
        existingIds={chars.filter(c => c.id !== ch.id).flatMap(c => [c.id, ...(c.slug ? [c.slug] : [])])}
        auMode={!!auKey}
        onCancel={() => router.push(back)}
        onSave={c => {
          if (auKey) {
            // 儲存 AU 個人資料快照 — base 欄位維持原樣，只將 auProfiles[auKey] 完整覆蓋為表單值
            setChars(chars.map(x => (x.id === ch.id ? {
              ...x,
              auProfiles: {
                ...x.auProfiles,
                [auKey]: {
                  // 表單之外設定的值（例如詳細插圖位置等）維持原樣，只覆蓋表單中的值（v2.0）
                  ...x.auProfiles?.[auKey],
                  name: c.name, sub: c.sub, color: c.color, themeMode: c.themeMode,
                  colors: c.colors, colorTipMode: c.colorTipMode,
                  specs: c.specs, tabs: c.tabs, basicHtml: c.basicHtml,
                  arts: c.arts, thumbId: c.thumbId, thumbCrop: c.thumbCrop,
                  fontId: c.fontId, nameSize: c.nameSize, nameBold: c.nameBold, bodyFontId: c.bodyFontId,
                },
              },
            } : x)));
            toast('AU 個人資料已儲存');
          } else {
            // 為避免每次儲存時，表單未處理的值（例如詳細插圖位置等）消失，不直接覆蓋，而是合併（v2.0）
            setChars(chars.map(x => (x.id === c.id ? { ...x, ...c } : x)));
            toast('已儲存');
          }
          router.push(back);
        }}
      />
    </section>
  );
}

export default function CharEditPage() {
  // useSearchParams 需要 Suspense 邊界（Next App Router）
  return <Suspense fallback={<section className="page" />}><CharEditInner /></Suspense>;
}