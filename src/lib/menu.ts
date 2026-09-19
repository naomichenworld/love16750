// 上方選單樹 — 規劃書第 3 章（階層選單、選單選擇制）
// 基本配置依照原型_2 的上方選單（包含委託・紀錄群組）
// ※原型的「登入」gnb 項目為暫時配置 — 實際上會顯示於右上方使用者區域（第 3 章註釋）
// TODO（環境設定選單管理）：管理員可透過 GUI 編輯此結構 → 改為儲存至 DB
export interface MenuItem {
  label: string;
  href?: string;             // 沒有子項目的單獨選單
  children?: { label: string; href: string }[];
}

/** 可配置的全部功能（模組）— href → 預設名稱。必須放入選單樹中才會顯示（第 3 章選單選擇制） */
export const FEATURES: { href: string; label: string }[] = [
  { href: '/chars', label: '角色' },
  { href: '/rels', label: '自設關係' },
  { href: '/rp', label: '角色扮演' },
  { href: '/board', label: '列表' },
  { href: '/gallery', label: '圖庫' },
  { href: '/loadb', label: '載入紀錄' },
  { href: '/tchars', label: '角色' },   // TRPG 角色 — 與自設角色透過 href 區分
  { href: '/trpg', label: '日誌備份' },
  { href: '/dotori', label: '橡果' },
  { href: '/playlog', label: '遊玩紀錄' },
  { href: '/comm', label: '委託' },
  { href: '/comm-apply', label: '申請者列表' },
  { href: '/cal', label: '行事曆' },
  { href: '/diary', label: '日記' },
  { href: '/threads', label: '感想串' },
  { href: '/memo', label: '備忘錄' },
  { href: '/guest', label: '訪客留言' },
  { href: '/intro', label: '介紹' },
];

export const DEFAULT_MENU: MenuItem[] = [
  {
    label: '自設',
    children: [
      { label: '角色', href: '/chars' },
      { label: '自設關係', href: '/rels' },
      { label: '角色扮演', href: '/rp' },
    ],
  },
  {
    label: '留言板',
    children: [
      { label: '列表', href: '/board' },
      { label: '圖庫', href: '/gallery' },
      { label: '載入紀錄', href: '/loadb' },
    ],
  },
  {
    label: 'TRPG',
    children: [
      { label: '角色', href: '/tchars' },
      { label: '日誌備份', href: '/trpg' },
      { label: '橡果', href: '/dotori' },
      { label: '遊玩紀錄', href: '/playlog' },
    ],
  },
  {
    label: '委託',
    children: [
      { label: '委託', href: '/comm' },
      { label: '申請者列表', href: '/comm-apply' },
    ],
  },
  {
    label: '紀錄',
    children: [
      { label: '行事曆', href: '/cal' },
      { label: '日記', href: '/diary' },
      { label: '感想串', href: '/threads' },
      { label: '備忘錄', href: '/memo' },
    ],
  },
  { label: '訪客留言', href: '/guest' },
];
