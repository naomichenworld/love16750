// 角色・自設關係資料儲存庫 — localStorage（→ 預計移轉至 Supabase）
// 規劃書 4.4（角色）、4.5（自設關係）
export type Visibility = 'public' | 'member' | 'private'; // 公開範圍 3 階段

export interface ColorChip { hex: string; label: string }

/** 主題色圓點邊框 (v2.0 使用者要求) — 未指定時維持目前的淡色邊框，
 *  'none' 表示無邊框，hex 則使用該顏色 1px */
export const chipBorder = (bd?: string): string =>
  (bd === 'none' ? 'none' : `inset 0 0 0 1px ${bd ?? 'rgba(0,0,0,.1)'}`);

export interface CharTab {
  id: string;
  icon: string;          // 圖示文字（上傳圖示後續處理）
  title: string;
  subtitle?: string;     // 標題下方的小字（選填）
  html: string;          // HTML 編輯器內容（禁止腳本 — 渲染時會 sanitize）
}

export interface Character {
  id: string;
  name: string;          // 代表名稱（適用專用字體）
  sub: string;           // 韓文名稱・所屬的一行文字
  color: string;         // 代表主題色（對話框・列表圓點）
  // 詳細頁面主題 (v1.9 使用者確定) — custom 時暫時將首頁色盤切換成代表主題色（4.18 方式）
  themeMode?: 'default' | 'custom';
  colors: ColorChip[];   // 主題色列表
  /** 主題色圓點邊框 (v2.0 使用者要求) — 'none' = 無邊框・hex = 使用該顏色 1px。
   *  未指定時維持目前的淡色邊框（尚未設定的首頁外觀不會改變） */
  colorBd?: string;
  colorTipMode?: 'hex' | 'both' | 'label'; // 色點提示文字顯示：hex / 名稱+hex / 僅名稱
  specs: { label: string; value: string }[];
  tabs: CharTab[];       // 除基本資料外的追加分頁
  basicHtml: string;     // 基本資料分頁的介紹內容（HTML）
  visibility: Visibility;
  /** 頁面網址別名 (v2.0 使用者要求) — /chars/{別名}。與建立時決定的網址（id）不同，
   *  **之後可以在編輯畫面中修改。** 參照（自設關係成員・權限等）永遠以 id 儲存，因此
   *  即使修改也不會中斷，舊網址（id）也仍然可以開啟。 */
  slug?: string;
  /** 屬於哪一個角色列表 (v2.0 使用者要求) — 沒有時使用預設列表。
   *  **自設關係・角色扮演在尋找角色時不會考慮所屬列表** — 只有列表畫面會區分 */
  secId?: string;
  thumbClass: string;    // 示範用佔位圖 class
  thumbId?: string;      // 列表縮圖（IndexedDB，3:4 裁切）
  thumbCrop?: import("@/components/ui/CropEditor").CropValue;
  /** 詳細頁面中央插畫的位置 (v2.0) — 因為與列表縮圖的顯示大小・比例不同，
   *  使用相同裁切會無法顯示想要的部分。分開設定後，詳細頁面會使用此值。 */
  artCrop?: import("@/components/ui/CropEditor").CropValue;
  arts?: string[];       // 插畫列表（IndexedDB — 第一張是代表完整插畫，也是縮圖原圖）
  artId?: string;        // （舊）單一完整插畫
  artUrl?: string;       // （舊）完整插畫 URL
  fontId?: string;       // 專用字體 — 名稱・標題 (5.1)
  /** 詳細頁面大字名稱的字體大小 px (v2.0) — 預設 38。
   *  因為名稱長度各不相同，直接自動縮小會看起來不自然。每個角色自行設定。 */
  nameSize?: number;
  /** 詳細頁面大字名稱粗體 (v2.0 使用者要求) — 預設開啟。若某字體不適合粗體可以關閉 */
  nameBold?: boolean;
  bodyFontId?: string;   // 內文字體 — 個人資料・介紹文字
  own: boolean;          // true = 管理員自設角色（顯示在列表），false = 對方角色
  // 會員-角色連結 (第 3 次，v1.9) — 賦予對方角色會員權限：
  // play = 可以在角色扮演中以此角色發言，edit = 甚至可以編輯角色（包含 play）
  grants?: CharGrant[];
  // AU 專用角色資料 (v1.9) — key `${relId}:${auId}`。自設關係新增 AU 後，成員角色
  // 詳細頁右上角會出現 AU 列表，選擇後整個角色資料會切換成此值。
  // 編輯方式為 /chars/[id]/edit?au= — 在 AU 專用編輯頁面中完全像新角色資料一樣撰寫（使用者確定）
  auProfiles?: Record<string, AuCharProfile>;
}

/** AU 角色資料 (v1.9 全面擴充) — 從姓名・關鍵字・性別開始，全部都可以因 AU 而不同。
 *  只有指定的欄位會取代 base（只有舊版 basicHtml/arts 的資料也能正常運作） */
export interface AuCharProfile {
  basicHtml?: string;
  arts?: string[];
  name?: string;
  sub?: string;
  color?: string;
  themeMode?: 'default' | 'custom';
  colors?: ColorChip[];
  colorTipMode?: 'hex' | 'both' | 'label';
  specs?: { label: string; value: string }[];
  tabs?: CharTab[];
  thumbId?: string;
  thumbCrop?: import("@/components/ui/CropEditor").CropValue;
  artCrop?: import("@/components/ui/CropEditor").CropValue;   // 詳細頁面中央插畫位置 (v2.0)
  fontId?: string;
  nameSize?: number;     // 詳細頁面大字名稱大小 px (v2.0)
  nameBold?: boolean;    // 詳細頁面大字名稱粗體 (v2.0 使用者要求 — 某些字體不適合粗體)
  bodyFontId?: string;
}

/** 合成 AU 角色資料後的顯示用角色 — 只有 AU 指定的欄位會被取代（詳細頁・編輯預填共用） */
export function charWithAu(c: Character, auKey?: string | null): Character {
  const p = auKey ? c.auProfiles?.[auKey] : undefined;
  if (!p) return c;
  return {
    ...c,
    ...(p.name !== undefined ? { name: p.name } : {}),
    ...(p.sub !== undefined ? { sub: p.sub } : {}),
    ...(p.color !== undefined ? { color: p.color } : {}),
    ...(p.themeMode !== undefined ? { themeMode: p.themeMode } : {}),
    ...(p.colors !== undefined ? { colors: p.colors } : {}),
    ...(p.colorTipMode !== undefined ? { colorTipMode: p.colorTipMode } : {}),
    ...(p.specs !== undefined ? { specs: p.specs } : {}),
    ...(p.tabs !== undefined ? { tabs: p.tabs } : {}),
    ...(p.basicHtml !== undefined ? { basicHtml: p.basicHtml } : {}),
    // 圖片**不會繼承** (v2.0 使用者要求) — 如果 AU 角色資料中沒有放圖片，就保持空白。
    // 文字（名稱・介紹・規格）如果 AU 沒有修改，使用 base 會比較自然，但圖片不同：
    // 建立學園 AU 後，如果還沒有放圖片卻直接顯示原本圖片，會讓人以為那是該 AU 的圖片。
    // 自設關係全身圖本來就是相同規則（「AU 只能使用自己的全身圖」）。
    arts: p.arts ?? [],
    artId: p.arts?.[0],
    thumbId: p.thumbId,
    thumbCrop: p.thumbCrop,
    ...(p.fontId !== undefined ? { fontId: p.fontId } : {}),
    ...(p.bodyFontId !== undefined ? { bodyFontId: p.bodyFontId } : {}),
    // nameSize 之前一直沒有被合併 — AU 有儲存，但顯示時仍使用 base 大小 (v2.0 修正)
    ...(p.nameSize !== undefined ? { nameSize: p.nameSize } : {}),
    ...(p.nameBold !== undefined ? { nameBold: p.nameBold } : {}),
  };
}

export interface CharGrant { userId: string; level: 'play' | 'edit' }

/** 該自設關係的成員角色中，是否至少有一個是獲得權限的會員 (v2.0) — 用於判斷是否隱藏問答 */
export function hasRelGrant(
  members: { charId: string }[], chars: Character[], userId?: string,
): boolean {
  if (!userId) return false;
  return members.some(m => !!charGrant(chars.find(c => c.id === m.charId) ?? { grants: [] } as unknown as Character, userId));
}

/** 會員的角色權限 — edit 包含 play */
export function charGrant(c: Character, userId?: string): 'play' | 'edit' | null {
  if (!userId) return null;
  const g = c.grants?.find(x => x.userId === userId);
  return g?.level ?? null;
}

export interface RelMember {
  charId: string;
  quote: string;                 // 每個角色的一句話
  keywords: string[];            // 關鍵字徽章
  desc: string;                  // 介紹文字
  palette: ColorChip[];          // 色盤圖示
  linkedNote?: string;            // 「已連結會員 ○○」等
  fullImgId?: string;            // 全身圖片 (v1.9 — 在自設關係編輯中登錄，中央全身模式)
  fullScale?: number;            // 全身大小 %（維持比例，以預覽滾輪調整 — 預設 90）
  fullOffX?: number;             // 全身水平位置偏移 %（預覽中拖曳 — 預設 0，v1.9）
  fullOffY?: number;             // 全身垂直位置偏移 %（預設 0 = 貼齊底部）
  /** 成員卡片臉部區域（1:1）裁切 (v2.0) — 角色列表縮圖是 3:4，
   *  直接使用到正方形區域會產生偏移。在自設關係中另外設定並儲存。 */
  faceCrop?: import('@/components/ui/CropEditor').CropValue;
  /** 成員卡片名稱粗體 (v2.0 使用者要求) — 預設開啟 */
  nameBold?: boolean;
  /** 成員卡片名稱大小 px (v2.0) — 預設 17。因為卡片寬度較窄，每個名稱適合的大小不同 */
  nameSize?: number;
  quoteColor?: string;           // Hero 台詞文字顏色（配對，v1.9 — 預設 #d7dae0）
  quoteMarkColor?: string;       // Hero 台詞引號顏色（預設為柔和重點色）
}

export interface TlSay { charId: string; text: string }
export interface TlItem { era?: string; desc?: string; says: TlSay[] }

export interface QaAnswer {
  charId: string; text: string;
  note?: string;      // 擁有者補充說明 — 對話框 hover 提示（由管理員在編輯視窗中撰寫，v1.9）
  authorId?: string;  // 撰寫會員（v1.9 — 判斷本人修改、本人・管理員刪除）
}
export interface QaEntry {
  no: number; q: string; date: string; answers: QaAnswer[];
  note?: string;   // 對問題的擁有者說明 — 顯示在問題下方（僅管理員撰寫，v2.0）
}

/**
 * 問答回答的一行 = 一個獨立文件 (v2.0)。
 *
 * 以前回答會放在自設關係（Relation）文件的陣列中。因此**要新增回答就必須 UPDATE 自設關係**，
 * 而「只有作者或管理員可以修改」的規則會導致一般會員無法回答由管理員建立的自設關係
 * — 與留言被刪除是同一個根本原因 (v2.0 使用者發現)。
 *
 * 將回答分開儲存後，不需要修改自設關係，每個回答都有自己的 authorId，因此
 * 「自己的回答由自己修改・刪除」就能按照規則正常運作。
 */
export const QA_KEY = 'ohome.qaanswers.v1';

export interface QaAnswerRow extends QaAnswer {
  id: string;
  relId: string;   // 自設關係 id
  auId: string;    // AU id（原始資料為 'base'）
  no: number;      // 問題編號
  date: string;    // 用於排序
}

export const QA_SEED: QaAnswerRow[] = [];

/** 畫面上處理的回答 — 同時帶有儲存位置（分離行 / 舊自設關係內的陣列） */
export type MergedAnswer = QaAnswer & { rowId?: string; legacyIdx?: number };

/** 某個問題的回答 — 先放舊自設關係內的資料，再放分開儲存的資料（依新增順序） */
export function answersFor(
  rows: QaAnswerRow[], relId: string, auId: string, no: number, legacy: QaAnswer[] = [],
): MergedAnswer[] {
  return [
    ...legacy.map((a, i) => ({ ...a, legacyIdx: i })),
    ...rows
      .filter(r => r.relId === relId && r.auId === auId && r.no === no)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(r => ({ ...r, rowId: r.id })),
  ];
}

/** CP/NCP 區分 (v1.9) — CP=情侶，NCP=非情侶。自設關係預設值 + 每個 AU 都可以個別指定 */
export type RelCpTag = 'cp' | 'ncp';

/** AU 單一項目 (v1.9 擴充) — 不只是 catchphrase，而是整個個人資料依 AU 分開：
 *  中央插畫(arts)・時間線・問答・CP/NCP。base（原始資料）直接使用 Relation 最上層欄位（相容舊資料） */
/**
 * AU 中可以使用不同的成員顯示值 (v2.0 使用者發現)。
 *
 * 全身位置・大小、一句話、台詞顏色、名稱大小原本**只存在自設關係成員（RelMember）**中。
 * 在 AU 編輯畫面中修改後，最後會修改自設關係共用的值，因此**其他 AU 頁面也會一起改變。**
 * 現在將它們另外儲存在 AU 中，沒有設定的值才會使用自設關係預設值（→ `auMember`）。
 */
export interface RelAuMember {
  quote?: string;
  fullScale?: number;
  fullOffX?: number;
  fullOffY?: number;
  nameSize?: number;
  nameBold?: boolean;
  quoteColor?: string;
  quoteMarkColor?: string;
  /** 成員卡片臉部區域位置 — 每個 AU 個別設定 (v2.0 使用者回報 — 修改原始資料後 AU 也會一起改變)。
   *  未設定的 AU 會直接沿用自設關係預設值（faceCrop） */
  faceCrop?: import('@/components/ui/CropEditor').CropValue;
}

/** 此 AU 要如何顯示這個成員 — AU 有設定值就使用該值，沒有就使用自設關係預設值。
 *  如果是 base（原始）AU 或沒有設定，就直接回傳自設關係成員。 */
export function auMember(m: RelMember, au?: RelAu): RelMember {
  const o = au?.mset?.[m.charId];
  if (!o) return m;
  const out = { ...m };
  // undefined 表示「未設定」— 如果直接覆蓋，就會把自設關係預設值一起刪掉
  (Object.keys(o) as (keyof RelAuMember)[]).forEach(k => {
    const v = o[k];
    if (v !== undefined) (out as Record<string, unknown>)[k] = v;
  });
  return out;
}

/**
 * AU 專用的顏色・背景 (v2.0 使用者要求 — 「AU 頁面也要把顏色主題之類的全部分開」)。
 *
 * 有設定值就使用該值，沒有就使用自設關係預設值（→ `auStyle`）。自設關係那邊取消「直接指定」後，
 * 那些值會消失；AU 這邊取消後，也會刪除這裡的值並恢復使用自設關係的值。
 */
export interface RelAuStyle {
  nameColor?: string;
  cpColor?: string;
  cpTagBg?: string;
  cpTagFg?: string;
  nameShadowColor?: string;
  nameShadow?: number;
  headerBgG1?: string; headerBgG2?: string; headerBgAngle?: number;
  pageBgG1?: string; pageBgG2?: string; pageBgAngle?: number;
  illuBg?: string; illuOn?: string;
}

/** 此 AU 實際使用的顏色・背景 — AU 有設定值就使用該值，沒有就使用自設關係預設值 */
export function auStyle(rel: Relation, au?: RelAu): RelAuStyle {
  const s = au?.style;
  const base: RelAuStyle = {
    nameColor: rel.nameColor, cpColor: rel.cpColor,
    cpTagBg: rel.cpTagBg, cpTagFg: rel.cpTagFg,
    nameShadowColor: rel.nameShadowColor, nameShadow: rel.nameShadow,
    headerBgG1: rel.headerBgG1, headerBgG2: rel.headerBgG2, headerBgAngle: rel.headerBgAngle,
    pageBgG1: rel.pageBgG1, pageBgG2: rel.pageBgG2, pageBgAngle: rel.pageBgAngle,
    illuBg: rel.illuBg, illuOn: rel.illuOn,
  };
  if (!s) return base;
  const out = { ...base };
  // 以「自設關係顏色・背景組合」為單位替換 — 只要 AU 有設定其中一項，整個組合就使用 AU 的。
  // 如果只有一個顏色是 AU 值，其餘仍是自設關係值，就會產生不協調的組合
  if (s.nameColor !== undefined || s.cpColor !== undefined) {
    out.nameColor = s.nameColor; out.cpColor = s.cpColor;
  }
  if (s.cpTagBg !== undefined || s.cpTagFg !== undefined) {
    out.cpTagBg = s.cpTagBg; out.cpTagFg = s.cpTagFg;
  }
  if (s.nameShadowColor !== undefined || s.nameShadow !== undefined) {
    out.nameShadowColor = s.nameShadowColor; out.nameShadow = s.nameShadow;
  }
  if (s.headerBgG1 !== undefined || s.headerBgG2 !== undefined) {
    out.headerBgG1 = s.headerBgG1; out.headerBgG2 = s.headerBgG2; out.headerBgAngle = s.headerBgAngle;
  }
  if (s.pageBgG1 !== undefined || s.pageBgG2 !== undefined) {
    out.pageBgG1 = s.pageBgG1; out.pageBgG2 = s.pageBgG2; out.pageBgAngle = s.pageBgAngle;
  }
  if (s.illuBg !== undefined || s.illuOn !== undefined) {
    out.illuBg = s.illuBg; out.illuOn = s.illuOn;
  }
  return out;
}

/** 全身圖片使用的陰影 (v2.0 使用者要求) — 完全按照「直接指定陰影」的顏色・強度。
 *  未指定時維持之前的黑色 35%。強度設為 0 就完全移除陰影，讓圖片更加清晰。
 *  geom 會依位置不同而不同 — 詳細頁較大（0 8px 18px），編輯預覽較小（0 6px 14px）。 */
export function fullShadow(color?: string, strength?: number, geom = '0 8px 18px'): string | undefined {
  const pct = strength ?? 100;
  if (pct <= 0) return undefined;
  const a = 0.35 * (pct / 100);
  const hex = (color ?? '#000000').replace('#', '');
  const f = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  const [r, g, b] = [0, 2, 4].map(i => parseInt(f.slice(i, i + 2), 16) || 0);
  return `drop-shadow(${geom} rgba(${r},${g},${b},${a}))`;
}

export interface RelAu {
  id: string;
  label: string;
  catchphrase: string;
  /** AU 專用的自設關係名稱 (v2.0 使用者要求) — 留空時沿用自設關係名稱 */
  name?: string;
  /** AU 專用名稱/內文字體 (v2.0 使用者回報 — 之前 AU 編輯的字體會儲存到原始資料，導致全部一起改變)。
   *  未指定時使用自設關係預設字體 */
  fontId?: string;
  bodyFontId?: string;
  /** AU 專用全身圖前後順序 (v2.0) — AU 編輯的前面/後面不會修改原始配置。未指定：自設關係預設 */
  fullFront?: string;
  /** AU 專用顏色・背景 — 沒有時使用自設關係預設值（參照上方 RelAuStyle 說明） */
  style?: RelAuStyle;
  /** AU 專用成員顯示值 — 沒有時使用自設關係預設值（參照上方 RelAuMember 說明） */
  mset?: Record<string, RelAuMember>;
  quotes?: string[];
  cp?: RelCpTag;          // 未指定時使用自設關係預設值（Relation.cp）
  arts?: string[];        // AU 專用中央/群組插畫（base 使用 Relation.arts）
  timeline?: TlItem[];    // base 使用 Relation.timeline
  questions?: QaEntry[];  // base 使用 Relation.questions
  qaPool?: string[];      // 待出問題庫 (v1.9 — 從列表加入的未出題問題，等待隨機出題)
  qaEnabled?: boolean;    // QUESTIONS 區塊是否啟用（需要按＋新增後才會出現，base 使用 Relation.qaEnabled）
  fulls?: Record<string, string>;  // AU 專用全身圖片（charId → blob id，沒有時使用成員共用全身圖）
  headerImgId?: string | null;     // AU 專用標頭圖片 (v1.9) — 不繼承 base，只使用這個 AU 的圖片
  headerCrop?: import("@/components/ui/CropEditor").CropValue;
  // AU 專用頁面主題 (v1.9 使用者確定) — 未指定時沿用 base（原始資料）主題
  theme?: { mode: 'site' | 'custom'; color?: string; tone?: 'dark' | 'light' };
  /** 隱藏詳細頁下方的角色扮演/日誌連結列表 (v2.0 使用者要求) — 每個 AU 個別設定。
   *  原始資料（base）的設定會放在 aus 的 base 項目中 */
  hideRp?: boolean;
  hideLog?: boolean;
}

export interface Relation {
  id: string;
  /** 頁面網址別名 (v2.0 使用者要求) — /rels/{別名}。之後可以在編輯畫面中修改。
   *  參照（AU 資料鍵・日誌連結等）永遠以 id 儲存，因此修改後也不會中斷。 */
  slug?: string;
  name: string;
  catchphrase: string;
  kind?: 'pair' | 'multi';         // 配對（2 人）/ 多人（3 人以上）— 建立時選擇
  fontId?: string;               // 自設關係名稱字體 (4.5 必要要求 — 5.1 字體庫)
  bodyFontId?: string;           // 內文字體 — 卡片介紹・時間線・問答文字
  arts?: string[];               // 插畫列表（第一張 = 代表 = 列表縮圖原圖）
  headerImgId?: string;          // 標頭圖片 (v1.5 — 上方全寬模糊 + 淡出)
  headerCrop?: import("@/components/ui/CropEditor").CropValue; // 標頭圖片位置裁切（原圖無損）
  themeMode?: 'site' | 'custom'; // 頁面主題：直接使用首頁 / 獨立主題色（4.18 方式）
  themeColor?: string;           // 獨立主題色（custom 時）
  themeTone?: 'dark' | 'light';  // 主題色的深色/淺色感
  illuBg?: string;               // 全身/插畫切換背景色 (v1.9 — 未指定：使用主題深色按鈕色)
  illuOn?: string;               // 全身/插畫切換選擇色（未指定：重點色）
  nameColor?: string;            // 自設關係名稱（Hero 標題）文字顏色 (v1.9 — 未指定：主題色)
  cpColor?: string;              // Catchphrase 文字顏色（未指定：主題色）
  cpTagBg?: string;              // CP/NCP 徽章背景色 (v2.0 — 未指定：預設 pill）
  cpTagFg?: string;              // CP/NCP 徽章文字顏色 (v2.0)
  nameShadowColor?: string;      // 自設關係名稱陰影顏色 (v2.0 — 未指定：黑色)
  nameShadow?: number;           // 自設關係名稱陰影強度 % — 0~200，未指定 100（與原本強度相同）
  // 沒有標頭圖片時使用的背景漸層 (v2.0 使用者要求) — 2 個顏色 + 角度。
  // 未指定時像以前一樣什麼都不繪製（不強制設定背景）
  headerBgG1?: string;
  headerBgG2?: string;
  headerBgAngle?: number;
  // 此自設關係頁面的整體背景漸層 (v2.0 使用者要求) — 2 個顏色 + 角度。
  // 上面的 headerBg* 只套用於上方標頭區域，而這個則是整個頁面的背景。
  pageBgG1?: string;
  pageBgG2?: string;
  pageBgAngle?: number;
  thumbId?: string;              // 列表縮圖（IndexedDB，4:3 裁切）
  thumbCrop?: import("@/components/ui/CropEditor").CropValue;
  members: RelMember[];          // 2 人 = 左/右，3 人以上 = 多人列表
  visibility: Visibility;
  thumbClass: string;
  illustMode: 'duo' | 'one';     // 2 人：2 張全身圖 / 1 張插畫 (v1.8)
  aus: RelAu[];                  // AU 列表（第一項 = 原始 base）
  cp?: RelCpTag;                 // 自設關係預設 CP/NCP（建立時選擇，v1.9）
  fullFront?: string;            // 全身模式中顯示在前方的角色 id (v1.9 — 在預覽中點擊選擇)
  pairRight?: string;            // 配對時放在右側位置的角色 id (v2.0 — 沒有時按照建立順序)
  /** 詳細頁面中央插畫要顯示哪個位置 (v2.0 使用者要求) — 與列表縮圖（thumbCrop）分開。
    *  **以圖片參照作為 key**，因此可以個別調整多張圖片，AU 的插畫也可以存放在相同位置
    *  （因為參照不同，所以不會混在一起）。不會修改原圖。 */
   artCrops?: Record<string, import('@/components/ui/CropEditor').CropValue>;
  timeline: TlItem[];            // base AU 的時間線
  questions: QaEntry[];          // base AU 的問答
  qaPool?: string[];             // base AU 的待出問題庫 (v1.9 — 等待隨機出題)
  qaEnabled?: boolean;           // base AU 的 QUESTIONS 區塊是否啟用（舊版本會根據 questions 是否存在判斷）
  /** 隱藏問答回答 (v2.0 使用者要求) — 問題保持顯示，**只隱藏回答內容**。
   *  開啟後只有**管理員與獲得此自設關係角色權限的會員**可以查看（使用者確定）。
   *  **這只是畫面上的隱藏，不是完整阻擋** — 回答仍以公開方式儲存，因此直接取得
   *  相關資料的人仍可能看到。設定畫面中也會明確寫出這一點。 */
  qaHide?: boolean;
}

export const CHAR_SEED: Character[] = [];

export const REL_SEED: Relation[] = [];

export const findChar = (chars: Character[], id: string) => chars.find(c => c.id === id);

/* ---------- 頁面網址別名 (v2.0 使用者要求) ---------- */
/** 透過網址尋找項目 — 可以用 id 或別名開啟（即使修改別名，舊網址仍然有效） */
export const findByKey = <T extends { id: string; slug?: string }>(list: T[], key: string) =>
  list.find(x => x.id === key || (x.slug ?? '') === key);
/** 此角色的網址 — 有設定別名就使用別名，否則使用 id */
export const charPath = (c: { id: string; slug?: string }) => `/chars/${c.slug?.trim() || c.id}`;
/** 此自設關係的網址 — 有設定別名就使用別名，否則使用 id */
export const relPath = (r: { id: string; slug?: string }) => `/rels/${r.slug?.trim() || r.id}`;