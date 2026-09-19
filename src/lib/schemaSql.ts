'use client';
// 安裝畫面中複製使用的 Schema SQL — 原始來源：supabase/schema.sql
// （修改原始檔後，這個檔案也要一起更新）

export const SCHEMA_SQL = `-- ============================================================
-- O.HOME 伺服器 Schema（公開首頁用）
-- Supabase → SQL Editor 中整段貼上後按 [Run]。
-- 執行多次也安全（已存在的會跳過）。
-- ============================================================

-- ── 1. 會員個人資料 ─────────────────────────────────────────
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null,
  role text not null default 'member' check (role in ('admin', 'member')),
  avatar_url text,
  avatar_color text,
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

-- ── 2. 註冊碼（邀請碼方式）──────────────────────────────────
create table if not exists public.invite_codes (
  code text primary key,
  created_at timestamptz not null default now(),
  used_by uuid references auth.users(id),
  used_at timestamptz
);

-- ── 3. 網站設定（主題・字型・選單・主頁 Widget・留言板設定等）──
create table if not exists public.site_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- ── 4. 管理員判定函式 ────────────────────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
$$;

-- ── 5. 註冊時自動建立個人資料（第一位註冊者 = 管理員）───────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare existing int;
begin
  select count(*) into existing from public.profiles;
  insert into public.profiles (id, nickname, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nickname', split_part(new.email, '@', 1)),
    case when existing = 0 then 'admin' else 'member' end
  );
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 6. 內容資料表 21 種 ─────────────────────────────────────
-- 一個項目 = 一列資料（以資料列為單位的權限・即時同步）。項目的詳細欄位放在 data(jsonb) 中，
-- 只有用於權限・排序・篩選的值才另外抽出成獨立欄位。
do $$
declare t text;
declare content_tables text[] := array[
  'posts',        -- 留言板文章
  'guestbook',    -- 訪客留言
  'characters',   -- 角色
  'relations',    -- 自設關係
  'gallery',      -- 圖片備份（圖庫）
  'roadview',     -- 載入紀錄
  'trpg_logs',        -- TRPG 日誌（列表文件 — 不包含本文）
  'trpg_log_bodies',  -- TRPG 日誌本文（v2.0，與列表分開儲存 — 用於保護僅自己可見日誌的本文）
  'trpg_chars',   -- TRPG 角色
  'dotori',       -- 橡果
  'playlog',      -- 遊玩紀錄
  'rp_rooms',     -- 角色扮演房間
  'threads',      -- 感想串
  'diary',        -- 日記
  'memos',        -- 貼紙備忘錄
  'commissions',  -- 委託
  'applicants',   -- 申請者
  'moods',        -- 心情列表
  'comments',     -- 留言（v2.0 — 不放在文章內，而是獨立資料列。讓留言不需要修改文章就能新增）
  'qa_answers',   -- 自設關係問答答案（v2.0 — 基於相同原因，不放在自設關係內，而是獨立資料列）
  'rp_messages',  -- 角色扮演發言（v2.0 — 基於相同原因，不放在房間內，而是獨立資料列）
  'notifications' -- 通知（v2.0 — 原本儲存在裝置端，改為伺服器儲存：透過接收者帳號，可在任何裝置取得）
];
begin
  foreach t in array content_tables loop
    execute format($f$
      create table if not exists public.%I (
        id          text primary key,
        data        jsonb not null default '{}'::jsonb,
        author_id   uuid references auth.users(id) on delete set null,
        visibility  text not null default 'public',
        sort        double precision not null default 0,
        created_at  timestamptz not null default now(),
        updated_at  timestamptz not null default now()
      )$f$, t);

    -- 取得編輯權限的會員（v2.0）— 角色 grants 中「包含編輯」的對象。也會套用到已建立的資料表
    execute format($f$
      alter table public.%I add column if not exists editor_ids text[] not null default '{}'::text[]
    $f$, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('create index if not exists %I on public.%I (sort)', t || '_sort_idx', t);

    -- 讀取：公開／會員公開（登入）／本人文章／管理員
    execute format('drop policy if exists "read" on public.%I', t);
    execute format($p$
      create policy "read" on public.%I for select using (
        visibility = 'public'
        or (visibility = 'member' and auth.uid() is not null)
        or author_id = auth.uid()
        or public.is_admin()
      )$p$, t);

    -- 寫入：登入會員（訪客留言簿會在下面覆寫為允許未登入者）
    execute format('drop policy if exists "insert" on public.%I', t);
    execute format($p$
      create policy "insert" on public.%I for insert to authenticated with check (true)$p$, t);

    -- 修改・刪除：本人・取得編輯權限的會員（editor_ids）・管理員
    execute format('drop policy if exists "update" on public.%I', t);
    execute format($p$
      create policy "update" on public.%I for update to authenticated
        using (author_id = auth.uid() or public.is_admin()
               or auth.uid()::text = any(editor_ids))$p$, t);

    execute format('drop policy if exists "delete" on public.%I', t);
    execute format($p$
      create policy "delete" on public.%I for delete to authenticated
        using (author_id = auth.uid() or public.is_admin()
               or auth.uid()::text = any(editor_ids))$p$, t);
  end loop;
end $$;

-- 訪客留言・留言板留言允許未登入訪客留下（暱稱＋密碼方式）
drop policy if exists "insert" on public.guestbook;
create policy "insert" on public.guestbook for insert with check (true);

-- 留言也允許未登入訪客留下（暱稱＋密碼方式 — 與訪客留言相同，v2.0）。
-- 修改・刪除沿用上述共通政策：作者本人或管理員。
drop policy if exists "insert" on public.comments;
create policy "insert" on public.comments for insert with check (true);

-- 通知也允許未登入訪客建立（v2.0）— 因為訪客留言・訪客留言簿需要向管理員發送通知。
-- 資料列的擁有者（author_id）是接收者，因此讀取・修改・刪除僅限接收者與管理員（沿用共通政策）。
drop policy if exists "insert" on public.notifications;
create policy "insert" on public.notifications for insert with check (true);

-- ── 7. 網站設定權限（公開讀取・管理員寫入）─────────────────
alter table public.profiles enable row level security;
alter table public.invite_codes enable row level security;
alter table public.site_settings enable row level security;

drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles for select using (true);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated
  using (auth.uid() = id or public.is_admin());
-- 個人資料儲存使用 upsert（INSERT 路徑），如果沒有 INSERT 政策，即使資料列已存在也會被拒絕
-- （「new row violates row-level security policy」— v2.0 分支回報）。允許建立自己的資料列。
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert to authenticated
  with check (auth.uid() = id);
drop policy if exists "profiles_delete_admin" on public.profiles;
create policy "profiles_delete_admin" on public.profiles for delete to authenticated
  using (public.is_admin());

drop policy if exists "invite_select" on public.invite_codes;
create policy "invite_select" on public.invite_codes for select using (true);
drop policy if exists "invite_write" on public.invite_codes;
create policy "invite_write" on public.invite_codes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists "invite_use" on public.invite_codes;
create policy "invite_use" on public.invite_codes for update using (used_by is null);

drop policy if exists "settings_select" on public.site_settings;
create policy "settings_select" on public.site_settings for select using (true);
drop policy if exists "settings_write" on public.site_settings;
create policy "settings_write" on public.site_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- ── 8. 圖片儲存空間（Storage Bucket）────────────────────────
insert into storage.buckets (id, name, public)
values ('ohome', 'ohome', true)
on conflict (id) do nothing;

drop policy if exists "ohome_read" on storage.objects;
create policy "ohome_read" on storage.objects for select using (bucket_id = 'ohome');
drop policy if exists "ohome_write" on storage.objects;
create policy "ohome_write" on storage.objects for insert to authenticated with check (bucket_id = 'ohome');
drop policy if exists "ohome_update" on storage.objects;
create policy "ohome_update" on storage.objects for update to authenticated using (bucket_id = 'ohome');
drop policy if exists "ohome_delete" on storage.objects;
create policy "ohome_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'ohome' and (owner = auth.uid() or public.is_admin()));

-- ── 9. 即時同步（角色扮演・問答互動）────────────────────────
do $$
declare t text;
begin
  -- 因為發言・答案・留言已各自拆成獨立資料列（v2.0），即時同步也必須監看這些資料表
  foreach t in array array['rp_rooms', 'rp_messages', 'relations', 'qa_answers', 'posts', 'comments', 'guestbook', 'notifications'] loop
    begin
      execute format('alter publication supabase_realtime add table public.%I', t);
    exception when others then null;  -- 已經加入時忽略
    end;
  end loop;
end $$;

-- ── 10. 更新 Schema 快取（重要）─────────────────────────────
-- PostgREST（= REST API）會快取資料表・欄位列表。即使透過 SQL 新增欄位，
-- 在快取更新之前 API 也不知道該欄位 —
--   Could not find the 'editor_ids' column of 'posts' in the schema cache (PGRST204)
-- 實際上更新後會顯示「無法儲存文章」。最後讓它重新讀取 Schema 快取。
notify pgrst, 'reload schema';

-- ── 完成 ─────────────────────────────────────────────────────
-- 執行此腳本後，在首頁的安裝畫面按下［確認連線］即可驗證。
-- 第一個註冊的帳號會自動成為管理員。
`;