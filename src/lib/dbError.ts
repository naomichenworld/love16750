// 將伺服器回傳的錯誤轉換成使用者可以採取的處理方式（v2.0）
//  — 只顯示原始訊息的話，不知道該做什麼；完全隱藏的話，又找不到原因。

/** 將遇過的錯誤轉換成原因與解決方法 — 只看原始訊息不知道該做什麼 */
export function explainDbError(msg: string): string {
  const m = msg.toLowerCase();
  // PostgREST 將資料表・欄位列表快取起來，所以即使透過 SQL 新增欄位，也可能暫時不知道
  if (m.includes('schema cache') || m.includes('pgrst204')) {
    return 'DB Schema 快取仍是舊狀態 — 請在 Supabase > SQL Editor 執行以下一行：'
      + "notify pgrst, 'reload schema';  （也可以重新執行安裝 SQL）";
  }
  // 被資料列層級安全性擋住的情況 — 可能沒有套用規則，或尚未登入
  if (m.includes('row-level security') || m.includes('violates row-level') || m.includes('permission denied')) {
    return '被安全性規則擋住了 — 請確認登入狀態，以及是否已執行安裝 SQL（安全性規則）';
  }
  // Firestore 回傳規則拒絕時的訊息（v2.0 分支回報 — 具有編輯權限的會員儲存遭拒）。
  // 可能是規則仍是舊版本，或者更新前給予的編輯權限尚未反映到文件中 —
  // 後者在管理員開啟一次角色列表後，會自動重新計算。
  if (m.includes('insufficient permissions')) {
    return '被安全性規則擋住了 — ① 請將 Firebase 控制台中的規則重新貼上「環境設定 > 會員/安全性」中的最新規則，'
      + '② 如果是編輯權限相關問題，請管理員先開啟一次角色列表後再重新嘗試';
  }
  if (m.includes('does not exist') || m.includes('relation') && m.includes('exist')) {
    return '伺服器上還沒有這個資料表・欄位 — 請重新執行最新版本的安裝 SQL';
  }
  return msg;
}