'use client';
// 用來在 Hook 外也能讀取目前登入使用者 id 的極小型入口（v2.0）
// 將儲存層（db・postStore）與 AuthProvider 分離，避免儲存層依賴 AuthProvider。由 AuthProvider 寫入值。

let uid: string | null = null;

export function setCurrentUserId(id: string | null) { uid = id; }
export function currentUserId(): string | null { return uid; }