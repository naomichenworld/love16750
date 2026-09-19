// 自設關係問題列表（v1.9）— 由環境設定管理的問題組。
// 分為 CP（情侶）／NCP（非情侶）— 根據自設關係・AU 的 CP／NCP 類型，選擇對應的題組放入 QUESTIONS 區段。
// 預設 DB 之後預計替換成使用者提供的內容 — 以下種子資料僅作為少量佔位用。
import { RelCpTag } from './charStore';

export interface RelQuestionSet {
  id: string;
  name: string;          // 題組名稱
  cat: RelCpTag;         // CP / NCP
  questions: string[];
}

export const RELQ_KEY = 'ohome.relqsets.v1';

export const RELQ_SEED: RelQuestionSet[] = [];

export const CP_LABEL: Record<RelCpTag, string> = { cp: 'CP', ncp: 'NCP' };