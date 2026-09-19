// HTML 安全政策（6.3 確定）— 不允許執行腳本，保留樣式
// 移除 <script>・內嵌事件（onclick 等）・javascript: 連結。使用 DOMPurify。
import DOMPurify from 'dompurify';
import { marked } from 'marked';

export type PostMode = 'md' | 'html';

export function sanitizeHtml(html: string): string {
  // DOMPurify 需要瀏覽器 DOM — SSR 預先渲染時回傳空值（由客戶端渲染）
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['style', 'target', 'align'],   // 自由使用樣式（6.3）
    FORBID_TAGS: ['script', 'iframe', 'object', 'embed', 'form', 'input'],
  });
}

/** MD/HTML 內容 → 可渲染的安全 HTML */
export function renderBody(mode: PostMode, body: string): string {
  const raw = mode === 'md' ? (marked.parse(body, { async: false }) as string) : body;
  return sanitizeHtml(raw);
}