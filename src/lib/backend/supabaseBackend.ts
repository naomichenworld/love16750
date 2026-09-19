'use client';
// Supabase 後端 — Postgres 資料表（資料列）+ Auth + Storage + Realtime
// Schema・權限：supabase/schema.sql
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  Backend, BackendCheck, BackendConfig, BackendUser, ListItem, diffList, metaOf,
} from './types';
import { visFloorOf } from '../visFloor';

const BUCKET = 'ohome';
const PROBE = ['profiles', 'site_settings', 'posts', 'characters'];

export async function createSupabaseBackend(
  cfg: Extract<BackendConfig, { kind: 'supabase' }>,
): Promise<Backend> {
  const { createBrowserClient } = await import('@supabase/ssr');
  const sb: SupabaseClient = createBrowserClient(cfg.url.replace(/\/$/, ''), cfg.anonKey);

  const toUser = async (u: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null | undefined): Promise<BackendUser | null> => {
    if (!u) return null;
    const { data: prof } = await sb.from('profiles')
      .select('nickname, role, avatar_url, avatar_color').eq('id', u.id).maybeSingle();
    return {
      id: u.id,
      nickname: prof?.nickname ?? (u.user_metadata?.nickname as string) ?? u.email ?? 'user',
      role: (prof?.role as 'admin' | 'member') ?? 'member',
      email: u.email,
      avatarUrl: prof?.avatar_url ?? undefined,
      avatarColor: prof?.avatar_color ?? undefined,
    };
  };

  return {
    kind: 'supabase',

    async check(): Promise<BackendCheck> {
      const fail = (p: Partial<BackendCheck>): BackendCheck =>
        ({ ok: false, reachable: false, schema: false, hasAdmin: false, message: '', ...p });
      let reachable = false;
      try {
        const { error } = await sb.from('profiles').select('id').limit(1);
        if (error) {
          if (error.code === '42P01' || /does not exist/i.test(error.message)) reachable = true;
          else if (/JWT|api key|Invalid/i.test(error.message)) {
            return fail({ message: 'anon key 不正確 — 請重新從 Supabase → Settings → API 複製 anon public key。' });
          } else if (/fetch|network|Load failed/i.test(error.message)) {
            return fail({ message: '無法連線至專案 — 請確認 Project URL 是否正確，以及專案是否處於暫停（Paused）狀態。' });
          } else return fail({ message: `連線失敗 — ${error.message}` });
        } else reachable = true;
      } catch {
        return fail({ message: '無法連線至專案 — 請確認 URL。' });
      }

      const missing: string[] = [];
      for (const t of PROBE) {
        const { error } = await sb.from(t).select('*', { head: true, count: 'exact' }).limit(1);
        if (error && (error.code === '42P01' || /does not exist/i.test(error.message))) missing.push(t);
      }
      if (missing.length) {
        return fail({ reachable, message: `尚未建立 Schema（${missing.join(', ')}）— 請在 Supabase 的 SQL Editor 中執行下方 SQL 一次。` });
      }

      const { count } = await sb.from('profiles').select('id', { head: true, count: 'exact' }).eq('role', 'admin');
      const hasAdmin = (count ?? 0) > 0;
      return {
        ok: true, reachable, schema: true, hasAdmin,
        message: hasAdmin ? '連線完成 — 已經有管理員帳號。請使用該帳號登入。'
          : '連線完成 — 現在可以建立管理員帳號。第一個註冊的帳號會成為管理員。',
      };
    },

    async currentUser() {
      const { data } = await sb.auth.getUser();
      return toUser(data.user);
    },

    onAuthChange(cb) {
      const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
        void toUser(session?.user).then(cb);
      });
      return () => sub.subscription.unsubscribe();
    },

    async signIn(id, password) {
      const { error } = await sb.auth.signInWithPassword({ email: id, password });
      return error ? { ok: false, error: error.message } : { ok: true };
    },

    async signUp(id, password, nickname) {
      const { error } = await sb.auth.signUp({ email: id, password, options: { data: { nickname } } });
      return error ? { ok: false, error: error.message } : { ok: true };
    },

    async signOut() { await sb.auth.signOut(); },

    async resetPassword(email) {
      const { error } = await sb.auth.resetPasswordForEmail(email);
      return error ? { ok: false, error: error.message } : { ok: true };
    },

    async updateProfile(patch) {
      const { data } = await sb.auth.getUser();
      if (!data.user) return { ok: false, error: '需要先登入。' };
      const row: Record<string, unknown> = { id: data.user.id };
      if (patch.nickname !== undefined) row.nickname = patch.nickname;
      if (patch.avatarUrl !== undefined) row.avatar_url = patch.avatarUrl;
      if (patch.avatarColor !== undefined) row.avatar_color = patch.avatarColor;
      const { error } = await sb.from('profiles').upsert(row, { onConflict: 'id' });
      return error ? { ok: false, error: error.message } : { ok: true };
    },

    // Supabase 的 Schema Trigger 會將第一個註冊者設為管理員 — 不需要額外操作
    async claimOwner() { return { ok: true }; },

    async listMembers() {
      // avatar_url 也一併取得 — 避免圖片整理時將個人資料照片視為「未使用的檔案」而刪除（v2.0 使用者回報）
      const { data, error } = await sb.from('profiles').select('id, nickname, role, avatar_url').order('created_at');
      if (error) throw error;
      return (data ?? []).map(r => {
        const p = r as { id: string; nickname: string; role: string; avatar_url?: string | null };
        return {
          id: p.id, nickname: p.nickname, role: (p.role as 'admin' | 'member') ?? 'member',
          avatarUrl: p.avatar_url ?? undefined,
        };
      });
    },

    async fetchList<T extends ListItem>(coll: string): Promise<T[]> {
      const { data, error } = await sb.from(coll).select('id, data, sort').order('sort', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(r => {
        const row = r as { id: string; data: Record<string, unknown> };
        return { ...(row.data ?? {}), id: row.id } as T;
      });
    },

    async syncList<T extends ListItem>(coll: string, prev: T[], next: T[], uid: string | null) {
      const { inserts, updates, moves, deletes } = diffList(prev, next);
      const toRow = ({ item, sort }: { item: T; sort: number }) => {
        const { authorId, visibility, editorIds } = metaOf(item, uid, visFloorOf(coll, item));
        return { id: item.id, data: item, author_id: authorId, visibility, editor_ids: editorIds, sort };
      };
      // 一次請求全部送出時，如果有多筆大型內容（例如 TRPG 日誌），請求會過大
      // （v2.0 — 預防與 Firestore 相同的問題）。大約估算大小，在 4MB 左右分批送出。
      const bySize = (rows: { item: T; sort: number }[]) => {
        const parts: { item: T; sort: number }[][] = [];
        let cur: { item: T; sort: number }[] = [];
        let bytes = 0;
        for (const r of rows) {
          const size = JSON.stringify(r.item).length + 200;
          if (cur.length && bytes + size > 4_000_000) { parts.push(cur); cur = []; bytes = 0; }
          cur.push(r); bytes += size;
        }
        if (cur.length) parts.push(cur);
        return parts;
      };
      for (const part of bySize(inserts)) {
        const { error } = await sb.from(coll).insert(part.map(toRow));
        if (error) throw error;
      }
      for (const part of bySize(updates)) {
        const { error } = await sb.from(coll).upsert(part.map(toRow), { onConflict: 'id' });
        if (error) throw error;
      }
      // 只有位置變更的項目 — 只修改 sort，避免重新傳送整個內容（參考 diffList 註解）。
      // 由於每筆資料的值都不同，無法合併成一個語句 — 每次少量分批並行送出（資料列本身非常小）
      for (let i = 0; i < moves.length; i += 25) {
        const errs = await Promise.all(moves.slice(i, i + 25).map(m =>
          sb.from(coll).update({ sort: m.sort }).eq('id', m.id).then(r => r.error)));
        const bad = errs.find(Boolean);
        if (bad) throw bad;
      }
      if (deletes.length) {
        const { error } = await sb.from(coll).delete().in('id', deletes);
        if (error) throw error;
      }
    },

    /* 重新計算並覆寫公開範圍・編輯權限列表（v2.0）— 將相同值的項目分組後一次 UPDATE。
       不重新寫入 data，因此不會影響內容・順序。
       editor_ids 也會一併寫入（使用者回報 — 更新前給予的編輯權限沒有以扁平列表存在於資料列中，
       即使套用最新規則，該會員的儲存仍會持續被拒絕） */
    async refreshVis<T extends ListItem>(coll: string, items: T[], uid: string | null): Promise<number> {
      // 將值相同的項目分組 — 有編輯權限的項目較少，因此通常幾乎維持原本的分組
      const byKey = new Map<string, { vis: string; editorIds: string[]; ids: string[] }>();
      items.forEach(it => {
        const { visibility, editorIds } = metaOf(it, uid, visFloorOf(coll, it));
        const key = visibility + '|' + JSON.stringify(editorIds);
        const g = byKey.get(key) ?? { vis: visibility, editorIds, ids: [] };
        g.ids.push(it.id);
        byKey.set(key, g);
      });
      let n = 0;
      for (const { vis, editorIds, ids } of byKey.values()) {
        for (let i = 0; i < ids.length; i += 200) {
          const part = ids.slice(i, i + 200);
          const { error } = await sb.from(coll).update({ visibility: vis, editor_ids: editorIds }).in('id', part);
          if (error) throw error;
          n += part.length;
        }
      }
      return n;
    },

    subscribe(coll, onChange) {
      const ch = sb.channel(`ohome:${coll}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: coll }, () => onChange())
        .subscribe();
      return () => { void sb.removeChannel(ch); };
    },

    async fetchSetting<T>(key: string) {
      const { data, error } = await sb.from('site_settings').select('value').eq('key', key).maybeSingle();
      if (error) throw error;
      return (data?.value ?? null) as T | null;
    },

    async saveSetting(key, value) {
      const { error } = await sb.from('site_settings')
        .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      if (error) throw error;
    },

    async fetchAllSettings() {
      const { data, error } = await sb.from('site_settings').select('key, value');
      if (error) throw error;
      const out: Record<string, unknown> = {};
      (data ?? []).forEach(r => { out[(r as { key: string }).key] = (r as { value: unknown }).value; });
      return out;
    },

    async uploadFile(blob, ext) {
      const path = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from(BUCKET)
        // 路徑每次上傳都唯一 — 長時間快取，而不是預設的 1 小時（與 firebaseBackend 使用相同策略）
        .upload(path, blob, {
          contentType: blob.type || 'application/octet-stream',
          cacheControl: '31536000',
          upsert: false,
        });
      if (error) throw error;
      return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },

    async listFiles() {
      const out: { ref: string; size: number }[] = [];
      const PAGE = 100;
      for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await sb.storage.from(BUCKET).list('', { limit: PAGE, offset });
        if (error) throw error;
        const rows = data ?? [];
        rows.forEach(f => out.push({
          ref: sb.storage.from(BUCKET).getPublicUrl(f.name).data.publicUrl,
          size: (f.metadata as { size?: number } | null)?.size ?? 0,
        }));
        if (rows.length < PAGE) break;
      }
      return out;
    },

    async deleteFile(ref) {
      // 儲存的值是公開 URL — 只取出 Bucket 內的檔案名稱並刪除
      const name = decodeURIComponent(ref.split('?')[0].split('/').pop() ?? '');
      if (!name) return;
      const { error } = await sb.storage.from(BUCKET).remove([name]);
      if (error) throw error;
    },

    async deleteMember(id) {
      // 只刪除 profiles 資料列 — 刪除 auth.users 需要 service_role key，公開首頁無法執行
      const { error } = await sb.from('profiles').delete().eq('id', id);
      if (error) throw error;
    },
  };
}