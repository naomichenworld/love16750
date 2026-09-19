'use client';
// 文章・留言等列表儲存被伺服器拒絕時的通知（v2.0）
//
// 儲存失敗時，畫面會恢復成伺服器上的資料，但光是這樣看起來只會像「剛剛寫的文章自己消失了」。
// 實際上，Fork 使用者遇到的「留言馬上被刪除」症狀就是這種情況 — 因為不知道原因（權限・安全規則），
// 結果使用了把所有人都提升為管理員這種危險的繞過方式。因此現在會直接在當下告知原因。
//
// 一開始只顯示「請確認」，但這樣仍然不知道到底哪裡出錯
// （Fork 使用者即使執行了全部 SQL，仍然詢問為什麼無法儲存）— **直接顯示伺服器提供的錯誤**，
// 並且將實際遇到的原因與解決方法一起寫出來。
import { useEffect } from 'react';
import { useToast } from '@/components/ui/Toast';
import { LIST_ERR_EVT } from '@/lib/postStore';
import { explainDbError } from '@/lib/dbError';

const LABEL: Record<string, string> = {
  comments: '留言',
  posts: '文章',
  guestbook: '訪客留言',
  roadview: '載入紀錄',
  characters: '角色',
  relations: '自設關係',
  trpg_logs: 'TRPG 日誌',
  trpg_log_bodies: 'TRPG 日誌正文',
  applicants: '委託申請',
};

export function ListSync() {
  const toast = useToast();
  useEffect(() => {
    let last = 0;
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as { table?: string; message?: string };
      // 即使一個操作同時影響多筆資料而連續失敗，也只顯示一次通知
      const now = Date.now();
      if (now - last < 3000) return;
      last = now;
      const name = d.table ? (LABEL[d.table] ?? d.table) : '內容';
      const why = d.message ? explainDbError(d.message) : '';
      toast(why
        ? `${name}을(를) 저장하지 못했습니다 — ${why}`
        : `${name}을(를) 저장하지 못했습니다 — 로그인 상태와 보안 규칙(환경설정 > 회원/보안)을 확인해 주세요`);
    };
    window.addEventListener(LIST_ERR_EVT, h);
    return () => window.removeEventListener(LIST_ERR_EVT, h);
  }, [toast]);
  return null;
}