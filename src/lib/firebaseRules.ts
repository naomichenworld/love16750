'use client';
// 安裝畫面中複製使用的 Firebase 安全性規則 — 原始檔案：firebase/firestore.rules · firebase/storage.rules
// （如果修改原始檔案，也要同步更新此檔案）

export const FIRESTORE_RULES = `rules_version = '2';

// ============================================================
// O.HOME Firestore 安全性規則
// Firebase 控制台 → Firestore Database → 規則，貼上後按［發布］.
//
// 文件結構
//   meta/owner            { uid, admins[] }   ← 第一個登入帳號僅能註冊自己一次
//   profiles/{uid}        { nickname, avatarUrl, avatarColor }
//   settings/{key}        { value }           ← 主題・選單・字體・主頁小工具等
//   <內容>/{id}            { data, authorId, visibility, sort }
// ============================================================

service cloud.firestore {
  match /databases/{database}/documents {

    function signedIn() {
      return request.auth != null;
    }

    function ownerData() {
      return get(/databases/$(database)/documents/meta/owner).data;
    }

    function isAdmin() {
      return signedIn()
        && exists(/databases/$(database)/documents/meta/owner)
        && (ownerData().uid == request.auth.uid
            || (ownerData().keys().hasAny(['admins']) && request.auth.uid in ownerData().admins));
    }

    // 內容集合列表 — 不在這裡的名稱沒有任何權限
    function isContent(name) {
      return name in [
        'posts', 'guestbook', 'characters', 'relations', 'gallery', 'roadview',
        'trpg_logs', 'trpg_log_bodies', 'trpg_chars', 'dotori', 'playlog', 'rp_rooms', 'threads',
        'diary', 'memos', 'commissions', 'applicants', 'moods', 'comments', 'qa_answers', 'rp_messages',
        'notifications'
      ];
    }

    // ── 指定擁有者（管理員）— 尚未設定時只能執行一次 ──────────────
    match /meta/owner {
      allow read: if true;
      allow create: if signedIn() && !exists(/databases/$(database)/documents/meta/owner);
      allow update, delete: if isAdmin();
    }

    // ── 會員個人資料 ─────────────────────────────────────────────
    match /profiles/{uid} {
      allow read: if true;
      allow create, update: if signedIn() && (request.auth.uid == uid || isAdmin());
      allow delete: if isAdmin();
    }

    // ── 網站設定（公開讀取・管理員寫入）────────────────────
    match /settings/{key} {
      allow read: if true;
      allow write: if isAdmin();
    }

    // ── 內容 ─────────────────────────────────────────────────
    match /{coll}/{docId} {
      // 讀取：完全公開 / 會員公開（登入）/ 自己撰寫的內容 / 管理員
      allow read: if isContent(coll) && (
        resource.data.visibility == 'public'
        || (resource.data.visibility == 'member' && signedIn())
        || (signedIn() && resource.data.authorId == request.auth.uid)
        || isAdmin()
      );

      // 寫入：登入會員 — 訪客留言・評論允許未登入訪客留下（暱稱＋密碼方式）
      // notifications：訪客評論・留言需要能向管理員留下通知（v2.0）—
      // 行擁有者（authorId）是接收通知的人，因此讀取・修改・刪除只有接收者・管理員可以（如下方共用規則）
      allow create: if isContent(coll) && (signedIn() || coll in ['guestbook', 'comments', 'notifications']);

      // 修改・刪除：作者本人・獲得編輯權限的會員・管理員
      // 評論會與文章分開儲存（v2.0），因此留下評論時不需要修改文章 —
      // 過去評論是儲存在文章裡，因此一般會員對管理員的文章留言時會被此規則擋住。
      // 訪客評論（未登入時留下的內容）的 authorId 為空，無法確認本人，
      // 因此只能由管理員刪除 — 與訪客留言相同的規則。
      // editorIds：對角色取得「包含編輯」權限的會員（v2.0）。grants 是物件陣列，
      // 無法在規則中逐一檢查，因此儲存時只取出會員 id，另外保存成扁平陣列來檢查。
      allow update, delete: if isContent(coll)
        && signedIn()
        && (resource.data.authorId == request.auth.uid
            || isAdmin()
            || (resource.data.keys().hasAny(['editorIds'])
                && request.auth.uid in resource.data.editorIds));
    }
  }
}
`;

export const STORAGE_RULES = `rules_version = '2';

// ============================================================
// O.HOME Storage 安全性規則（圖片・檔案）
// Firebase 控制台 → Storage → 規則，貼上後按［發布］.
//   · 讀取公開（訪客需要能看到圖片）
//   · 上傳・刪除僅限登入會員
//   · 阻擋單次超過 20MB 的上傳
// ============================================================

service firebase.storage {
  match /b/{bucket}/o {
    match /ohome/{allPaths=**} {
      allow read: if true;
      allow write: if request.auth != null
        && request.resource.size < 20 * 1024 * 1024;
      allow delete: if request.auth != null;
    }
  }
}
`;