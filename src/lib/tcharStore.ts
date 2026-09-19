// TRPG 角色列表（v1.9 新增）— 1:1 印章卡片 + 依表情切換立繪／沉穩模式
// 每個表情都儲存原始圖片（與印章・立繪無關）以及 1:1 縮圖位置（裁切）—
// 卡片主圖是目前表情的 1:1 裁切圖，點擊縮圖可以切換表情，點擊主圖時放大原始圖片（立繪）
import type { CropValue } from '@/components/ui/CropEditor';

export interface TrpgFace {
  id: string;
  label?: string;            // 表情名稱（可選 — 例如基本／微笑等）
  imgId?: string;            // 原始圖片（IndexedDB — 印章或立繪）
  crop?: CropValue;          // 1:1 縮圖位置
  ph?: string;               // 展示用 Placeholder
}

export interface TrpgChar {
  id: string;
  name: string;              // 名稱（必填）
  scenario: string;          // 跑過的劇本
  rule: string;              // 規則（CoC 7th 等）
  role: string;              // 角色定位 — PL・GMPC・HO1 等
  desc: string;              // 簡單介紹（Rich Editor HTML — 隔離渲染）
  // 圖片模式（v1.9）：單一印章（每個表情都有 1:1 印章，各自裁切）／
  // 立繪印章（表情沉穩 — 強制所有檔案的長寬尺寸相同，共用縮圖裁切位置）
  imgMode?: 'stamp' | 'standing';
  crop?: import('@/components/ui/CropEditor').CropValue; // 立繪共用的縮圖位置
  stdW?: number; stdH?: number; // 立繪基準尺寸（用於上傳驗證）
  faces: TrpgFace[];         // 第一個是代表印章
  ph: string;
}

/** 表情的縮圖裁切 — 立繪時共用裁切，單一印章時使用個別裁切 */
export const faceCrop = (c: TrpgChar, f?: TrpgFace) =>
  (c.imgMode === 'standing' ? c.crop : f?.crop) ?? f?.crop;

export const TCHAR_SEED: TrpgChar[] = [];