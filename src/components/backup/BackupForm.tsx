'use client';
// 圖片備份撰寫／編輯共用表單（4.11）— 標題／類型／圖片多重上傳（原始・最佳化・裁切・⠿順序）／說明／設定／摺疊
// 編輯模式：既有圖片（ref）維持不變・可以重新排序・刪除，也可以新增檔案
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useLocalList, newId, FoldType } from '@/lib/postStore';
import { useSectionParam, secStamp, MAIN_SEC, useSectionTitle } from '@/lib/sectionStore';
import { useMenuSettings, canGalleryWrite } from '@/lib/menuStore';
import { BackupPost, BACKUP_SEED } from '@/lib/galleryStore';
import { useBoardSettings, DEFAULT_GALLERY_CATS, galleryCatsOf } from '@/lib/boardStore';
import { useConfirmDelete } from '@/components/ui/Modal';
import { Visibility } from '@/lib/charStore';
import { KInput, KSelect, KRadio, KCheck, KDate } from '@/components/ui/Kit';
import { RichEditor } from '@/components/ui/RichEditor';
import { DragList } from '@/components/ui/DragList';
import { CropEditor, CropValue } from '@/components/ui/CropEditor';
import { putBlob, useBlobUrl } from '@/lib/blobStore';
import { useToast } from '@/components/ui/Toast';
import { EditableDesc, PageTitle } from '@/components/ui/PageText';

interface UpFile {
  id: string; name: string; size?: number;
  url?: string; file?: File;   // 新增的檔案
  ref?: string;                // 已儲存的圖片（編輯模式）
  original: boolean; crop?: CropValue;
}

const fmtSize = (b?: number) => b == null ? '' : b >= 1048576 ? `${(b / 1048576).toFixed(1)}MB` : `${Math.round(b / 1024)}KB`;

function FilePreview({ f }: { f: UpFile }) {
  const loaded = useBlobUrl(f.ref);
  const src = f.url ?? loaded;
  if (!src) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={f.name} />;
}

/** 裁切編輯器來源 — 新檔案使用 objectURL，已儲存版本則載入 blob */
function CropModal({ f, onClose, onApply }: { f: UpFile; onClose: () => void; onApply: (c: CropValue) => void }) {
  const loaded = useBlobUrl(f.ref);
  const src = f.url ?? loaded;
  if (!src) return null;
  return <CropEditor open src={src} aspect="4:3" initial={f.crop} onClose={onClose} onApply={onApply} />;
}

export function BackupForm({ initial }: { initial: BackupPost | null }) {
  const router = useRouter();
  const { user, isAdmin } = useAuth();
  // 圖庫撰寫權限（v2.0 使用者要求）— 在下面的新增文章守門處確認
  const [menuSet, , menuLoaded] = useMenuSettings();
  const toast = useToast();
  const [posts, setPosts] = useLocalList<BackupPost>('ohome.backup.v1', BACKUP_SEED);
  // 從哪個圖庫點進來的（v2.0）— 新文章會加入該列表，完成後也會返回該列表
  const sec = useSectionParam('gallery');
  const isNew = !initial;
  // 大標題 — 如果是額外圖庫則使用該名稱（選單標題・名稱優先），點擊後返回該列表（v2.0 使用者回報）。
  // 編輯網址沒有 ?s=，所以從正在編輯的文章所屬（secId）讀取
  const tt = useSectionTitle('gallery', initial ? (initial.secId ?? MAIN_SEC) : sec.id, isNew ? 'WRITE' : 'EDIT');
  const [title, setTitle] = useState(initial?.title ?? '');
  const [type, setType] = useState<'log' | 'single' | 'vlist'>(initial?.type ?? 'log');
  const [files, setFiles] = useState<UpFile[]>(() =>
    (initial?.images ?? []).map((ref, i) => ({
      id: newId(), name: `圖片 ${i + 1}`, ref, original: true,
      crop: i === 0 ? initial?.thumbCrop : undefined,
    })));
  const [desc, setDesc] = useState(initial?.desc ?? '');
  const del = useConfirmDelete();   // 移除圖片也無法復原，因此會先經過警告確認
  // 圖庫分類標籤 — 由環境設定 > 留言板管理中管理（v2.0）
  const { st: boardSet } = useBoardSettings();
  /* **編輯中時，以該文章所屬的位置為基準**（v2.0 使用者發現 — 分支版本回報）。
     編輯網址沒有 `?s=`，所以只看網址時永遠會被當成預設區段。這樣分類列表就會
     變成預設區段的內容，原本選擇的分類不在列表中時，就會被解開成第一個項目。 */
  const secId = initial ? (initial.secId ?? MAIN_SEC) : sec.id;
  // 每個圖庫都有不同的分類標籤（v2.0 使用者要求）— 使用目前查看中的圖庫
  const secCats = galleryCatsOf(boardSet, secId);
  const galleryCats = secCats.length ? secCats : DEFAULT_GALLERY_CATS;
  const [category, setCategory] = useState(initial?.category ?? '');
  // 標籤（v2.0 使用者要求）— 以逗號分隔輸入，儲存時轉為陣列
  const [tagsText, setTagsText] = useState((initial?.tags ?? []).join(', '));
  const parseTags = (v: string) =>
    [...new Set(v.split(',').map(t => t.trim().replace(/^#/, '')).filter(Boolean))];
  // 列表載入後，將第一個分類標籤設為預設值（登錄畫面）
  useEffect(() => {
    if (!category && galleryCats[0]) setCategory(galleryCats[0].label);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [galleryCats.length]);
  const [madeDate, setMadeDate] = useState(initial?.madeDate ?? '');
  const [visibility, setVisibility] = useState<Visibility>(initial?.visibility ?? 'public');
  const [foldType, setFoldType] = useState<FoldType | 'none'>(initial?.fold?.type ?? 'none');
  const [foldLabel, setFoldLabel] = useState(initial?.fold?.label ?? '');
  const [cropFor, setCropFor] = useState<UpFile | null>(null);

  if (!user) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>登入後才能撰寫文章</p></div>
      </section>
    );
  }

  /* 圖庫撰寫權限（v2.0 使用者要求）— 使用與 WRITE 按鈕相同的判定，連直接輸入網址進入也會阻擋。
     僅限新增文章 — 已經撰寫的自己的文章，其編輯・刪除仍與之前一樣由本人（以及管理員）負責。
     在讀取設定之前不繪製表單 — 否則表單會短暫出現在原本沒有權限的人面前 */
  if (isNew && !menuLoaded) return <section className="page" />;
  if (isNew && !canGalleryWrite(menuSet, sec.id, { loggedIn: true, isAdmin, id: user.id })) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><p>這是只有獲得允許的會員才能撰寫文章的圖庫</p></div>
      </section>
    );
  }

  const addFiles = (list: FileList | null) => {
    if (!list || list.length === 0) return;
    // input.files 是會變動的 FileList — Handler 結束後 value 被初始化就會清空，因此
    // 必須現在立即複製，而不是放在狀態更新器（之後才執行）裡（修正圖片上傳交替被吃掉的 Bug）
    const items: UpFile[] = Array.from(list).map(x => ({
      id: newId(), name: x.name, size: x.size, url: URL.createObjectURL(x), file: x, original: true,
    }));
    setFiles(f => [...f, ...items]);
  };

  const post = async () => {
    if (!title.trim()) { toast('請輸入標題'); return; }
    // 實際儲存圖片（IndexedDB）— 保留既有 ref，只儲存新檔案
    const imageIds = await Promise.all(files.map(f => (f.file ? putBlob(f.file) : Promise.resolve(f.ref!))));
    if (isNew) {
      const p: BackupPost = {
        id: newId(), title: title.trim(), type,
        images: imageIds, phList: files.length ? [] : ['cool'],
        thumbCrop: files[0]?.crop, // 代表圖片裁切（6.1）
        desc, category, tags: parseTags(tagsText), madeDate: madeDate || undefined,
        date: new Date().toISOString(), author: user.nickname, authorId: user.id,
        visibility,
        fold: foldType === 'none' ? null : { type: foldType, label: foldType === 'custom' ? foldLabel : undefined },
      };
      setPosts([{ ...p, ...secStamp(sec.id) }, ...posts]);
      toast('已登錄 — 圖片會實際儲存在此瀏覽器中');
      router.push(`/gallery/${p.id}`);
    } else {
      setPosts(posts.map(x => x.id === initial.id ? {
        ...x, title: title.trim(), type,
        images: imageIds, phList: files.length ? [] : x.phList,
        thumbCrop: files[0]?.crop,
        desc, category, tags: parseTags(tagsText), madeDate: madeDate || undefined, visibility,
        fold: foldType === 'none' ? null : { type: foldType, label: foldType === 'custom' ? foldLabel : undefined },
      } : x));
      toast('已儲存');
      router.push(`/gallery/${initial.id}`);
    }
  };

  return (
    <section className="page">
      <div className="page-head"><PageTitle href={tt.href}>{tt.title}</PageTitle><EditableDesc k={isNew ? 'backup-write-desc' : 'backup-edit-desc'} def={isNew ? '撰寫圖片備份文章' : '編輯圖片備份文章'} /></div>
      <div className="write-grid">
        {/* 左：正文 */}
        <div className="panel" style={{ padding: 24 }}>
          <div className="form-row">
            <label className="k-label" style={{ width: 60 }}>標題</label>
            <KInput value={title} onChange={e => setTitle(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div className="form-row">
            <label className="k-label" style={{ width: 60 }}>類型</label>
            {/* 行動版隱藏說明（.rd-desc）以維持單行 — 不應換成兩行（v1.9 使用者確認） */}
            <div style={{ display: 'flex', gap: 18, alignItems: 'center' }}>
              <KRadio name="wtype" value="log" current={type} onChange={v => setType(v as 'log')}
                label={<span>日誌 <span className="rd-desc">— 像網路漫畫一樣垂直捲動</span></span>} />
              <KRadio name="wtype" value="single" current={type} onChange={v => setType(v as 'single')}
                label={<span>單張 <span className="rd-desc">— 大圖片 + 左右翻頁</span></span>} />
              <KRadio name="wtype" value="vlist" current={type} onChange={v => setType(v as 'vlist')}
                label={<span>單張（垂直） <span className="rd-desc">— 圖片之間保留間距並垂直排列</span></span>} />
            </div>
          </div>
          <label className="k-label">圖片</label>
          <div className="upzone" onClick={() => document.getElementById('bkFiles')?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); addFiles(e.dataTransfer.files); }}>
            <b style={{ display: 'block', marginBottom: 3 }}>
              {files.length === 0 ? '將圖片拖放到這裡或點擊選擇' : '＋ ADD IMAGE'}
            </b>
            可選擇多張圖片 · ⠿ 拖曳調整順序
          </div>
          <input id="bkFiles" type="file" accept="image/*" multiple style={{ display: 'none' }}
            onChange={e => { addFiles(e.target.files); e.target.value = ''; }} />
          {files.length > 0 && (
            <div className="upfile-count">✓ {files.length} 張 — 將依照下方順序發布</div>
          )}
          <DragList
            items={files}
            keyOf={f => f.id}
            onReorder={setFiles}
            render={(f, i) => (
              <div className="upfile-row" style={{ width: '100%' }}>
                <span className="drag-h">⠿</span>
                <span className="mw-no">{i + 1}</span>
                <div className="pv"><FilePreview f={f} /></div>
                <div className="nm">
                  <b>{f.name}</b>
                  <small>{f.ref && !f.file ? '已儲存的圖片' : fmtSize(f.size)}{f.crop ? ' · 已指定縮圖' : ''}</small>
                </div>
                {/* 原始／最佳化 — 原始版本永遠保留在伺服器，選擇提供給查看者的版本（6.1） */}
                <div className="mini-seg">
                  <button className={f.original ? 'on' : ''}
                    onClick={() => setFiles(l => l.map(x => x.id === f.id ? { ...x, original: true } : x))}>原始</button>
                  <button className={!f.original ? 'on' : ''}
                    onClick={() => setFiles(l => l.map(x => x.id === f.id ? { ...x, original: false } : x))}>最佳化</button>
                </div>
                <button className="btn btn-ghost" style={{ padding: '5px 10px', fontSize: 10, whiteSpace: 'nowrap' }}
                  onClick={() => setCropFor(f)}>✂ 縮圖</button>
                <span className="fx" data-tip="移除"
                  onClick={() => del.ask('要將這張圖片從列表中移除嗎？',
                    () => setFiles(l => l.filter(x => x.id !== f.id)), f.name)}>✕</span>
              </div>
            )}
          />
          <div style={{ marginTop: 14 }}>
            <label className="k-label">說明</label>
            <RichEditor value={desc} onChange={setDesc} placeholder='請撰寫作品說明（可選）' />
          </div>
        </div>

        {/* 右：設定 */}
        <div>
          <div className="panel widget" style={{ marginBottom: 14 }}>
            <h4>設定</h4>
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>分類標籤</label>
              {/* 分類標籤列表由環境設定 > 留言板管理中管理（v2.0 — 以前是直接寫在程式碼裡） */}
              <KSelect minWidth={120} value={category} onChange={setCategory}
                options={galleryCats.map(c => ({ value: c.label, label: c.label }))} />
            </div>
            {/* 標籤（v2.0 使用者要求）— 會列在列表・卡片中，也可以被搜尋 */}
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>標籤</label>
              <KInput value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="以逗號分隔" style={{ flex: 1 }} />
            </div>
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>製作日期（可選）</label>
              <KDate value={madeDate} onChange={setMadeDate} style={{ fontSize: 12, flex: 1 }} />
            </div>
            <div className="form-row">
              <label className="k-label" style={{ width: 70 }}>公開範圍</label>
              <KSelect minWidth={120} value={visibility} onChange={v => setVisibility(v as Visibility)}
                options={[
                  { value: 'public', label: '完全公開' },
                  { value: 'member', label: '會員公開' },
                  { value: 'private', label: '僅自己可見' },
                ]} />
            </div>
          </div>
          <div className="panel widget" style={{ marginBottom: 14 }}>
            <h4>摺疊</h4>
            <div style={{ display: 'grid', gap: 9 }}>
              <KCheck label="摺疊劇透" checked={foldType === 'spoiler'} onChange={v => setFoldType(v ? 'spoiler' : 'none')} />
              <KCheck label="摺疊限制級注意內容" checked={foldType === 'adult'} onChange={v => setFoldType(v ? 'adult' : 'none')} />
              <KCheck label="自訂文字" checked={foldType === 'custom'} onChange={v => setFoldType(v ? 'custom' : 'none')} />
              {foldType === 'custom' && <KInput placeholder="摺疊文字" value={foldLabel} onChange={e => setFoldLabel(e.target.value)} />}
            </div>
          </div>
          <div className="form-actions">
            <button className="btn btn-onbk"
              onClick={() => router.push(isNew ? tt.href : `/gallery/${initial.id}`)}>CANCEL</button>
            <button className="btn btn-accent" onClick={post}>
              {isNew ? 'POST' : 'SAVE'}
            </button>
          </div>
        </div>
      </div>

      {del.element}
      {cropFor && (
        <CropModal f={cropFor}
          onClose={() => setCropFor(null)}
          onApply={c => {
            setFiles(l => l.map(x => x.id === cropFor.id ? { ...x, crop: c } : x));
            setCropFor(null);
            toast('縮圖區域已儲存（保留原始圖片）');
          }} />
      )}
    </section>
  );
}