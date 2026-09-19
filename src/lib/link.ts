'use client';
// 內部連結正規化（v1.9 使用者要求）— 即使使用者貼上完整網址（https://我的網站/rels/allow）
// 也會移除目前網站的來源（origin），轉換成 /rels/allow 相對路徑後再儲存・跳轉（外部網址則維持原樣）。
export function normalizeInternalLink(v: string): string {
  const s = v.trim();
  if (!s) return s;
  try {
    if (/^https?:\/\//i.test(s) && typeof window !== 'undefined') {
      const u = new URL(s);
      if (u.origin === window.location.origin) return u.pathname + u.search + u.hash;
    }
  } catch { /* 解析失敗 — 保留原輸入 */ }
  return s;
}

/** 頁面網址（slug）有效性 — 僅限英文小寫・數字・連字號，1～40 個字元（v1.9） */
export const isValidSlug = (s: string) => /^[a-z0-9-]{1,40}$/.test(s);
export const slugify = (s: string) => s.trim().toLowerCase().replace(/\s+/g, '-');
