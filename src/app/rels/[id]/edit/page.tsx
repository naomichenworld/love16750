'use client';
// 自設關係修改頁面 (4.5) — 名稱／標語／類型／公開範圍／字體／縮圖。成員在詳細頁面管理。
// ?au=<AU id> 進入時，編輯該 AU 的插圖・標語 (v1.9 — 在 AU 選擇狀態下 EDIT)
import React, { Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList } from '@/lib/postStore';
import { Character, CHAR_SEED, Relation, REL_SEED, findByKey } from '@/lib/charStore';
import { RelForm } from '@/components/rels/RelForm';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc } from '@/components/ui/PageText';

function RelEditInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const toast = useToast();
  const params = useSearchParams();
  const auId = params.get('au') ?? undefined;
  const [rels, setRels, loaded] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [chars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);

  // 也可以透過別名網址開啟 (v2.0 使用者要求)
  const rel = findByKey(rels, id);
  const auObj = auId ? rel?.aus.find(a => a.id === auId && a.id !== 'base') : undefined;
  if (!loaded) return <section className="page" />;
  if (!isAdmin || !rel) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>EDIT</PageTitle><p>{!rel ? '找不到自設關係' : '僅限管理員'}</p></div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>EDIT — {rel.name}{auObj ? ` · ${auObj.label}` : ''}</PageTitle>
        <EditableDesc k="rels-edit-desc" def="修改自設關係資訊 — 成員・時間軸・問答・AU 在詳細頁面管理" />
      </div>
      <RelForm
        initial={rel}
        auId={auObj?.id}
        myChars={chars.filter(c => c.own)}
        memberNames={Object.fromEntries(rel.members.map(m => [m.charId, chars.find(c => c.id === m.charId)?.name ?? m.charId]))}
        onCancel={() => router.push(`/rels/${rel.id}`)}
        existingIds={rels.filter(r => r.id !== rel.id).flatMap(r => [r.id, ...(r.slug ? [r.slug] : [])])}
        onSave={v => {
          setRels(rels.map(r => (r.id === rel.id ? {
            ...r,
            name: v.name, kind: v.kind, visibility: v.visibility,
            // 字體如果是 AU 編輯，就只套用到該 AU (v2.0 使用者回報 — 之前會儲存到原始資料，導致全部一起變更)
            ...(auObj ? {} : { fontId: v.fontId, bodyFontId: v.bodyFontId }),
            // 標頭如果是 AU 編輯，就只儲存到該 AU — 保留 base 標頭 (v1.9 AU 個別標頭分離)
            ...(auObj ? {} : { headerImgId: v.headerImgId, headerCrop: v.headerCrop, slug: v.slug }),
            // 頁面主題 — 如果是 AU 編輯，就只套用到該 AU（保留 base 主題，v1.9）
            ...(auObj ? {} : { themeMode: v.themeMode, themeColor: v.themeColor, themeTone: v.themeTone, illuBg: v.illuBg, illuOn: v.illuOn, nameColor: v.nameColor, cpColor: v.cpColor, cpTagBg: v.cpTagBg, cpTagFg: v.cpTagFg,
                nameShadowColor: v.nameShadowColor, nameShadow: v.nameShadow,
                headerBgG1: v.headerBgG1, headerBgG2: v.headerBgG2, headerBgAngle: v.headerBgAngle,
                pageBgG1: v.pageBgG1, pageBgG2: v.pageBgG2, pageBgAngle: v.pageBgAngle }),
            // CP／問答隱藏是整個自設關係的設定（AU 表單沒有）· 全身正反面如果是 AU 則只套用到該 AU (v2.0)
            ...(auObj ? {} : { cp: v.cp, qaHide: v.qaHide, fullFront: v.fullFront ?? r.fullFront }),
            illustMode: v.kind === 'pair' ? r.illustMode : 'one',
            // 全身尺寸・位置・一句話・台詞顏色 — **編輯 AU 時不會修改自設關係共用設定**
            // (v2.0 使用者發現：之前在 AU 中修改時，其他 AU 頁面也會一起變更。
            //  以前這一行不論 auObj 都會執行，因此會覆蓋自設關係共用的 members。
            //  AU 的值則另外儲存在下面 aus 的 mset 中)
            members: (!auObj && (v.fullScales || v.fullOffsets || v.quoteColors || v.quotes))
              ? r.members.map(m => ({
                ...m,
                fullScale: v.fullScales?.[m.charId] ?? m.fullScale,
                fullOffX: v.fullOffsets?.[m.charId]?.x ?? m.fullOffX,
                fullOffY: v.fullOffsets?.[m.charId]?.y ?? m.fullOffY,
                quote: v.quotes?.[m.charId] ?? m.quote,
                nameSize: v.nameSizes?.[m.charId] ?? m.nameSize,
                nameBold: v.nameBolds?.[m.charId] ?? m.nameBold,
                quoteColor: v.quoteColors?.[m.charId]?.fg ?? m.quoteColor,
                quoteMarkColor: v.quoteColors?.[m.charId]?.mark ?? m.quoteMarkColor,
              }))
              : r.members,
            // AU 編輯模式 — 插圖・標語・全身只套用到該 AU（保留原始資料）
            ...(auObj
              ? {
                aus: r.aus.map(a => (a.id === auObj.id ? {
                  ...a, arts: v.arts, catchphrase: v.catchphrase,
                  // AU 個別自設關係名稱 (v2.0 使用者要求) — 留空則直接刪除，讓它使用自設關係名稱
                  name: v.auName?.trim() ? v.auName.trim() : undefined,
                  // AU 個別字體・全身正反面 (v2.0 使用者回報) — 儲存在此 AU，而不是原始資料
                  fontId: v.fontId, bodyFontId: v.bodyFontId, fullFront: v.fullFront,
                  // AU 個別顏色・背景 (v2.0 使用者要求) — 關閉「直接指定」後會變成 undefined
                  // 並恢復使用自設關係的值（由 auStyle 以整組設定判定）
                  style: {
                    nameColor: v.nameColor, cpColor: v.cpColor,
                    cpTagBg: v.cpTagBg, cpTagFg: v.cpTagFg,
                    nameShadowColor: v.nameShadowColor, nameShadow: v.nameShadow,
                    headerBgG1: v.headerBgG1, headerBgG2: v.headerBgG2, headerBgAngle: v.headerBgAngle,
                    pageBgG1: v.pageBgG1, pageBgG2: v.pageBgG2, pageBgAngle: v.pageBgAngle,
                    illuBg: v.illuBg, illuOn: v.illuOn,
                  },
                  // AU 個別成員顯示值 (v2.0 使用者發現) — 只在此 AU 使用的全身位置・一句話・台詞顏色。
                  // 自設關係共用設定 (members) 沒有在上面修改，因此其他 AU 都維持原樣
                  mset: Object.fromEntries(r.members.map(m => [m.charId, {
                    fullScale: v.fullScales?.[m.charId],
                    fullOffX: v.fullOffsets?.[m.charId]?.x,
                    fullOffY: v.fullOffsets?.[m.charId]?.y,
                    quote: v.quotes?.[m.charId],
                    nameSize: v.nameSizes?.[m.charId],
                    nameBold: v.nameBolds?.[m.charId],
                    quoteColor: v.quoteColors?.[m.charId]?.fg,
                    quoteMarkColor: v.quoteColors?.[m.charId]?.mark,
                  }])),
                  // AU 個別標頭 (v1.9) — 移除後明確標記為「無」(null)：不恢復使用 base 標頭
                  headerImgId: v.headerRemoved ? undefined : v.headerImgId,
                  headerCrop: v.headerRemoved ? undefined : v.headerCrop,
                  // AU 個別頁面主題 — 如果跟隨既有設定則不指定 (v1.9)
                  theme: v.themeFollow ? undefined : { mode: v.themeMode, color: v.themeColor, tone: v.themeTone },
                  fulls: v.fulls
                    ? Object.fromEntries(Object.entries(v.fulls).filter(([, id2]) => id2) as [string, string][])
                    : a.fulls,
                } : a)),
              }
              : {
                catchphrase: v.catchphrase, arts: v.arts, thumbId: v.arts[0], thumbCrop: v.thumbCrop,
                ...(v.fulls
                  ? {
                    members: r.members.map(m => ({
                      ...m, fullImgId: v.fulls![m.charId],
                      fullScale: v.fullScales?.[m.charId] ?? m.fullScale,
                      fullOffX: v.fullOffsets?.[m.charId]?.x ?? m.fullOffX,
                      fullOffY: v.fullOffsets?.[m.charId]?.y ?? m.fullOffY,
                      quote: v.quotes?.[m.charId] ?? m.quote,
                      nameSize: v.nameSizes?.[m.charId] ?? m.nameSize,
                      nameBold: v.nameBolds?.[m.charId] ?? m.nameBold,
                      quoteColor: v.quoteColors?.[m.charId]?.fg ?? m.quoteColor,
                      quoteMarkColor: v.quoteColors?.[m.charId]?.mark ?? m.quoteMarkColor,
                    })),
                  }
                  : {}),
              }),
          } : r)));
          toast('已儲存');
          router.push(`/rels/${rel.id}`);
        }}
      />
    </section>
  );
}

export default function RelEditPage() {
  // useSearchParams 需要 Suspense 邊界（Next App Router）
  return <Suspense fallback={<section className="page" />}><RelEditInner /></Suspense>;
}