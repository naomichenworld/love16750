'use client';
// 防止圖片儲存（v1.9 使用者要求）— 在選單管理 > 權限中勾選的區域（留言板（包含畫廊・載入紀錄）/
// 委託/TRPG 角色/自設/自設關係）中，禁止圖片右鍵儲存・拖曳取出。管理員帳號除外。
// 由於網頁本身的特性，無法做到完全阻止 — 只能防止一般訪客輕易儲存（參考企劃書 6.3）。
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { useMenuSettings, imgProtectAreaFor } from '@/lib/menuStore';
import { useAuth } from '@/lib/auth';

export function ImgProtect() {
  const pathname = usePathname();
  const [ms] = useMenuSettings();
  const { isAdmin } = useAuth();
  const area = imgProtectAreaFor(pathname ?? '');
  const active = !isAdmin && !!area && (ms.imgProtect ?? []).includes(area);

  useEffect(() => {
    if (!active) return;
    const isImg = (t: EventTarget | null) => t instanceof HTMLElement && t.tagName === 'IMG';
    const onCtx = (e: MouseEvent) => { if (isImg(e.target)) e.preventDefault(); };
    const onDrag = (e: DragEvent) => { if (isImg(e.target)) e.preventDefault(); };
    document.addEventListener('contextmenu', onCtx);
    document.addEventListener('dragstart', onDrag);
    document.documentElement.classList.add('img-protect-on');
    return () => {
      document.removeEventListener('contextmenu', onCtx);
      document.removeEventListener('dragstart', onDrag);
      document.documentElement.classList.remove('img-protect-on');
    };
  }, [active]);

  return null;
}