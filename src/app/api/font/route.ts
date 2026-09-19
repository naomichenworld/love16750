// 上傳的字體檔案同源中繼（v2.0 使用者回報 —「登錄的字體無法套用」）。
//
// 伺服器模式的字體檔案是儲存空間（Firebase/Supabase）的公開網址，但**字體是瀏覽器
// 會強制執行 CORS 的資源**（與圖片不同），如果儲存空間沒有提供允許的 Header，載入會整個
// 被拒絕 — 這就是「已經登錄，但畫面沒有任何反應，仍然靜默使用 fallback 字體」的原因。
// 這個路由會由伺服器代為取得檔案，再以同源方式提供出去，如此一來就完全不會觸發 CORS。
//
// 為了避免變成可以代為取得任何網址的通道，只允許儲存空間的主機。
const ALLOWED = [
  /(^|\.)firebasestorage\.googleapis\.com$/,
  /(^|\.)supabase\.co$/,
  /(^|\.)supabase\.in$/,
];

export async function GET(req: Request) {
  const u = new URL(req.url).searchParams.get('u') ?? '';
  let target: URL;
  try { target = new URL(u); } catch { return new Response('bad url', { status: 400 }); }
  if (target.protocol !== 'https:' || !ALLOWED.some(r => r.test(target.hostname))) {
    return new Response('host not allowed', { status: 400 });
  }
  try {
    const res = await fetch(target, { cache: 'no-store' });
    if (!res.ok || !res.body) return new Response('fetch failed', { status: 502 });
    return new Response(res.body, {
      headers: {
        'content-type': res.headers.get('content-type') ?? 'application/octet-stream',
        // 檔案網址中包含唯一 id，內容不會發生變化 — 長時間快取
        'cache-control': 'public, max-age=31536000, immutable',
      },
    });
  } catch {
    return new Response('fetch failed', { status: 502 });
  }
}