import type { Metadata } from 'next';
import './globals.css';
import { ThemeProvider } from '@/lib/ThemeProvider';
import { AuthProvider } from '@/lib/auth';
import { MainStoreProvider } from '@/lib/mainStore';
import { BgmStoreProvider } from '@/lib/bgmStore';
import { FontProvider } from '@/lib/fontStore';
import { ToastProvider } from '@/components/ui/Toast';
import { TopBar } from '@/components/shell/TopBar';
import { BgmPlayer } from '@/components/shell/BgmPlayer';
import { TipLayer } from '@/components/ui/TipLayer';
import { CursorLayer } from '@/components/shell/CursorLayer';
import { ImgProtect } from '@/components/shell/ImgProtect';
import { SetupGate } from '@/components/shell/SetupGate';
import { DocTitle } from '@/components/shell/DocTitle';
import { DocIcon } from '@/components/shell/DocIcon';
import { SettingSync } from '@/components/shell/SettingSync';
import { ListSync } from '@/components/shell/ListSync';
import { UploadBusy } from '@/components/shell/UploadBusy';
import { SpellCheck } from '@/components/shell/SpellCheck';
import { PageFrame } from '@/lib/pageRefresh';
import { MenuGuard } from '@/components/shell/MenuGuard';
import { ServerBoot } from '@/components/shell/ServerBoot';
import { siteMeta } from '@/lib/siteMeta';

/**
 * 會預先讀取連結的一方（KakaoTalk・Discord・搜尋引擎）只會看到伺服器回傳的 HTML。
 * 分頁標題會在畫面載入後才變更，因此那一側一直會拿到預設值 —
 * 在這裡先讀取一次相同的設定來對齊標題（讀取失敗時使用預設值）。
 */
export async function generateMetadata(): Promise<Metadata> {
  const { title, subtitle, crawlDesc, favicon } = await siteMeta();
  // 爬蟲說明文字（v2.0 使用者要求）— 環境設定中直接指定 > 副標題 > 預設文字
  const description = crawlDesc?.trim() || subtitle?.trim() || '자캐놀이용 개인 아카이브';
  return {
    title,
    description,
    // 分頁圖示（v2.0 使用者要求）— 如果有指定，就使用它取代預設的 favicon.ico。
    // 如果沒有指定，就完全不加入 icons，維持 Next 的預設檔案處理
    ...(favicon ? { icons: { icon: favicon } } : {}),
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary', title, description },
  };
}

// 伺服器函式的區域無法透過程式碼指定 — preferredRegion 在此 Next 版本中已 deprecated，
// 也已實際確認 vercel.json 的 regions 即使在新專案中也不會套用。
// 必須在 Vercel 專案 Settings > Functions > Function Region 中直接指定後重新部署（安裝指南 2-B ④）。

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 防止 Whale・Chrome 的「網頁內容深色模式」（強制變暗）重新繪製頁面（v2.0 使用者回報）。
            與 CSS 的 color-scheme 是相同的宣告，但為了讓它從樣式載入前的第一次繪製就套用，也以 meta 放置 */}
        <meta name="color-scheme" content="only light" />
        {/* 鎖定 Dark Reader 類擴充功能的強制變色（v2.0）— 即使忽略 color-scheme 的擴充功能也會遵守這個 meta。
            主題顏色全部由網站設定直接管理，因此從任何途徑阻止外部變色都是正確的 */}
        <meta name="darkreader-lock" />
        {/* 防止主題 FOUC — 如果放在 <body> 裡，body 背景可能會先以 :root 的深色預設值繪製，
            （使用者發現 —「第一次進入時預設深色模式會閃一下」）— 因為 body 本身開始解析的瞬間
            就可能只靠 CSS 被繪製出來。移到 <head> 最前面，讓它在阻塞渲染區間（第一次繪製前）先執行（v2.0） */}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){try{var m=JSON.parse(localStorage.getItem('ohome.themeCss.v1'));if(m){var s=document.documentElement.style;for(var k in m)s.setProperty(k,m[k]);}
/* Whale 專用（v2.0 使用者回報）— Whale 的「網頁內容深色模式」會忽略 only light opt-out。
   Whale 自己的深色引擎會跳過「支援深色模式的網站」，因此只在 Whale 宣告支援深色模式。
   其他瀏覽器維持已驗證的 only light — 將影響範圍限制在 Whale */
if(navigator.userAgent.indexOf('Whale/')>-1){document.documentElement.style.colorScheme='light dark';}}catch(e){}})();`,
        }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600&family=Noto+Serif+KR:wght@500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        {/* 確認伺服器連線後才繪製 App — 讀取一次設定（ohome.config.json／local／env）（v2.0） */}
        <ServerBoot>
        <ThemeProvider>
          <AuthProvider>
            <ToastProvider>
              <FontProvider>
              <MainStoreProvider>
                <BgmStoreProvider>
                  {/* 安裝初始畫面 — 第一次執行時只顯示管理員・訪客設定／備份復原（v1.9） */}
                  <SetupGate>
                  <TopBar />
                  {/* App 外殼：只允許在這個區域內捲動（第 7 章） */}
                  {/* PageFrame：再次點擊相同選單時，只重新掛載這裡面的內容（BGM・上方選單維持不變，v1.9） */}
                  {/* MenuGuard：設為私密的選單，即使透過網址進入也無法開啟（v2.0 使用者要求） */}
                  <main id="appMain"><PageFrame><MenuGuard>{children}</MenuGuard></PageFrame></main>
                  {/* BGM 迷你播放器 — 全域常駐，即使切換頁面也會維持（4.1） */}
                  <BgmPlayer />
                  {/* 全域自訂工具提示 — 所有 data-tip 元素共用（第 7 章） */}
                  <TipLayer />
                  {/* 自訂滑鼠游標（5.1） */}
                  <CursorLayer />
                  {/* 防止圖片儲存 — 在選單管理 > 權限中指定各區域（v1.9） */}
                  <ImgProtect />
                  {/* 瀏覽器分頁標題 — 在設計分頁中指定（v1.9） */}
                  <DocTitle />
                  <DocIcon />
                  {/* 設定尚未儲存至伺服器時顯示通知（v2.0）— 靜默失敗的話就無法知道原因 */}
                  <SettingSync />
                  {/* 文章・留言儲存被拒絕時顯示原因（v2.0）— 如果靜默退回，看起來會像是自己消失了一樣 */}
                  <ListSync />
                  {/* 圖片上傳中顯示提示（v2.0）— 避免因為上傳速度慢而重複點擊 */}
                  <UploadBusy />
                  {/* 隱藏拼字檢查底線 — 設計分頁（v2.0） */}
                  <SpellCheck />
                  </SetupGate>
                </BgmStoreProvider>
              </MainStoreProvider>
              </FontProvider>
            </ToastProvider>
          </AuthProvider>
        </ThemeProvider>
        </ServerBoot>
      </body>
    </html>
  );
}