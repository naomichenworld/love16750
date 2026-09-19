'use client';
/**
 * 設為非公開的選單，即使透過網址進入也不允許開啟（v2.0 使用者要求）。
 *
 * 選單管理的公開範圍原本**只有在繪製選單時**才會使用 — 只是連結不會顯示而已，
 * 直接輸入 `/board` 仍然可以開啟。這裡統一在一個地方阻止。
 * 判定使用與 Widget 相同的**函式**（`hrefVis`），讓選單・Widget・頁面永遠得到相同的結果。
 *
 * **這不是完全的封鎖。**這裡只是不要繪製畫面，文章本身仍然以公開狀態儲存，
 * 因此直接向伺服器請求的人仍然看得到。伺服器真正會阻止的是**文章的公開範圍**
 * （`visibility`）。
 * 真正不應該被其他人知道的文章，必須將文章本身設為私密／會員公開。
 */
import React, { Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useMenuSettings, hrefAccess, canAccessHref } from '@/lib/menuStore';
import { PageTitle } from '@/components/ui/PageText';

function GuardInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const { user, isAdmin, ready } = useAuth();
  const [menuSet, , loaded] = useMenuSettings();

  /* 對應成選單中記載的網址形式 — 區段使用 `?s=`，額外留言板使用 `?b=`。
     如果直接使用 `sp.toString()`，其他參數可能混進來，或參數順序不同而無法辨識。 */
  const s = sp.get('s');
  const b = sp.get('b');
  const path = pathname + (s ? `?s=${s}` : b ? `?b=${b}` : '');

  // 在設定與登入確認完成之前，什麼都不繪製 —
  // 如果先繪製，即使只有一個影格也可能讓內容短暫顯示；反過來也會讓管理員短暫看到「非公開」。
  if (!loaded || !ready) return <section className="page" />;

  // 由於會員選擇（visMembers）也會納入判定，因此統一使用共用函式（v2.0）
  const ok = canAccessHref(menuSet, path, { loggedIn: !!user, isAdmin, id: user?.id });
  if (ok) return <>{children}</>;

  const vis = hrefAccess(menuSet, path);
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>PRIVATE</PageTitle>
        {/* 如果已經登入卻被阻擋，代表不在允許的會員名單中 — 這時顯示「請登入」的提示會讓人感到困惑 */}
        <p>{blockedMsg(vis === 'admin' ? 'admin' : 'member', !!user)}</p>
      </div>
    </section>
  );
}

const blockedMsg = (vis: 'member' | 'admin', loggedIn: boolean) =>
  vis === 'admin' ? '僅限管理員查看'
    : loggedIn ? '僅限允許的會員查看'
      : '僅限登入會員查看';

export function MenuGuard({ children }: { children: React.ReactNode }) {
  // useSearchParams 需要 Suspense 邊界（Next App Router）
  return <Suspense fallback={<section className="page" />}><GuardInner>{children}</GuardInner></Suspense>;
}

/** 顯示在無法進入的地方的畫面 — 使用與上方 MenuGuard 相同的文字 */
function blockedView(vis: 'member' | 'admin', loggedIn: boolean) {
  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>PRIVATE</PageTitle>
        <p>{blockedMsg(vis, loggedIn)}</p>
      </div>
    </section>
  );
}

/**
 * 詳細頁面用（v2.0）— **文章網址中不包含區段。**
 * 只看 `/gallery/b1` 無法知道該文章是否屬於非公開畫廊，因此 MenuGuard 無法阻止。
 * 讀取文章並得知其所屬區段的頁面將該網址（`/gallery?s=fan`）傳進來後，在這裡進行判定。
 *
 * 如果有回傳值，直接 return 該值即可 —
 * **因為這是 Hook，所以必須在頁面的其他 early return 之前呼叫**（每次渲染的 Hook 數量不能不同）。
 * 如果 href 尚未存在（正在讀取文章），則不阻止 — 因為此時也還沒有內容可以顯示。
 */
export function useHrefBlock(href?: string): React.ReactElement | null {
  const { user, isAdmin, ready } = useAuth();
  const [menuSet, , loaded] = useMenuSettings();
  if (!href || !loaded || !ready) return null;
  if (canAccessHref(menuSet, href, { loggedIn: !!user, isAdmin, id: user?.id })) return null;
  const vis = hrefAccess(menuSet, href);
  return blockedView(vis === 'admin' ? 'admin' : 'member', !!user);
}