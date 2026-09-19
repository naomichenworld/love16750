'use client';
// 設定沒有成功儲存到伺服器時的通知（v2.0）
//
// 如果默默忽略儲存失敗，這個瀏覽器裡仍然會保留設定，看起來就像已經儲存成功，
// 但下次進入網站時會被伺服器上的設定覆蓋，變成「明明儲存了，卻又恢復原狀」。
// 為了讓使用者知道原因，在儲存失敗的當下直接通知。
import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { explainDbError } from '@/lib/dbError';
import { ERR_EVT } from '@/lib/settingStore';

const LABEL: Record<string, string> = {
  'ohome.site.v1': 'Logo・分頁標題',
  'ohome.theme.v2': '主題顏色',
  'ohome.fonts.v2': '字體',
  'ohome.menuset.v1': '選單',
  'ohome.main.v1': '主頁 Widget',
  'ohome.pagetext.v1': '頁面文字',
};

export function SettingSync() {
  const toast = useToast();
  useEffect(() => {
    let last = 0;
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { key: string; message?: string };
      // 即使一次有多筆儲存失敗，也只顯示一則通知（相同原因連續跳出通知只會造成干擾）
      const now = Date.now();
      if (now - last < 3000) return;
      last = now;
      const name = LABEL[d.key] ?? d.key;
      const why = d.message ? explainDbError(d.message) : '';
      toast(why
        ? `${name}設定無法儲存 — ${why}`
        : `${name}設定無法儲存到伺服器 — 請確認是否以管理員帳號登入，以及是否已發布安全規則`);
    };
    window.addEventListener(ERR_EVT, h);
    return () => window.removeEventListener(ERR_EVT, h);
  }, [toast]);
  return null;
}