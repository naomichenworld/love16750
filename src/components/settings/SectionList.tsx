'use client';
/**
 * 「將此區段拆成多個」列表 — 每個設定分頁最上方各放一組（v2.0 使用者要求）。
 *
 * 與留言板管理**使用相同的樣式**，不需要重新學習：⠿ 拖曳排序 · 修改名稱 · DELETE · ＋ ADD。
 * 個別區分的只有名稱，分類標籤・心情等詳細設定會共用（使用者已確認），
 * 因此這裡不需要「選擇要編輯哪一個」的列 — 讓分頁維持現在的簡潔樣式。
 */
import React from 'react';
import { DragList } from '@/components/ui/DragList';
import { KInput } from '@/components/ui/Kit';
import { useConfirmDelete } from '@/components/ui/Modal';
import { SectionKind, SECTION_META, SECTION_KINDS, MAIN_SEC, useSections, sectionHref, cleanSlug } from '@/lib/sectionStore';
import { useMenuSettings } from '@/lib/menuStore';

/**
 * 選擇類型，只顯示該列表 — 一次展開 8 種會讓分頁變得無止境地長。
 * 已經建立多個的類型會同時顯示數量，即使不選擇也能看出各類型目前有幾個。
 */
export function SectionsBlock() {
  const { list } = useSections();
  const [kind, setKind] = React.useState<SectionKind>('gallery');
  return (
    <>
      <h3 style={{ marginTop: 20 }}>其他列表也可以建立多個</h3>
      <div className="d">
        圖庫・日記等也可以像留言板一樣建立多個 — 建立後會自動加入選單。
        <b> 不需要重新設定伺服器</b>（內容仍會照原本的方式累積）
      </div>
      <div className="mini-seg" style={{ flexWrap: 'wrap', marginBottom: 4 }}>
        {SECTION_KINDS.map(k => {
          const n = list(k).length;
          return (
            <button key={k} className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>
              {SECTION_META[k].label}{n > 1 ? ` ${n}` : ''}
            </button>
          );
        })}
      </div>
      <SectionList kind={kind} />
    </>
  );
}

export function SectionList({ kind }: { kind: SectionKind }) {
  const { list, setList, add } = useSections();
  const [ms, patchMenu] = useMenuSettings();
  const del = useConfirmDelete();
  const items = list(kind);
  const meta = SECTION_META[kind];

  const patch = (id: string, name: string) => {
    const cur = items.map(s => (s.id === id ? { ...s, name } : s));
    setList(kind, cur);
  };

  /* 網址別名（v2.0 使用者要求）— 像 `?s=fanart` 一樣使用 `?s=fanart`，而不是 `?s=mt9ipt`。
     **所屬關係仍然以 id 儲存，因此文章內容都還在。** 不過選單樹中儲存的是網址字串，
     所以修改別名時，也必須一起修改那個位置，否則選單配置會失效。 */
  const patchSlug = (id: string, raw: string) => {
    const slug = cleanSlug(raw);
    const taken = items.some(s => s.id !== id && (s.slug === slug || s.id === slug));
    if (slug && taken) return;                    // 如果與其他項目重複，就維持原狀
    const before = sectionHref(kind, id);
    setList(kind, items.map(s => (s.id === id ? { ...s, slug: slug || undefined } : s)));
    const after = kind && (id === MAIN_SEC ? before : `${meta.href}?s=${slug || id}`);
    if (before === after) return;
    const swap = (h: string) => (h === before ? after : h);
    patchMenu({
      tree: (ms.tree ?? []).map(g => ({
        ...g,
        ...(g.href ? { href: swap(g.href) } : {}),
        items: g.items.map(it => ({ ...it, href: swap(it.href) })),
      })),
      removedBoards: (ms.removedBoards ?? []).map(swap),
    });
  };

  return (
    <>
      <h3 style={{ marginTop: 20 }}>{meta.label} 列表</h3>
      <div className="d">
        相同類型可以建立多個 — ⠿ 拖曳調整選單順序 · 名稱會直接顯示在上方選單與頁面標題 ·
        下方詳細設定會由所有 {meta.label} 共用
        <br />
        <b>網址</b>只能使用小寫英文字母・數字・連字號，留空時會直接使用內部 id 作為網址 —
        即使修改，文章內容也會保留，使用舊網址進入時也仍然可以開啟。
        <br />
        新建立的項目會放在<b>選單管理的「未配置」</b>中 — 請自行放入想要的上層選單
      </div>
      <DragList items={items} keyOf={s => s.id} onReorder={next => setList(kind, next)}
        render={s => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <KInput value={s.name} onChange={e => patch(s.id, e.target.value)} style={{ width: 130 }} />
              {s.id === MAIN_SEC
                ? <span className="pill">預設</span>
                : (
                  <>
                    <span className="cp-lb">網址</span>
                    <KInput value={s.slug ?? ''} placeholder={s.id}
                      onChange={e => patchSlug(s.id, e.target.value)} style={{ width: 120 }} />
                    <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{sectionHref(kind, s.id)}</small>
                  </>
                )}
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              {s.id !== MAIN_SEC && (
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => del.ask(`${meta.label} 「${s.name}」確定要刪除嗎？`,
                    () => setList(kind, items.filter(x => x.id !== s.id)),
                    '雖然會從選單中消失，但這裡填寫的內容會完整保留（第 3 章原則）。')}>DELETE</button>
              )}
            </div>
          </div>
        )} />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => add(kind)}>＋ ADD {meta.label.toUpperCase()}</button>
      </div>
      {del.element}
      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />
    </>
  );
}
