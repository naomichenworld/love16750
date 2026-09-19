'use client';
// 環境設定 (企劃書第 5 章) — 第 0 階段：「設計」分頁（主題）實際運作。
// 其餘分類會在對應功能里程碑中一併實作。
import React, { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, inviteCode, setInviteCode } from '@/lib/auth';
import { useMembers } from '@/lib/members';
import { useTheme } from '@/lib/ThemeProvider';
import { ThemeVars } from '@/lib/theme';
import { ColorField } from '@/components/ui/ColorField';
import { KStep, KToggle, KInput, LiveInput, KTextarea, KSelect, KCheck, Pager } from '@/components/ui/Kit';
import { DragList } from '@/components/ui/DragList';
import { useMainStore, WidgetConf, WIDGET_META, MULTI_TYPES, widgetLabel } from '@/lib/mainStore';
import { useConfirmDelete, ConfirmModal, Modal } from '@/components/ui/Modal';
import { exportBackup, importBackup, resetGroups, RESET_CONTENT, RESET_EXTRA } from '@/lib/backup';
import { DiaryPost, DIARY_SEED } from '@/lib/diaryStore';
import { newId } from '@/lib/postStore';
import { useCommSettings, badgeStyle, CommBadge, CommSettings } from '@/lib/commStore';
import {
  useBoardSettings, boardBadgeStyle, BoardBadge, galleryCatsOf,
  useBoards, Board, BoardSkin, BoardPerm, DEFAULT_BOARD_CATS, MAIN_BOARD_ID,
} from '@/lib/boardStore';
import { useThreadSettings, ThreadWork, THREAD_SEED, ThreadCat, threadBadgeStyle, threadCats, threadCatsPatch } from '@/lib/threadStore';
import { useTrpgSettings, DOTORI_STATUS_KEYS, DotoriStatus, dotoriBadgeStyle } from '@/lib/galleryStore';
import { useMemoSettings } from '@/lib/memoStore';
import {
  useMenuSettings, MenuSettings, MenuPerm, MenuVis, PLAYLOG_COLS,
  MenuGroupNode, MenuLeaf, defaultTree, newGroupId, menuLabelFor, extraBoardHref, boardEntries,
  IMG_PROTECT_AREAS,
} from '@/lib/menuStore';
import { FEATURES } from '@/lib/menu';
import { SectionsBlock } from '@/components/settings/SectionList';
import { useSections, sectionsOf, sectionMenuEntries, MAIN_SEC, inSection } from '@/lib/sectionStore';
import { useCustomLinks, linkEntries, toInternalPath } from '@/lib/linkStore';
import { useSiteDraft } from '@/lib/siteStore';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCursorSettings, CursorState, CURSOR_STATE_LABEL } from '@/lib/cursorStore';
import { RelQuestionSet, RELQ_SEED, RELQ_KEY, CP_LABEL } from '@/lib/relqStore';
import { SymbolInput } from '@/components/ui/SymbolInput';
import { allBlobs, putBlobAs, useBlobUrl, getBlob } from '@/lib/blobStore';
import { parseAni } from '@/lib/aniCursor';
import { fileDrop } from '@/lib/dnd';
import { Character, CHAR_SEED, Relation, REL_SEED } from '@/lib/charStore';
import { useLocalList } from '@/lib/postStore';
import { Mood, MOOD_SEED, moodTint } from '@/lib/diaryStore';
import {
  TextSettingEditor, DdayEditor, TodoEditor, BannerEditor, DecoEditor,
} from '@/components/main/widgetEditors';
import { useBgm, BgmTrack, parseVideoId } from '@/lib/bgmStore';
import { useFonts, fontCssUrl, FontDef, FontRole, ROLE_LABEL, FOLLOW_MENU, FOLLOW_TITLE } from '@/lib/fontStore';
import { useToast } from '@/components/ui/Toast';
import { PageTitle, EditableDesc, getPageText, setPageText } from '@/components/ui/PageText';
import { putBlob } from '@/lib/blobStore';
import { getSetting, setSetting, pushLocalSettings, unsyncedSettingKeys, SETTING_KEYS } from '@/lib/settingStore';
import { isServerMode, createBackend, backend } from '@/lib/backend';
import type { BackendConfig, BackendKind } from '@/lib/backend/types';
import { CONTENT_COLLECTIONS } from '@/lib/backend/types';
import { visFloorOf } from '@/lib/visFloor';
import { validateConfig, configFileText, saveLocalConfig, parseFirebaseSnippet, serverConfig, serverConfigSource } from '@/lib/serverConfig';
import { migrateTo, findOrphanFiles } from '@/lib/transfer';
import { FIRESTORE_RULES, STORAGE_RULES } from '@/lib/firebaseRules';
import { SCHEMA_SQL } from '@/lib/schemaSql';

const CATEGORIES = [
  '設計', '主頁', 'Widget', '選單管理', '留言板管理', '自設關係問題', '委託', 'TRPG', '感想串', '記事本',
  '字型', '滑鼠游標', 'BGM', '心情列表', '會員／安全', '資料備份',
] as const;

/** 顏色項目一對的渲染輔助函式 */
function CP({ label, k, def }: { label?: string; k: keyof ThemeVars; def?: string }) {
  const { state, setVar } = useTheme();
  // def: 沒有值時實際套用的預設顏色（例如：輸入焦點 = 主色）
  return (
    <>
      {label && <span className="cp-lb">{label}</span>}
      <ColorField value={String(state.vars[k] ?? def ?? '#888888')} onChange={hex => setVar(k, hex as never)} />
    </>
  );
}

/**
 * Widget 樣式 (v2.0 使用者要求) — 疊加在主頁・側邊的卡片，其背景・標題色・內文色・邊框。
 *
 * 沒有設定顏色時，`--wg-*` 會直接指向卡片顏色，因此看起來會和目前完全相同。所以當值為
 * 空白時，輸入欄會填入**目前實際使用中的卡片顏色** — 第一次開啟時不會出現莫名其妙的
 * 灰色，而是直接顯示畫面上看到的顏色，這樣比較容易只修改一點點。
 * 邊框只有開啟時才會繪製（關閉時維持目前只有陰影的狀態）。
 */
function WidgetStyleRow() {
  const { state, setVar } = useTheme();
  const v = state.vars;
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l"><b>Widget</b>
        <small>疊加在主頁・側邊的卡片 — 留空時會直接跟隨卡片顏色</small></div>
      <div style={{ display: 'grid', gap: 8, justifyItems: 'end' }}>
        <div className="cp-grid2">
          <CP label="背景" k="wgBg" def={v.cardBg ?? '#fbfbfc'} />
          <CP label="標題" k="wgTitle" def={v.pageDesc ?? '#8a8f98'} />
          <CP label="內文" k="wgFg" def={v.cardFg ?? '#1d2025'} />
        </div>
        <div className="cf-row" style={{ justifyContent: 'flex-end' }}>
          <KCheck label="邊框" checked={!!v.wgBorder} onChange={b => setVar('wgBorder', b)} />
          {v.wgBorder && <CP label="顏色" k="wgBd" def="#e6e8ec" />}
        </div>
      </div>
    </div>
  );
}

/** 角色字型一列 — 字型 + 粗細 + 尺寸倍率（5.1，修正不同字型的體感大小） */
function FontRoleRow({ role }: { role: FontRole }) {
  const { fonts, roles, setRole, familyOf } = useFonts();
  const cfg = roles[role];
  const wBtn = (w: number | undefined, label: string) => (
    <button className={cfg.weight === w ? 'on' : ''} onClick={() => setRole(role, { weight: w })}>{label}</button>
  );
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l"><b>{ROLE_LABEL[role].label}</b>{ROLE_LABEL[role].desc && <small>{ROLE_LABEL[role].desc}</small>}</div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
        {/* 字型名稱再長也不換行 — 設定上限，超出時顯示 …（v2.0 使用者要求） */}
        <KSelect minWidth={170} value={cfg.id} onChange={v => setRole(role, { id: v })}
          options={[
            ...(role === 'dropdown' ? [{ value: FOLLOW_MENU, label: <span>與選單字型相同</span> }] : []),
            ...(role === 'pagetitle' ? [{ value: FOLLOW_TITLE, label: <span>與標題字型相同</span> }] : []),
            ...fonts.map(f => ({ value: f.id, label: <span style={{ fontFamily: familyOf(f.id) }}>{f.name}</span> })),
          ]} />
        <div className="mini-seg">
          {wBtn(undefined, '預設')}
          {wBtn(300, '較細')}
          {wBtn(400, '一般')}
          {wBtn(700, '粗體')}
        </div>
        <KStep value={cfg.scale ?? 100} min={80} max={130} step={5} suffix="%"
          onChange={v => setRole(role, { scale: v })} />
      </div>
    </div>
  );
}

function DesignPane() {
  const {
    state, dirty: themeDirty, setMode, setPointAccent, setPointTone, setVar,
    resetMode, save, discard, presets, savePreset, applyPreset, removePreset,
  } = useTheme();
  // 設計分頁的顏色以外元素（Logo・角色字型）也整合到 SAVE 草稿（v1.9 使用者確認）
  const siteDraft = useSiteDraft();
  const { rolesDirty, saveRoles, discardRoles } = useFonts();
  const dirty = themeDirty || siteDraft.dirty || rolesDirty;
  // 未儲存就重新整理・關閉視窗時會靜默消失 —
  // 因為預覽會立即套用到畫面（分頁標題・Logo・顏色），很容易以為已經儲存，所以這裡會先詢問一次
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const toast = useToast();
  const del = useConfirmDelete();
  const [resetOpen, setResetOpen] = useState(false);
  const [presetName, setPresetName] = useState('');
  const [presetSel, setPresetSel] = useState('');
  const modeBtn = (m: typeof state.mode, label: string) => (
    <button className={state.mode === m ? 'on' : ''} onClick={() => setMode(m)}>{label}</button>
  );
  return (
    <div className="set-sec">
      <h3>主題</h3>
      <div className="d">修改只會反映在預覽中 — 按下 [SAVE] 才會儲存 · 每個模式會分別記住修改值</div>

      <div className="set-row">
        <div className="l"><b>模式</b><small>即使切換模式，各模式的修改值也會保留 — 重設請在[選擇性重設]中依模式進行</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <div className="seg in-panel">
            {modeBtn('light', '淺色')}
            {modeBtn('dark', '深色')}
            {modeBtn('point', '主色自動')}
            {modeBtn('custom', '自訂')}
          </div>
          <button className="btn btn-ghost" style={{ padding: '7px 12px', fontSize: 11 }}
            onClick={() => setResetOpen(true)}>選擇性重設</button>
        </div>
      </div>

      {/* 儲存／取消 — 可以到處試用，最後不儲存（v1.9） */}
      <div className="set-row">
        <div className="l"><b>儲存</b><small>畫面會立即顯示，但<strong>SAVE 要按下後才會實際儲存</strong> — 顏色・字型・Logo・分頁標題全部都是如此</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {dirty && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600 }}>尚未儲存的修改</span>}
          {/* 統一控制項垂直尺寸 — 35px（與 btn-dark 預設相同） */}
          <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11, opacity: dirty ? 1 : 0.45 }}
            disabled={!dirty} onClick={() => { discard(); siteDraft.discard(); discardRoles(); toast('已恢復為已儲存的主題'); }}>取消修改</button>
          <button className="btn btn-dark" style={{ padding: '0 18px', fontSize: 11, opacity: dirty ? 1 : 0.45 }}
            disabled={!dirty} onClick={() => { save(); siteDraft.save(); saveRoles(); toast('主題已儲存'); }}>SAVE</button>
        </div>
      </div>

      {/* 主題預設樣式 — 以名稱儲存，並從下拉選單套用為自訂模式（v1.9） */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>儲存主題</b><small>以名稱保存目前的顏色配置 — 套用後會載入到自訂模式</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* 已儲存的主題控制項會出現在左側 — 主題名稱／KEEP 位置固定（使用者確認） */}
          {presets.length > 0 && (
            <>
              <KSelect minWidth={140} value={presetSel} onChange={setPresetSel}
                options={[{ value: '', label: '已儲存的主題' }, ...presets.map(p => ({ value: p.id, label: p.name }))]} />
              <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
                onClick={() => { if (presetSel) { applyPreset(presetSel); toast('已套用至自訂模式 — 若要儲存請按 SAVE'); } }}>APPLY</button>
              <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11, marginRight: 10 }}
                onClick={() => {
                  const p = presets.find(x => x.id === presetSel);
                  if (p) del.ask(`確定要刪除主題「${p.name}」嗎？`, () => { removePreset(p.id); setPresetSel(''); });
                }}>DELETE</button>
            </>
          )}
          {/* 輸入框・按鈕垂直尺寸統一（35px） */}
          <KInput placeholder="主題名稱" value={presetName} onChange={e => setPresetName(e.target.value)}
            style={{ width: 120, height: 35, boxSizing: 'border-box' }} />
          <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
            onClick={() => {
              if (!presetName.trim()) { toast('請輸入主題名稱'); return; }
              savePreset(presetName.trim());
              setPresetName('');
              toast('主題已儲存至儲存區');
            }}>KEEP</button>
        </div>
      </div>

      {/* 選擇性重設 — 選擇模式，只初始化該模式的修改值 */}
      <ConfirmModal open={resetOpen} wide title="要重設哪個主題？"
        body="選取的模式會恢復為初始修改值。確認後必須按下 [SAVE] 才會儲存。"
        onClose={() => setResetOpen(false)}
        buttons={[
          { label: '淺色', kind: 'ghost', onClick: () => { resetMode('light'); setResetOpen(false); } },
          { label: '深色', kind: 'ghost', onClick: () => { resetMode('dark'); setResetOpen(false); } },
          { label: '主色自動', kind: 'ghost', onClick: () => { resetMode('point'); setResetOpen(false); } },
          { label: '自訂', kind: 'ghost', onClick: () => { resetMode('custom'); setResetOpen(false); } },
          { label: 'CANCEL', kind: 'dark', onClick: () => setResetOpen(false) },
        ]} />
      {del.element}

      <div className="set-row">
        <div className="l"><b>主色自動色調</b><small>主色自動模式要採用偏深色的感覺，還是偏淺色的感覺</small></div>
        <div className="mini-seg">
          <button className={state.pointTone === 'dark' ? 'on' : ''} onClick={() => setPointTone('dark')}>深色感</button>
          <button className={state.pointTone === 'light' ? 'on' : ''} onClick={() => setPointTone('light')}>淺色感</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>主色</b><small>主色自動模式的基準色 — 修改後立即重新衍生整體配色</small></div>
        <div className="cp-group">
          <ColorField value={state.vars.accent}
            onChange={hex => state.mode === 'point' ? setPointAccent(hex) : setVar('accent', hex)} />
        </div>
      </div>

      {/* 背景 — 選擇漸層（角度）／圖片（模糊）（v1.9） */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>背景</b><small>漸層（開始→結束・角度）或圖片（上傳・模糊）</small></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <div className="mini-seg">
            <button className={(state.vars.bgType ?? 'gradient') === 'gradient' ? 'on' : ''}
              onClick={() => setVar('bgType', 'gradient')}>漸層</button>
            <button className={state.vars.bgType === 'image' ? 'on' : ''}
              onClick={() => setVar('bgType', 'image')}>圖片</button>
          </div>
          {(state.vars.bgType ?? 'gradient') === 'gradient' ? (
            <>
              <CP k="bgG1" />
              <span style={{ color: 'var(--faint)', fontSize: 11 }}>→</span>
              <CP k="bgG2" />
              <span className="cp-lb">角度</span>
              <KStep value={state.vars.bgAngle ?? 180} min={0} max={360} step={15} suffix="°"
                onChange={v => setVar('bgAngle', v)} />
            </>
          ) : (
            <>
              <input id="themeBgFile" type="file" accept="image/*" style={{ display: 'none' }}
                onChange={async e => {
                  const f = e.target.files?.[0];
                  if (f) setVar('bgImageId', await putBlob(f));
                  e.target.value = '';
                }} />
              <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
                onClick={() => document.getElementById('themeBgFile')?.click()}>
                {state.vars.bgImageId ? 'CHANGE' : 'UPLOAD'}
              </button>
              {state.vars.bgImageId && (
                <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
                  onClick={() => setVar('bgImageId', undefined)}>REMOVE</button>
              )}
              <span className="cp-lb">模糊</span>
              <KStep value={state.vars.bgBlur ?? 0} min={0} max={30} step={2} suffix="px"
                onChange={v => setVar('bgBlur', v)} />
            </>
          )}
        </div>
      </div>

      {/* 卡片顏色 — 面板・留言板列表・篩選等共用（v1.9） */}
      <div className="set-row">
        <div className="l"><b>卡片</b><small>面板・留言板列表・篩選卡片的背景與文字顏色 — 輔助文字顏色會自動衍生</small></div>
        <div className="cp-group">
          <CP label="背景" k="cardBg" />
          <CP label="文字" k="cardFg" />
        </div>
      </div>

      {/* 瀏覽器分頁標題 (v1.9 使用者要求) — 留空時為「Logo 文字 — 個人首頁」 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>瀏覽器分頁標題</b><small>顯示於分頁・我的最愛中的名稱 — 留空時為「Logo 文字 — 個人首頁」</small></div>
        <DocTitleControl />
      </div>

      {/* 瀏覽器分頁圖示 (v2.0 使用者要求) — 指定前會顯示部署預設圖示 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>瀏覽器分頁圖示</b><small>顯示於分頁・我的最愛中的小圖片 — 建議使用正方形 PNG，留空時使用預設圖示</small></div>
        <FaviconControl />
      </div>

      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>爬蟲說明文字</b><small>在 KakaoTalk・Discord 等分享連結時，顯示於標題下方的一行文字 — 留空時使用副標題，若副標題也為空則使用預設文字</small></div>
        <CrawlDescControl />
      </div>

      {/* Logo — 文字／副標題／對齊／文字顏色（5.2） */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>Logo</b><small>上方列 Logo 文字・下方副標題・對齊</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
          <LogoControls />
          {/* 文字顏色放到這一列最右側（v1.9 使用者要求） */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <CP label="文字" k="topBrand" />
          </div>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>上方選單</b></div>
        <div className="cp-group">
          <CP label="背景" k="topBg" />
          <CP label="文字" k="topFg" />
          <CP label="懸停文字" k="topHv" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>下層選單下拉選單</b></div>
        <div className="cp-group">
          <CP label="背景" k="ddBg" />
          <CP label="文字" k="ddFg" />
          <CP label="懸停" k="ddHv" />
        </div>
      </div>

      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>頁面標題</b><small>各選單上方的大型標題與說明文字</small></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {/* 標頭顯示選項（v1.9）：兩者／僅標題／僅說明／不顯示 */}
          <div className="mini-seg">
            {(['both', 'title', 'desc', 'none'] as const).map(m => (
              <button key={m} className={(state.vars.pageHead ?? 'both') === m ? 'on' : ''}
                onClick={() => setVar('pageHead', m)}>
                {m === 'both' ? '兩者' : m === 'title' ? '僅標題' : m === 'desc' ? '僅說明' : '不顯示'}
              </button>
            ))}
          </div>
          {/* 是否只在手機版省略標頭（v1.9 使用者要求） */}
          <span className="cp-lb">手機版</span>
          <div className="mini-seg">
            <button className={(state.vars.pageHeadM ?? 'same') === 'same' ? 'on' : ''}
              onClick={() => setVar('pageHeadM', 'same')}>相同</button>
            <button className={state.vars.pageHeadM === 'none' ? 'on' : ''}
              onClick={() => setVar('pageHeadM', 'none')}>省略</button>
          </div>
          <CP label="標題" k="pageTitle" />
          <CP label="說明" k="pageDesc" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>BGM 播放器</b></div>
        <div className="cp-group">
          <CP label="背景" k="bgmBg" />
          <CP label="文字" k="bgmFg" />
          <CP label="圖示" k="bgmIc" />
          <CP label="音量列" k="bgmVol" />
        </div>
      </div>

      {/* 角色分頁列表（v1.9 使用者要求）— 左側圖示分頁 4 色 */}
      <div className="set-row">
        <div className="l"><b>角色分頁列表</b><small>角色詳細頁面左側的圖示分頁</small></div>
        <div className="cp-grid2">
          <CP label="背景" k="tabBg" />
          <CP label="文字" k="tabFg" />
          <CP label="選取背景" k="tabOnBg" />
          <CP label="選取文字" k="tabOnFg" />
        </div>
      </div>

      {/* 輸入焦點（v1.9 使用者要求）— 輸入框・文字區域・下拉選單・編輯器共用 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>輸入焦點</b><small>選取輸入框・下拉選單時的邊框顏色與強調環</small></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', flex: 1 }}>
          {/* 預覽在左側，設定控制項靠右對齊（v1.9 使用者要求） */}
          <KInput style={{ width: 130, marginRight: 'auto' }} defaultValue="焦點預覽" />
          <CP label="顏色" k="focusColor" def={state.vars.accent} />
          {/* 為了能放在同一列而縮短 — 詳細意思請看提示文字（v1.9） */}
          <div className="mini-seg">
            <button data-tip="淡淡擴散的環" className={(state.vars.focusRing ?? 'glow') === 'glow' ? 'on' : ''}
              onClick={() => setVar('focusRing', 'glow')}>擴散</button>
            <button data-tip="清晰的實線環" className={state.vars.focusRing === 'line' ? 'on' : ''}
              onClick={() => setVar('focusRing', 'line')}>線條</button>
            <button data-tip="不使用環，只改變邊框顏色" className={state.vars.focusRing === 'none' ? 'on' : ''}
              onClick={() => setVar('focusRing', 'none')}>僅邊框</button>
          </div>
          {(state.vars.focusRing ?? 'glow') !== 'none' && (
            <>
              <span className="cp-lb">粗細</span>
              <KStep value={state.vars.focusW ?? 3} min={1} max={6} step={1} suffix="px"
                onChange={v => setVar('focusW', v)} />
            </>
          )}
        </div>
      </div>

      {/* 圖片編輯（裁切）背景（v1.9 使用者要求）— 指定透明 PNG 位置時顯示的面板 */}
      <div className="set-row">
        <div className="l"><b>圖片編輯背景</b><small>縮圖・標頭位置指定畫面中的面板 — 會顯示於透明圖片上</small></div>
        <div className="cp-group">
          <CP label="背景" k="cropBg" />
        </div>
      </div>

      {/* 貼紙備忘錄面板（v1.9 使用者要求）— 修正淺色模式下看不到配置面板的問題 */}
      <div className="set-row">
        <div className="l"><b>貼紙備忘錄面板</b><small>記事本配置面板與主頁迷你面板 Widget 的背景</small></div>
        <div className="cp-group">
          <CP label="背景" k="memoBoard" />
          <CP label="邊框" k="memoBoardBd" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>捲軸</b></div>
        <div className="cp-group">
          <CP label="顏色" k="sbThumb" />
          <CP label="邊框" k="sbBd" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>搜尋框</b><small>留言板・列表共用搜尋輸入框 — 淺色／深色切換時自動連動</small></div>
        {/* 4 個項目無法放在同一列而換行 — 使用 2×2 網格排列（對齊欄位） */}
        <div className="cp-grid2">
          <CP label="背景" k="searchBg" />
          <CP label="文字" k="searchFg" />
          <CP label="圖示" k="searchIc" />
          <CP label="邊框" k="searchBd" />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>切換分頁</b><small>留言板分類標籤・圖片庫檢視切換等 — 選取的一側會直接沿用下方深色按鈕的顏色</small></div>
        <div className="cp-group">
          <CP label="背景" k="segBg" />
          <CP label="文字" k="segFg" />
        </div>
      </div>

      {/* Widget 樣式（v2.0 使用者要求）— 主頁・側邊卡片。未設定時會直接沿用卡片顏色 */}
      <WidgetStyleRow />

      <div className="set-row">
        <div className="l"><b>深色按鈕</b><small>登錄・儲存按鈕與核取方塊・選取篩選標籤共用</small></div>
        <div className="cp-group">
          <CP label="按鈕" k="btnDark" />
          <CP label="文字" k="btnDarkFg" />
          <CP label="懸停" k="btnDarkHv" />
        </div>
      </div>

      {/* 網站角色字型（5.1）— 從字型庫（內建＋自行登錄）選擇 + 粗細・尺寸修正 */}
      <FontRoleRow role="title" />
      <FontRoleRow role="pagetitle" />
      <FontRoleRow role="subtitle" />
      <FontRoleRow role="logosub" />
      <FontRoleRow role="menu" />
      <FontRoleRow role="dropdown" />
      <FontRoleRow role="body" />

      <div className="set-row">
        <div className="l"><b>圓角程度</b><small>卡片／按鈕 radius</small></div>
        <KStep value={state.vars.radius} min={0} max={30} onChange={v => setVar('radius', v)} />
      </div>

      {/* 陰影設定 — 區塊／下拉選單並排分組 */}
      <div className="set-row">
        <div className="l"><b>區塊陰影</b><small>面板・卡片・Banner・Modal 的陰影強度 — 0% 代表沒有陰影</small></div>
        {/* 顏色移到左側，強度控制靠右 — 與下方「下拉選單陰影」那列對齊（v1.9 使用者要求） */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, justifyContent: 'flex-end' }}>
          <span className="cp-lb" style={{ marginLeft: 'auto' }}>顏色</span>
          <ColorField value={state.vars.shColor ?? '#000000'} onChange={hex => setVar('shColor', hex)} />
          <div className="mini-seg" style={{ marginLeft: 10 }}>
            {([['無', 0], ['較弱', 30], ['一般', 50], ['強烈', 100]] as const).map(([label, v]) => (
              <button key={label} className={state.vars.shadow === v ? 'on' : ''}
                onClick={() => setVar('shadow', v)}>{label}</button>
            ))}
          </div>
          <KStep value={state.vars.shadow} min={0} max={200} step={10} suffix="%" onChange={v => setVar('shadow', v)} />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>下拉選單陰影</b><small>下層選單・個人資料選單・選擇器彈窗・行事曆 — 與區塊陰影分開，也可以設定為無</small></div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div className="mini-seg">
            {([['無', 0], ['較弱', 30], ['一般', 50], ['強烈', 100]] as const).map(([label, v]) => (
              <button key={label} className={(state.vars.ddShadow ?? 100) === v ? 'on' : ''}
                onClick={() => setVar('ddShadow', v)}>{label}</button>
            ))}
          </div>
          <KStep value={state.vars.ddShadow ?? 100} min={0} max={200} step={10} suffix="%" onChange={v => setVar('ddShadow', v)} />
        </div>
      </div>

      <SpellCheckRow />
    </div>
  );
}

/** 拼字檢查底線（v2.0 使用者要求）— 關閉整個頁面的紅色波浪線。
 *  與其他 Logo・分頁標題設定一樣，使用草稿／SAVE 流程。 */
function SpellCheckRow() {
  const { site, set } = useSiteDraft();
  const off = !!site.noSpell;
  return (
    <div className="set-row">
      <div className="l"><b>拼字檢查底線</b><small>瀏覽器在輸入框・編輯器中繪製的紅色波浪線 — 關閉後整個網站都不會顯示</small></div>
      <div className="mini-seg">
        <button className={!off ? 'on' : ''} onClick={() => set({ noSpell: false })}>顯示</button>
        <button className={off ? 'on' : ''} onClick={() => set({ noSpell: true })}>隱藏</button>
      </div>
    </div>
  );
}

/** 主頁分頁（v1.9 確認）— 手機版顯示切換 + 手機版垂直排列順序
    切換只從手機版移除（使用者確認）— PC 主頁配置透過編輯模式的 [＋ Widget]・右鍵刪除 */
function MainPagePane() {
  const { state, setMobileOff, setMobileOrder, resetMain } = useMainStore();
  const toast = useToast();
  const [resetAsk, setResetAsk] = useState(false);   // 基本配置確認（v1.9）
  // 手機版順序列表：固定元素（Banner・會員資訊視窗）不包含在內
  const orderable = state.mobileOrder
    .map(id => state.widgets.find(w => w.id === id))
    .filter((w): w is NonNullable<typeof w> => !!w && !w.fixed);

  return (
    <div className="set-sec">
      {/* 標題＋說明與其他分頁相同流程（h3 → .d），只有基本配置按鈕顯示在右上角
          （按鈕高度會撐大標題列，導致說明文字往下掉的問題 — v1.9 使用者回饋） */}
      <div style={{ position: 'relative' }}>
        <h3>主頁</h3>
        <button className="btn btn-ghost" style={{ position: 'absolute', right: 0, top: -3, padding: '6px 14px', fontSize: 11 }}
          onClick={() => setResetAsk(true)}>基本配置</button>
      </div>
      <ConfirmModal open={resetAsk} title="要將主頁恢復為基本配置嗎？"
        body="新增的 Widget 與配置・尺寸・手機版順序都會全部恢復為初始狀態。恢復後將無法復原。"
        onClose={() => setResetAsk(false)}
        buttons={[
          { label: 'RESET', kind: 'accent', onClick: () => { resetMain(); setResetAsk(false); toast('主頁已恢復為基本配置'); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setResetAsk(false) },
        ]} />
      <div className="d">手機版顯示與否 + 手機版垂直排列順序 — ⠿ 拖曳以變更順序</div>

      {/* 主頁版面只有一個固定畫布 — 移除響應式選項（v1.9，僅 PC／手機兩種） */}
      <DragList
        items={orderable}
        keyOf={w => w.id}
        onReorder={list => setMobileOrder(list.map(w => w.id))}
        render={(w, i) => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="mw-no">{i + 1}</span>
              <span className="drag-h">⠿</span>
              <div>
                {/* 標籤放在名稱旁 — b 是區塊元素，放在中間會讓說明文字換到下一行（v1.9 使用者回饋） */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <b>{widgetLabel(state.widgets, w)}</b>
                  {MULTI_TYPES.includes(w.type) && <span className="pill">可重複新增</span>}
                </div>
                <small>{WIDGET_META[w.type].desc}</small>
              </div>
            </div>
            <KToggle checked={!w.mOff} onChange={v => setMobileOff(w.id, !v)} />
          </div>
        )}
      />
      <p className="hint">關閉切換後只會從<strong>手機版</strong>移除，PC 主頁仍會照常顯示 · 順序為<strong>手機版垂直排列順序</strong> — PC 配置可在主頁編輯模式中自由調整</p>
      <p className="hint">如果要在主頁完全移除或新增 Widget，請在編輯模式中操作 — 新增使用上方列 [＋ Widget]，刪除則對 Widget 按右鍵 → 刪除 Widget</p>
      <p className="hint">固定元素：輪播 Banner（最上方）・會員資訊視窗 — 不包含在順序列表中</p>
    </div>
  );
}

/** Widget 分頁 — 集中管理主頁 Widget 的內容・設定值（與主頁的管理 Modal 使用相同資料） */
function WidgetsPane() {
  const { state } = useMainStore();
  // 只有具有設定值的 Widget — 實際資料連動 Widget（DIARY・LATEST・UPCOMING）與選單列表・會員資訊視窗沒有設定值
  const editable = state.widgets.filter(w =>
    (['banner', 'memo', 'dday', 'todo', 'freetext', 'deco'] as const).some(t => t === w.type));

  const editorOf = (w: WidgetConf) => {
    switch (w.type) {
      case 'memo':
      case 'freetext': return <TextSettingEditor conf={w} />;
      case 'dday': return <DdayEditor conf={w} />;
      case 'todo': return <TodoEditor conf={w} />;
      case 'deco': return <DecoEditor conf={w} />;
      case 'banner': return <BannerEditor conf={w} />;
      default: return null;
    }
  };

    return (
    <div className="set-sec">
      <h3>Widget</h3>
      <div className="d">管理主頁 Widget 的內容・設定值 — 與主頁面的管理 Modal 使用相同資料，因此無論從哪一側修改都會立即套用</div>

      {editable.map(w => (
        <div key={w.id} style={{ padding: '16px 0', borderBottom: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            {/* 可重複新增的 Widget（圖片・自由文字）會以編號區分 (v1.9) */}
            <b style={{ fontSize: 13, letterSpacing: '.04em' }}>{widgetLabel(state.widgets, w)}</b>
            {MULTI_TYPES.includes(w.type) && <span className="pill">可重複新增</span>}
            <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{WIDGET_META[w.type].desc}</small>
            {w.mOff && <span className="pill" style={{ marginLeft: 'auto' }}>排除手機版</span>}
          </div>
          {editorOf(w)}
        </div>
      ))}
      <p className="hint">DIARY・LATEST・UPCOMING 是直接顯示日記・載入紀錄・行事曆實際資料的 Widget，因此沒有額外設定值 · Widget 的開啟／關閉與順序請至「主頁面」分類</p>
    </div>
  );
}

/** 留言板管理分頁 (5.2) — 建立・刪除留言板・面板・權限 + 各留言板分類標籤 + 徽章顏色 */
function BoardPane() {
  const {
    st, patchSystem, patchGallery,
    patchGalleryCat, addGalleryCat, removeGalleryCat, setGalleryCats,
  } = useBoardSettings();
  const { boards, setBoards, patchBoard } = useBoards();
  const [catBoard, setCatBoard] = useState(MAIN_BOARD_ID);   // 分類標籤編輯對象留言板
  /* 圖片留言板分類標籤也要各自獨立（v2.0 使用者要求）— 選擇要修改哪個圖片留言板的分類標籤。
     如果只有一個，就沒有需要選擇的對象，因此整行選擇區直接不顯示（與感想串相同的方式） */
  const { list: secList } = useSections();
  const galSecs = secList('gallery');
  const [galSecSel, setGalSec] = useState(MAIN_SEC);
  const galSec = galSecs.some(s2 => s2.id === galSecSel) ? galSecSel : MAIN_SEC;
  const galCats = galleryCatsOf(st, galSec);
  const del = useConfirmDelete();

  const sel = boards.find(b => b.id === catBoard) ?? boards[0];
  const setCats = (cats: BoardBadge[]) => patchBoard(sel.id, { cats });
  const patchCat = (id: string, p: Partial<BoardBadge>) =>
    patchBoard(sel.id, { cats: sel.cats.map(c => (c.id === id ? { ...c, ...p } : c)) });

  const colorCells = (b: BoardBadge, patch: (p: Partial<BoardBadge>) => void) => (
    <>
      <span className="cp-lb">背景</span>
      <ColorField value={b.bg} onChange={hex => patch({ bg: hex })} />
      <span className="cp-lb">邊框</span>
      <ColorField value={b.border} onChange={hex => patch({ border: hex })} />
      <span className="cp-lb">文字</span>
      <ColorField value={b.fg} onChange={hex => patch({ fg: hex })} />
    </>
  );

  return (
    <div className="set-sec">
      <h3>留言板管理</h3>
      <div className="d">建立・刪除留言板，以及各留言板的面板・權限・分類標籤 — 修改後立即套用至選單・列表・發文</div>

      <h3 style={{ marginTop: 20 }}>留言板列表</h3>
      <div className="d">⠿ 拖曳調整選單順序 · 名稱會直接顯示於上方選單與頁面標題 · 每個留言板可指定列表面板（基本型／票券型）— 發文・留言權限請至選單管理</div>
      <DragList items={boards} keyOf={b => b.id} onReorder={setBoards}
        render={b => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <KInput value={b.name} onChange={e => patchBoard(b.id, { name: e.target.value })}
                style={{ width: 110 }} />
              {b.id === MAIN_BOARD_ID && <span className="pill">預設</span>}
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end', flexWrap: 'wrap' }}>
              <div className="mini-seg">
                {(['list', 'ticket'] as BoardSkin[]).map(s => (
                  <button key={s} className={b.skin === s ? 'on' : ''}
                    onClick={() => patchBoard(b.id, { skin: s })}>{s === 'list' ? '基本型' : '票券型'}</button>
                ))}
              </div>
              {/* 列表文字顏色 (v1.9) — 未指定時使用主題預設色 */}
              <span className="cp-lb">文字</span>
              <ColorField value={b.fg ?? '#2c3037'} onChange={hex => patchBoard(b.id, { fg: hex })} />
              {b.fg && (
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => patchBoard(b.id, { fg: undefined })}>預設色</button>
              )}
              {b.id !== MAIN_BOARD_ID && (
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => del.ask(`確定要刪除留言板「${b.name}」嗎？`, () => {
                    setBoards(boards.filter(x => x.id !== b.id));
                    if (catBoard === b.id) setCatBoard(MAIN_BOARD_ID);
                  }, '留言板會從選單中消失，但已發表於此留言板的文章資料會保留（第 3 章原則）。')}>DELETE</button>
              )}
            </div>
          </div>
        )} />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setBoards([...boards, {
            id: newId(), name: '新留言板', desc: '請輸入留言板說明',
            skin: 'list', permWrite: 'member', permComment: 'member', cats: DEFAULT_BOARD_CATS,
          }])}>＋ ADD BOARD</button>
      </div>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>分類標籤</h3>
      <div className="d">選擇留言板後，可透過 ⠿ 拖曳調整順序・修改名稱・新增／刪除 — 即使更改名稱，既有文章仍會保留舊名稱</div>
      {boards.length > 1 && (
        <div className="mini-seg" style={{ marginBottom: 12 }}>
          {boards.map(b => (
            <button key={b.id} className={sel.id === b.id ? 'on' : ''} onClick={() => setCatBoard(b.id)}>{b.name}</button>
          ))}
        </div>
      )}
      <DragList items={sel.cats} keyOf={c => c.id} onReorder={setCats}
        render={c => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span style={boardBadgeStyle(c)}>{c.label || '分類標籤'}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              <KInput value={c.label} onChange={e => patchCat(c.id, { label: e.target.value })}
                style={{ width: 90, textAlign: 'right' }} />
              {colorCells(c, p => patchCat(c.id, p))}
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => del.ask(`確定要刪除分類標籤「${c.label}」嗎？`, () =>
                  patchBoard(sel.id, { cats: sel.cats.filter(x => x.id !== c.id) }),
                  '使用此分類標籤發表的既有文章會保留，並以中性色徽章顯示。')}>DELETE</button>
            </div>
          </div>
        )} />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setCats([...sel.cats, { id: newId(), label: '新分類標籤', bg: '#eef0f2', border: '#d7dae0', fg: '#5d636d' }])}>＋ ADD</button>
      </div>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>系統徽章</h3>
      <div className="d">公告 · 私密 · 摺疊 — 僅修改顏色（無法刪除）</div>
      {st.system.map(b => (
        <div key={b.id} className="set-row">
          <div className="l"><span style={boardBadgeStyle(b)}>{b.label}</span></div>
          <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
            {colorCells(b, p => patchSystem(b.id, p))}
          </div>
        </div>
      ))}

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>圖片留言板類型徽章</h3>
      <div className="d">圖片備份的日誌／單一顯示 — 修改標籤・顏色（無法刪除）</div>
      {st.gallery.map(b => (
        <div key={b.id} className="set-row">
          <div className="l"><span style={boardBadgeStyle(b)}>{b.label || '類型'}</span></div>
          <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
            <KInput value={b.label} onChange={e => patchGallery(b.id, { label: e.target.value })}
              style={{ width: 90, textAlign: 'right' }} />
            {colorCells(b, p => patchGallery(b.id, p))}
          </div>
        </div>
      ))}

      {/* 圖片留言板分類標籤 (v2.0 使用者要求) — 以前固定寫在程式碼中，無法修改。
          每個獨立建立的圖片留言板都分別設定（v2.0 使用者要求） */}
      <h3 style={{ marginTop: 20 }}>圖片留言板分類標籤</h3>
      <div className="d">
        在圖片備份發文時選擇的分類標籤 — ⠿ 拖曳調整順序 · 可自由新增・修改・刪除
        {galSecs.length > 1 && <><br />每個圖片留言板分別設定 — <b>在修改前會直接使用預設圖片留言板的分類標籤</b></>}
      </div>
      {galSecs.length > 1 && (
        <div className="mini-seg" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {galSecs.map(s2 => (
            <button key={s2.id} className={galSec === s2.id ? 'on' : ''} onClick={() => setGalSec(s2.id)}>{s2.name}</button>
          ))}
        </div>
      )}
      <DragList items={galCats} keyOf={c => c.id} onReorder={next => setGalleryCats(galSec, next)}
        render={c => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span style={boardBadgeStyle(c)}>{c.label || '分類標籤'}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              <KInput value={c.label} onChange={e => patchGalleryCat(galSec, c.id, { label: e.target.value })}
                style={{ width: 100, textAlign: 'right' }} />
              {colorCells(c, p => patchGalleryCat(galSec, c.id, p))}
              <span className="fx" data-tip="刪除分類標籤"
                onClick={() => del.ask(`確定要刪除分類標籤「${c.label}」嗎？`,
                  () => removeGalleryCat(galSec, c.id),
                  '已使用此分類標籤登錄的文章會保留不變。')}>✕</span>
            </div>
          </div>
        )} />
      <button className="btn btn-ghost" style={{ marginTop: 8, padding: '7px 14px', fontSize: 11 }}
        onClick={() => addGalleryCat(galSec)}>＋ 新增分類標籤</button>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />
      {/* 圖片留言板・日記等也可建立多個（v2.0 使用者要求）— 列表數量統一在這裡管理 */}
      <SectionsBlock />

      {del.element}
    </div>
  );
}

/** 自設關係問題分頁 (v1.9) — 問題組（CP/NCP）管理。自設關係詳細頁新增 QUESTIONS 區段時選擇要加入的問題組 */
function RelQPane() {
  const [sets, setSets] = useLocalList<RelQuestionSet>(RELQ_KEY, RELQ_SEED);
  const [selId, setSelId] = useState<string | null>(null);
  const del = useConfirmDelete();
  const relqToast = useToast();
  const txtRef = useRef<HTMLInputElement>(null);   // txt 批次上傳（換行 = 一個問題）
  const sel = sets.find(s => s.id === selId) ?? sets[0];
  const patchSet = (id: string, p: Partial<RelQuestionSet>) =>
    setSets(sets.map(s => (s.id === id ? { ...s, ...p } : s)));

  // 問題可能會透過 txt 一次上傳數百題，如果全部顯示在同一畫面會變得無止境地長（v2.0 使用者要求）
  const PER_Q = 12;
  const [qPage, setQPage] = useState(1);
  const qTotal = sel?.questions.length ?? 0;
  const qPages = Math.max(1, Math.ceil(qTotal / PER_Q));
  // 切換問題組或問題減少導致頁面消失時，將目前頁數拉回最後一頁
  const qCur = Math.min(qPage, qPages);
  useEffect(() => { setQPage(1); }, [sel?.id]);
  const qStart = (qCur - 1) * PER_Q;
  // 畫面上只顯示目前頁面，因此修改・刪除・排序時，必須依整體陣列位置換算回去
  const qShown = (sel?.questions ?? []).slice(qStart, qStart + PER_Q);
  return (
    <div className="set-sec">
      <h3>自設關係問題</h3>
      <div className="d">將問題組分為 CP（情侶）／NCP（非情侶）管理 — 在自設關係詳細頁新增 QUESTIONS 區段時選擇要加入的問題組</div>

      <h3 style={{ marginTop: 20 }}>問題組</h3>
      <div className="d">名稱可自由修改 · CP/NCP 分類 · ⠿ 拖曳調整順序</div>
      <DragList items={sets} keyOf={s => s.id} onReorder={setSets}
        render={s => (
          /* 緊湊行（v1.9 — 最小化上下留白） */
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '3px 0' }}>
            <span className="drag-h" style={{ fontSize: 11 }}>⠿</span>
            <KInput value={s.name} onChange={e => patchSet(s.id, { name: e.target.value })}
              style={{ width: 140, fontSize: 12, padding: '5px 10px' }} />
            <div className="mini-seg">
              {(['cp', 'ncp'] as const).map(t => (
                <button key={t} className={s.cat === t ? 'on' : ''}
                  onClick={() => patchSet(s.id, { cat: t })}>{CP_LABEL[t]}</button>
              ))}
            </div>
            <small style={{ marginLeft: 'auto', color: 'var(--faint)', fontSize: 10.5 }}>問題 {s.questions.length} 題</small>
            <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 10.5 }}
              onClick={() => del.ask(`確定要刪除問題組「${s.name}」嗎？`,
                () => setSets(sets.filter(x => x.id !== s.id)),
                '已加入自設關係的問題會維持不變。')}>DELETE</button>
          </div>
        )} />
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setSets([...sets, { id: newId(), name: '新問題組', cat: 'cp', questions: [] }])}>＋ ADD SET</button>
      </div>

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>問題列表</h3>
      <div className="d">txt 檔案會以換行為基準計算問題數量。</div>
      {sets.length > 1 && (
        <div className="mini-seg" style={{ marginBottom: 12 }}>
          {sets.map(s => (
            <button key={s.id} className={sel?.id === s.id ? 'on' : ''} onClick={() => setSelId(s.id)}>{s.name}</button>
          ))}
        </div>
      )}
      {sel && (
        <>
          {/* 只在目前頁面內排序 — 放回去時前後頁維持不變 */}
          <DragList items={qShown.map((q, i) => ({ q, key: `${sel.id}-${qStart + i}` }))} keyOf={x => x.key}
            onReorder={list => patchSet(sel.id, {
              questions: [
                ...sel.questions.slice(0, qStart),
                ...list.map(x => x.q),
                ...sel.questions.slice(qStart + PER_Q),
              ],
            })}
            render={({ q }, i) => {
              const gi = qStart + i;   // 整體陣列中的實際位置
              return (
              /* 緊湊行 — 問題以 100 題為單位時，盡量減少間距 (v1.9) */
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', width: '100%', padding: '2px 0' }}>
                <span className="drag-h" style={{ fontSize: 11 }}>⠿</span>
                <small style={{ color: 'var(--faint)', fontSize: 10, minWidth: 26, textAlign: 'right' }}>{gi + 1}</small>
                <KInput value={q}
                  onChange={e => patchSet(sel.id, { questions: sel.questions.map((x, j) => (j === gi ? e.target.value : x)) })}
                  style={{ flex: 1, minWidth: 0, fontSize: 12, padding: '5px 10px' }} />
                <span className="fx" style={{ fontSize: 10, padding: '2px 4px' }}
                  onClick={() => {
                    // 有內容時跳出警告 Modal，剛新增的空白列則直接刪除
                    const remove = () => patchSet(sel.id, { questions: sel.questions.filter((_, j) => j !== gi) });
                    if (q.trim()) del.ask(`確定要刪除問題嗎？`, remove, `"${q.slice(0, 40)}${q.length > 40 ? '…' : ''}"`);
                    else remove();
                  }}>✕</span>
              </div>
              );
            }} />
          {/* 數量完全靠右，Pager 維持置中（v2.0 使用者要求）—
              如果同一行並排，Pager 會因數量文字而向左偏移，導致視覺上不在正中央 */}
          {qTotal > PER_Q && (
            <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center' }}>
              <span />
              <Pager page={qCur} total={qPages} onChange={setQPage} />
              <small style={{ color: 'var(--faint)', fontSize: 10.5, justifySelf: 'end' }}>共 {qTotal} 題</small>
            </div>
          )}
          <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            {/* txt 批次上傳 — 以 Enter 為基準，一行 = 一個問題 (v1.9，因應 100 題為單位) */}
            <input ref={txtRef} type="file" accept=".txt,text/plain" style={{ display: 'none' }}
              onChange={async e => {
                const f = e.target.files?.[0]; e.target.value = '';
                if (!f) return;
                const lines = (await f.text()).split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                if (lines.length === 0) { relqToast('在檔案中找不到問題'); return; }
                patchSet(sel.id, { questions: [...sel.questions, ...lines] });
                relqToast(`已載入 ${lines.length} 題問題`);
              }} />
            <button className="btn btn-dark" style={{ padding: '5px 12px', fontSize: 11 }}
              onClick={() => txtRef.current?.click()}>↑ 上傳 TXT</button>
            <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
              onClick={() => {
                patchSet(sel.id, { questions: [...sel.questions, ''] });
                // 新增的空白列會加在最末端，因此要切換到包含該列的頁面（否則按了卻看不到）
                setQPage(Math.ceil((qTotal + 1) / PER_Q));
              }}>＋ ADD</button>
          </div>
        </>
      )}
      {del.element}
    </div>
  );
}

/** 會員／安全分頁 (5.2, v1.9 mock 範圍) — 修改註冊碼 + 會員列表（刪除註冊帳號）。
 * 依群組區分的權限矩陣・註冊審核制・密碼政策會在 Supabase 連結時擴充 */
function MemberPane() {
  const toast = useToast();
  const del = useConfirmDelete();
  const router = useRouter();   // 點擊會員名稱 → 會員資訊頁面 (v1.9)
  const [code, setCode] = useState('');
  const [codeLoaded, setCodeLoaded] = useState(false);
  const [regVer, setRegVer] = useState(0);   // 刪除註冊帳號後更新列表用
  const [removedIds, setRemovedIds] = useState<string[]>([]);   // 伺服器模式下剛刪除的會員
  useEffect(() => { setCode(inviteCode()); setCodeLoaded(true); }, []);
  void regVer;

  const members = useMembers();
  const serverOn2 = isServerMode();
  // 帳號刪除只能在服務主控台進行 — 建立此網站的專案網址，讓它可以直接開啟
  const authConsoleUrl = (() => {
    const c = serverConfig();
    if (c?.kind === 'firebase') return `https://console.firebase.google.com/project/${c.projectId}/authentication/users`;
    if (c?.kind === 'supabase') {
      const m = c.url.match(/^https:\/\/([a-z0-9-]+)\.supabase\.co/i);
      return m ? `https://supabase.com/dashboard/project/${m[1]}/auth/users` : '';
    }
    return '';
  })();
  const [delMember, setDelMember] = useState<{ id: string; nickname: string } | null>(null);
  const registry = (() => {
    try { return JSON.parse(localStorage.getItem('ohome.mockreg.v1') ?? '{}') as Record<string, unknown>; } catch { return {}; }
  })();

  // 會員列表 — 搜尋 · 每頁 10 人 · 標籤分組 (v1.9)
  const PER_MEMBERS = 10;
  const [mq, setMq] = useState('');
  const [mPage, setMPage] = useState(1);
  const [filterTag, setFilterTag] = useState<string | null>(null);
  const [mTags, setMTags] = useState<Record<string, string[]>>({});
  const [tagFor, setTagFor] = useState<string | null>(null);   // 正在輸入標籤的會員
  const [tagInput, setTagInput] = useState('');
  // 會員標籤由管理員設定，所有人都可看到 — 伺服器模式下會儲存至資料庫 (v2.0)
  useEffect(() => { setMTags(getSetting<Record<string, string[]>>('ohome.membertags.v1', {})); }, []);
  const saveTags = (userId: string, tags: string[]) => {
    setMTags(prev => {
      const n = { ...prev };
      if (tags.length) n[userId] = tags; else delete n[userId];
      setSetting('ohome.membertags.v1', n);
      return n;
    });
  };
  const allTags = [...new Set(Object.values(mTags).flat())];
  const isAdminOf = (m: { id: string; role?: string }) => m.role === 'admin' || m.id === 'admin';
  const filteredMembers = members.filter(m => {
    if (removedIds.includes(m.id)) return false;   // 剛刪除的會員（列表只取得一次）
    const k = mq.trim().toLowerCase();
    const tags = mTags[m.id] ?? [];
    if (filterTag && !tags.includes(filterTag)) return false;
    return !k || m.nickname.toLowerCase().includes(k) || m.id.toLowerCase().includes(k)
      || tags.some(t => t.toLowerCase().includes(k));
  })
    // 管理員置頂（使用者要求）— 其餘依名稱排序
    .sort((a, b) => (isAdminOf(a) ? 0 : 1) - (isAdminOf(b) ? 0 : 1) || a.nickname.localeCompare(b.nickname));
  const pageMembers = filteredMembers.slice((mPage - 1) * PER_MEMBERS, mPage * PER_MEMBERS);

  return (
    <div className="set-sec">
      <h3>會員／安全</h3>
      <div className="d">管理註冊碼與會員列表</div>

      {/* 與其他分頁的 set-row 相同 — 標籤在左側，輸入框・按鈕在同一行右側（v2.0 使用者指出：
          以前標籤・說明・控制項各自佔一行，與其他分頁缺乏一致感，換行也不好看） */}
      <div className="set-row" style={{ marginTop: 8, flexWrap: 'wrap' }}>
        <div className="l"><b>註冊碼</b><small>會員註冊時必須輸入的邀請碼 — 僅與認識的人分享</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <KInput value={code} onChange={e => setCode(e.target.value)} style={{ width: 220 }} />
          <button className="btn btn-dark" disabled={!codeLoaded}
            onClick={() => {
              if (!code.trim()) { toast('請輸入註冊碼'); return; }
              setInviteCode(code);
              toast('註冊碼已變更');
            }}>SAVE</button>
        </div>
      </div>

      <h3 style={{ marginTop: 26 }}>會員列表</h3>
      <div className="d">預設帳號（管理員・熟人會員）無法刪除 — 透過標籤分組</div>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l">
          {allTags.length > 0 ? (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {allTags.map(t => (
                <span key={t} className={`pill${filterTag === t ? ' dark' : ''}`} style={{ cursor: 'var(--cur-pointer,pointer)' }}
                  onClick={() => { setFilterTag(f => (f === t ? null : t)); setMPage(1); }}>{t}</span>
              ))}
            </div>
          ) : <b>標籤篩選</b>}
        </div>
        <KInput placeholder="搜尋暱稱・ID・標籤" value={mq}
          onChange={e => { setMq(e.target.value); setMPage(1); }}
          style={{ width: 200, fontSize: 12 }} />
      </div>
      {pageMembers.map(m => {
        const isBase = m.id === 'admin' || m.id === 'guest';
        const myTags = mTags[m.id] ?? [];
        return (
          <div key={m.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }}>
            {/* 點擊名稱 → 會員資訊頁面 (v1.9) */}
            <b style={{ fontSize: 12.5, cursor: 'var(--cur-pointer,pointer)' }} data-tip="查看會員資訊"
              onClick={() => router.push(`/members/${m.id}`)}>{m.nickname}</b>
            {/* Firebase 帳號 id(uid) 有 28 個字元，會佔滿整行 — 僅顯示前 7 個字元，完整內容放在提示中 */}
            <small style={{ color: 'var(--faint)', fontSize: 10.5 }} data-tip={m.id.length > 7 ? m.id : undefined}>
              {m.id.length > 7 ? `${m.id.slice(0, 7)}…` : m.id}
            </small>
            {/* 標籤 — 以 ✕ 移除、＋新增（分組） */}
            {myTags.map(t => (
              <span key={t} className="pill" style={{ cursor: 'var(--cur-pointer,pointer)' }} data-tip="移除標籤"
                onClick={() => del.ask(`確定要移除標籤「${t}」嗎？`,
                  () => saveTags(m.id, myTags.filter(x => x !== t)),
                  `僅會從 ${m.nickname} 會員身上移除。`)}>
                {t} <span style={{ fontSize: 8 }}>✕</span>
              </span>
            ))}
            {tagFor === m.id ? (
              <KInput autoFocus placeholder="標籤" value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onBlur={() => setTagFor(null)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && tagInput.trim()) {
                    saveTags(m.id, [...new Set([...myTags, tagInput.trim()])]);
                    setTagInput(''); setTagFor(null);
                  }
                  if (e.key === 'Escape') setTagFor(null);
                }}
                style={{ width: 90, fontSize: 11, padding: '3px 8px' }} />
            ) : (
              <span className="fx" style={{ fontSize: 10 }} data-tip="新增標籤"
                onClick={() => { setTagFor(m.id); setTagInput(''); }}>＋</span>
            )}
            <span className="pill" style={{ marginLeft: 'auto' }}>{isAdminOf(m) ? '管理員' : '會員'}</span>
            {!isBase && !isAdminOf(m) && (
              // 與會員徽章（.pill）相同規格 — padding・文字・radius 相同 (v1.9)
              <button className="btn btn-ghost" style={{ padding: '4px 11px', fontSize: 10.5, borderRadius: 20, lineHeight: 'normal', letterSpacing: '.04em' }}
                onClick={() => {
                  // 伺服器模式下帳號刪除由主控台負責，因此先透過 Modal 說明（使用者確認）
                  if (serverOn2) { setDelMember({ id: m.id, nickname: m.nickname }); return; }
                  del.ask(`確定要刪除會員「${m.nickname}」的帳號嗎？`, () => {
                    const reg = { ...registry };
                    delete reg[m.id];
                    try { localStorage.setItem('ohome.mockreg.v1', JSON.stringify(reg)); } catch { /* 忽略 */ }
                    setRegVer(v => v + 1);
                    toast('帳號已刪除');
                  }, '此帳號將無法再次登入。已發表的文章會保留。');
                }}>DELETE</button>
            )}
          </div>
        );
      })}
      {filteredMembers.length === 0 && (
        <p className="hint" style={{ margin: '10px 0 0' }}>沒有符合條件的會員</p>
      )}
      {filteredMembers.length > PER_MEMBERS && (
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'center' }}>
          <Pager page={mPage} total={Math.ceil(filteredMembers.length / PER_MEMBERS)} onChange={setMPage} />
        </div>
      )}
      {/* 會員移除 — 帳號刪除只能在主控台進行，因此以兩個步驟的流程引導（v2.0 使用者確認） */}
      <ConfirmModal open={delMember !== null} title={`移除會員「${delMember?.nickname ?? ''}」`}
        wide
        body={
          <div style={{ display: 'grid', gap: 10 }}>
            <p style={{ margin: 0 }}>
              <b>① 先刪除登入帳號。</b><br />
              帳號刪除需要管理員權限，因此無法在首頁進行
              （如果在首頁加入此功能，首頁內的管理員金鑰就會公開，任何人都能刪除其他人的帳號）。
              請使用下方按鈕開啟主控台，刪除 <b>{delMember?.nickname}</b> 的帳號。
            </p>
            <p style={{ margin: 0 }}>
              <b>② 接著從列表中刪除。</b><br />
              如果不刪除帳號而只從列表移除，<b>該會員仍然可以繼續登入。</b>
              無論採用哪一種方式，已發表的文章都會保留。
            </p>
          </div>
        }
        onClose={() => setDelMember(null)}
        buttons={[
          ...(authConsoleUrl ? [{
            label: '① 在主控台刪除帳號 ↗', kind: 'dark' as const,
            onClick: () => window.open(authConsoleUrl, '_blank', 'noopener'),
          }] : []),
          {
            label: '② 從列表中刪除', kind: 'accent' as const,
            onClick: () => {
              const t = delMember;
              setDelMember(null);
              if (!t) return;
              void backend()?.deleteMember(t.id)
                .then(() => { setRemovedIds(v => [...v, t.id]); toast('已從會員列表中刪除'); })
                .catch(() => toast('刪除失敗 — 請確認是否以管理員帳號登入'));
            },
          },
          { label: 'CANCEL', kind: 'ghost' as const, onClick: () => setDelMember(null) },
        ]} />
      {del.element}
      {/* Fork 不會由 GitHub 自動同步 — 即使原始儲存庫有更新，我的 Fork・部署仍不會套用
          （今天新增的功能看不到的常見原因，v2.0 使用者要求）。
          完全不處理憑證，只移動到儲存的我的 Fork 網址 — 到那裡按一次
          [Sync fork] 即可完成 */}
      {serverOn2 && <ConfigScopeWarnRow />}
      {serverOn2 && <ForkUpdateRow />}
      {/* 即使已完成安裝，當安全規則變更時（版本更新等）也可以重新貼上 —
          以前只有初次安裝畫面才有，因此若不重新安裝就無法查看更新後的規則 (v2.0) */}
      {serverOn2 && <SecurityRulesRow />}
    </div>
  );
}

/** 僅儲存在此瀏覽器的連結狀態警告 (v2.0 Fork 回報 —「我的瀏覽器可以看到首頁，
 * 但透過部署網址進入的人卻會看到安裝畫面」）。如果跳過安裝最後一步（讓訪客也能看到）
 * 之後就沒有地方再次提醒，可能會困惑一週 — 管理員進入設定時立即顯示 */
function ConfigScopeWarnRow() {
  const src = serverConfigSource();
  const cfg = serverConfig();
  if (src !== 'local' || !cfg) return null;
  const download = () => {
    const blob = new Blob([configFileText(cfg)], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'ohome.config.json';
    a.click();
    URL.revokeObjectURL(u);
  };
  return (
    <div className="set-sec" style={{ marginTop: 26, border: '1.5px solid var(--accent)', borderRadius: 12, padding: 16 }}>
      <h3 style={{ color: 'var(--accent)' }}>訪客目前仍會看到安裝畫面</h3>
      <div className="d" style={{ lineHeight: 1.7 }}>
        資料庫連線目前只儲存在<b>這個瀏覽器中</b> — 其他人透過部署網址進入時，
        不會看到首頁，而是會看到「正在首次開啟」的安裝畫面。請下載下方檔案，放入<b>儲存庫的 public 資料夾</b>後
        提交 Commit（1～2 分鐘後自動重新部署），訪客也就能看到相同的首頁。這些是公開用的值，即使曝光也安全。
        <br />
        要確認是否套用成功，請開啟<b>我的部署網址/ohome.config.json</b>，如果能看到內容就代表成功。
      </div>
      <div className="setup-row" style={{ marginTop: 10 }}>
        <button className="btn btn-dark" onClick={download}>下載 ohome.config.json</button>
      </div>
      <p className="hint" style={{ margin: '8px 0 0' }}>
        也可以不使用檔案，改成在 Vercel → Settings → Environment Variables 中加入環境變數 — 與安裝畫面的最後一步相同。
      </p>
    </div>
  );
}

/** Fork 更新快速入口 (v2.0 使用者要求) — 不連結 Token 或 GitHub 登入，只會直接前往儲存的我的 Fork
 *  網址。完全不處理憑證，因此安全性最高且實作也很簡單 —
 *  實際更新（Sync fork）由使用者在該頁面自行操作 */
function ForkUpdateRow() {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setUrl(getSetting<string>('ohome.repo.v1', '')); setLoaded(true); }, []);
  const trimmed = url.trim();
  const valid = /^https:\/\/github\.com\/[^/\s]+\/[^/\s]+\/?$/i.test(trimmed);
  return (
    <div className="set-sec" style={{ marginTop: 26 }}>
      <h3>Fork 更新</h3>
      <div className="d">
        儲存我的 Fork 網址後，當原始儲存庫有更新時，可以直接前往 GitHub 的 [Sync fork] 畫面
      </div>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>我的 Fork 網址</b><small>在 GitHub Fork 的儲存庫網址</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <KInput placeholder="https://github.com/我的ID/O.home" value={url} onChange={e => setUrl(e.target.value)} style={{ width: 250 }} />
          <button className="btn btn-ghost" disabled={!loaded}
            onClick={() => { setSetting('ohome.repo.v1', trimmed); toast('已儲存'); }}>SAVE</button>
          <button className="btn btn-dark" disabled={!valid}
            onClick={() => window.open(trimmed, '_blank', 'noopener')}>前往我的 Fork ↗</button>
        </div>
      </div>
    </div>
  );
}

/** 再次查看安全規則 (v2.0) — 初次安裝後，即使 App 更新導致規則變更，也需要重新貼上。
 *  讓使用者可以在這裡複製與安裝畫面相同的內容 */
function SecurityRulesRow() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState('');
  const cfg = serverConfig();
  const copy = async (text: string, tag: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(tag);
      setTimeout(() => setCopied(''), 2000);
    } catch {
      setOpen(true);
    }
  };
  return (
    <div className="set-sec" style={{ marginTop: 26 }}>
      <h3>安全規則</h3>
      <div className="d">
        App 更新後規則有時會變更 — 如果新功能突然無法顯示、列表看起來是空的，或儲存遭到拒絕，
        請重新套用下方規則。{' '}
        {cfg?.kind === 'firebase'
          ? '可以直接在 Firestore 主控台的規則頁面完整覆蓋，這是安全的（既有 Collection 權限會維持不變）。'
          : 'Supabase 主控台 → SQL Editor 中完整貼上並執行 Run — 即使重複執行也安全（已存在的項目會略過，既有文章・會員都會保留）。'}
      </div>
      {cfg?.kind === 'firebase' ? (
        <div className="setup-row">
          <button className="btn btn-dark" onClick={() => copy(FIRESTORE_RULES, 'fs')}>
            {copied === 'fs' ? '已複製 ✓' : '複製 Firestore 規則'}
          </button>
          <button className="btn btn-dark" onClick={() => copy(STORAGE_RULES, 'st')}>
            {copied === 'st' ? '已複製 ✓' : '複製 Storage 規則'}
          </button>
          <button className="btn btn-ghost" onClick={() => setOpen(o => !o)}>{open ? '收起內容' : '查看內容'}</button>
        </div>
      ) : (
        /* Supabase 也可以直接在這裡複製（v2.0 Fork 回報）— 以前只有「請執行 schema.sql」的一行
           提示，因此回來重新套用規則的人會遇到空白畫面 */
        <div className="setup-row">
          <button className="btn btn-dark" onClick={() => copy(SCHEMA_SQL, 'sql')}>
            {copied === 'sql' ? '已複製 ✓' : '複製安裝 SQL'}
          </button>
          <button className="btn btn-ghost" onClick={() => setOpen(o => !o)}>{open ? '收起內容' : '查看內容'}</button>
        </div>
      )}
      {open && (cfg?.kind === 'firebase' ? (
        <>
          <pre className="setup-sql">{FIRESTORE_RULES}</pre>
          <pre className="setup-sql">{STORAGE_RULES}</pre>
        </>
      ) : (
        <pre className="setup-sql">{SCHEMA_SQL}</pre>
      ))}
    </div>
  );
}

/** Mood 列表分頁（5.2 — 日記 Mood：名稱／圖示／顏色新增・修改・刪除・排序） */
function MoodPane() {
  const [moods, setMoods] = useLocalList<Mood>('ohome.moods.v1', MOOD_SEED);
  const [diaries] = useLocalList<DiaryPost>('ohome.diary.v1', DIARY_SEED);
  const del = useConfirmDelete();
  const patchMood = (id: string, p: Partial<Mood>) =>
    setMoods(moods.map(m => (m.id === id ? { ...m, ...p } : m)));
  return (
    <div className="set-sec">
      <h3>Mood 列表</h3>
      <div className="d">可在日記中選擇的 Mood — 名稱・圖示（Emoji／特殊字元）・顏色・⠿ 拖曳排序</div>

      <DragList items={moods} keyOf={m => m.id} onReorder={setMoods}
        render={m => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span style={{
                width: 30, height: 30, borderRadius: '50%',
                // 行高 1 — 讓文字置中，而不是將方框置中（v2.0 使用者發現）
                display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
                background: moodTint(m.color), color: m.color, fontSize: 14,
              }}>{m.icon}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              {/* 圖示 — 點擊可選擇特殊字元預設樣式，也可以直接輸入（v1.9） */}
              <SymbolInput value={m.icon} onChange={v => patchMood(m.id, { icon: v })}
                style={{ width: 46, textAlign: 'center' }} />
              <KInput value={m.name} onChange={e => patchMood(m.id, { name: e.target.value })}
                style={{ width: 110 }} />
              <ColorField value={m.color} onChange={hex => patchMood(m.id, { color: hex })} />
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => {
                const used = diaries.filter(d => d.moodId === m.id).length;
                del.ask(`確定要刪除 Mood「${m.name}」嗎？`, () => setMoods(moods.filter(x => x.id !== m.id)),
                  used > 0 ? `使用這個 Mood 撰寫的日記 ${used} 篇會保留，但圖示會改為預設顯示。` : undefined);
              }}>DELETE</button>
            </div>
          </div>
        )} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setMoods([...moods, { id: newId(), name: '새 무드', icon: '✦', color: '#8a8f98' }])}>
          ＋ ADD MOOD
        </button>
      </div>
      {del.element}
    </div>
  );
}

/** Logo 控制項（5.2）— 插入設計分頁的 Logo 列 */
/** 瀏覽器分頁標題（v1.9 使用者要求）— 與其他 Logo 設定使用相同的草稿／SAVE 流程 */
function DocTitleControl() {
  const { site, set } = useSiteDraft();
  return (
    // 因為值會經過草稿儲存區再返回，所以使用不會破壞韓文組字的輸入框
    <LiveInput value={site.docTitle ?? ''} onValue={v => set({ docTitle: v })}
      placeholder={`${site.title} — 개인홈`}
      style={{ width: 260, height: 35, boxSizing: 'border-box' }} />
  );
}

/** 爬蟲說明文字（v2.0 使用者要求）— 分享 KakaoTalk・Discord 等連結時，會顯示在標題下方的說明文字。
 *  與分頁標題位於相同位置（設計分頁），直接接在後面 */
function CrawlDescControl() {
  const { site, set } = useSiteDraft();
  return (
    <LiveInput value={site.crawlDesc ?? ''} onValue={v => set({ crawlDesc: v })}
      placeholder="자캐놀이용 개인 아카이브"
      style={{ width: 260, height: 35, boxSizing: 'border-box' }} />
  );
}

/** 瀏覽器分頁圖示（v2.0 使用者要求）— 指定前會顯示預設圖示（部署時的預設值）。
 * 直接放在分頁標題下方，使用相同的草稿／SAVE 流程。 */
function FaviconControl() {
  const { site, set } = useSiteDraft();
  const toast = useToast();
  const url = useBlobUrl(site.favicon);
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{
        width: 35, height: 35, borderRadius: 'var(--radius-s)', border: '1px solid var(--line)',
        background: 'var(--panel)', display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0,
      }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {url ? <img src={url} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          : <span style={{ fontSize: 10, color: 'var(--faint)' }}>預設</span>}
      </span>
      <input id="siteFavicon" type="file" accept="image/png,image/x-icon,image/svg+xml,image/webp,.ico"
        style={{ display: 'none' }}
        onChange={async e => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (!f) return;
          // 如果上傳被阻擋，不要無聲無息地結束（v2.0 — 與先前個人資料照片遇到的問題相同）
          try { set({ favicon: await putBlob(f) }); } catch (err) {
            toast(`無法將圖示上傳至儲存區 — ${err instanceof Error ? err.message : String(err)}`);
          }
        }} />
      <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
        onClick={() => document.getElementById('siteFavicon')?.click()}>
        {site.favicon ? 'CHANGE' : 'UPLOAD'}
      </button>
      {site.favicon && (
        <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
          onClick={() => set({ favicon: undefined })}>REMOVE</button>
      )}
    </div>
  );
}

function LogoControls() {
  // 只透過草稿反映（v1.9）— 預覽立即更新，儲存則在設計分頁的 SAVE 中進行
  const { site, set } = useSiteDraft();
  return (
    <>
      {/* Logo 文字也會經過草稿再返回，因此使用對韓文組字安全的輸入框 */}
      <LiveInput value={site.title} onValue={v => set({ title: v })}
        style={{ width: 130, height: 35, boxSizing: 'border-box' }} />
      <LiveInput value={site.subtitle} onValue={v => set({ subtitle: v })}
        style={{ width: 160, height: 35, boxSizing: 'border-box' }} />
      <div className="mini-seg">
        {(['left', 'center', 'right'] as const).map(a => (
          <button key={a} className={site.align === a ? 'on' : ''} onClick={() => set({ align: a })}>
            {a === 'left' ? '左側' : a === 'center' ? '中央' : '右側'}
          </button>
        ))}
      </div>
    </>
  );
}

/** 調整游標圖片尺寸（v1.9 使用者發現）— 瀏覽器無法將超過 128px 的圖片作為游標使用，
 * 會直接忽略，因此自訂游標會在某些地方恢復成系統游標，看起來像是「壞掉」的原因。
 * .cur/.ani 是專用格式，因此保持原樣；一般圖片則縮小到 128px 以內。 */
async function fitCursorImage(f: File): Promise<{ blob: Blob; resized: boolean }> {
  if (/\.(cur|ani)$/i.test(f.name)) return { blob: f, resized: false };
  const url = URL.createObjectURL(f);
  try {
    const img = await new Promise<HTMLImageElement>((ok, no) => {
      const i = new Image();
      i.onload = () => ok(i); i.onerror = no; i.src = url;
    });
    const max = Math.max(img.width, img.height);
    if (max <= 128) return { blob: f, resized: false };
    const k = 128 / max;
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.width * k));
    c.height = Math.max(1, Math.round(img.height * k));
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>(ok => c.toBlob(ok, 'image/png'));
    return blob ? { blob, resized: true } : { blob: f, resized: false };
  } catch {
    return { blob: f, resized: false };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** 滑鼠游標分頁（5.1 v1.1）— 各狀態圖片＋熱點＋全域開／關 */
function CursorRow({ state }: { state: CursorState }) {
  const [st, patch] = useCursorSettings();
  const toast = useToast();
  const entry = st.states[state];
  // .ani 無法使用 <img> 顯示，因此擷取第一影格（.cur）作為預覽（v1.9）
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!entry?.imgId) { setUrl(null); return; }
    let cancelled = false;
    let obj: string | null = null;
    getBlob(entry.imgId).then(async b => {
      if (!b || cancelled) return;
      const ani = parseAni(await b.arrayBuffer());
      if (cancelled) return;
      obj = URL.createObjectURL(ani ? ani.frames[0] : b);
      setUrl(obj);
    });
    return () => { cancelled = true; if (obj) URL.revokeObjectURL(obj); };
  }, [entry?.imgId]);
  const inputId = `curFile-${state}`;
  const setEntry = (p: Partial<{ imgId: string; hx: number; hy: number }>) =>
    patch({ states: { ...st.states, [state]: { imgId: entry?.imgId ?? '', hx: 0, hy: 0, ...entry, ...p } } });
  return (
    <div className="set-row" style={{ flexWrap: 'wrap' }}>
      <div className="l" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{
          width: 36, height: 36, borderRadius: 9, border: '1.5px dashed var(--line)',
          display: 'grid', placeItems: 'center', overflow: 'hidden', flexShrink: 0,
        }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url ? <img src={url} alt="" style={{ maxWidth: 32, maxHeight: 32 }} /> : <span style={{ color: 'var(--faint)', fontSize: 14 }}>✛</span>}
        </span>
        <div><b>{CURSOR_STATE_LABEL[state].label}</b><small>{CURSOR_STATE_LABEL[state].desc}</small></div>
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input id={inputId} type="file" accept="image/png,image/gif,image/webp,image/x-icon,.cur,.ani" style={{ display: 'none' }}
          onChange={async e => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (!f) return;
            const { blob, resized } = await fitCursorImage(f);
            setEntry({ imgId: await putBlob(blob) });
            if (resized) toast('已縮小至 128px 以內，以便作為游標使用（原始圖片過大）');
          }} />
        <button className="btn btn-ghost" style={{ height: 33, padding: '0 12px', fontSize: 11 }}
          onClick={() => document.getElementById(inputId)?.click()}>{entry ? 'CHANGE' : 'UPLOAD'}</button>
        {entry && (
          <>
            <span className="cp-lb">熱點 X</span>
            <KStep value={entry.hx} min={0} max={32} step={1} onChange={v => setEntry({ hx: v })} />
            <span className="cp-lb">Y</span>
            <KStep value={entry.hy} min={0} max={32} step={1} onChange={v => setEntry({ hy: v })} />
            <button className="btn btn-ghost" style={{ height: 33, padding: '0 12px', fontSize: 11 }}
              onClick={() => {
                const next = { ...st.states };
                delete next[state];
                patch({ states: next });
              }}>REMOVE</button>
          </>
        )}
      </div>
    </div>
  );
}

function CursorPane() {
  const [st, patch] = useCursorSettings();
  return (
    <div className="set-sec">
      <h3>滑鼠游標</h3>
      <div className="d">登錄各狀態的游標（png・gif・cur・ani — 建議約 32px）＋點擊位置（熱點）— ani 會播放動畫・cur/ani 使用內建熱點・未登錄的狀態會使用預設游標</div>
      <p className="hint" style={{ margin: '-6px 0 10px' }}>
        瀏覽器無法將超過 128px 的圖片作為游標使用 — 上傳大型圖片時會自動縮小後登錄
      </p>
      <div className="set-row">
        <div className="l"><b>使用自訂游標</b><small>關閉後全部使用預設游標（已登錄的圖片會保留）</small></div>
        <KToggle checked={st.enabled} onChange={v => patch({ enabled: v })} />
      </div>
      {(Object.keys(CURSOR_STATE_LABEL) as CursorState[]).map(s => <CursorRow key={s} state={s} />)}
    </div>
  );
}

/** 資料備份分頁（5.2）— 備份（僅資料／包含會員）・還原・選擇性重設（v1.9 使用者確認） */
function DataPane() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [resetOpen, setResetOpen] = useState(false);   // 重設項目選擇 Modal（v1.9）
  const [resetAsk, setResetAsk] = useState(false);     // 最終確認
  const [picked, setPicked] = useState<string[]>([]);  // 選擇的重設群組
  const [pushing, setPushing] = useState(false);       // 正在上傳設定至伺服器（v2.0）
  const serverOn = isServerMode();
  // 只有先在本機設定、之後才連接伺服器時，才會存在尚未同步到伺服器的本機設定。
  // 一般安裝（先連接伺服器）會在設定變更時即時同步到伺服器，因此不會出現這一行。
  const [unsynced, setUnsynced] = useState<string[]>([]);
  useEffect(() => { setUnsynced(unsyncedSettingKeys()); }, []);

  // 清理未使用的圖片（v2.0）— 即使刪除文章，儲存區中的檔案仍會保留。
  // 同一張圖片可能還被其他文章使用，因此自動刪除有風險；先掃描並顯示，再由管理員刪除。
  const [orphans, setOrphans] = useState<{ ref: string; size: number }[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cleanAsk, setCleanAsk] = useState(false);
  const orphanMB = (orphans ?? []).reduce((s, f) => s + f.size, 0) / 1048576;

  const scanOrphans = async () => {
    const be = backend();
    if (!be) { toast('尚未連接伺服器'); return; }
    setScanning(true);
    try {
      const rows = await findOrphanFiles(be);
      setOrphans(rows);
      toast(rows.length ? `找到 ${rows.length} 個未使用的圖片` : '沒有需要清理的圖片');
    } catch (e) {
      // 原因會完整顯示（v2.0）— 如果籠統歸類為「權限問題」，就可能忽略真正的原因
      toast(e instanceof Error && e.message
        ? e.message
        : '無法讀取圖片列表 — 請確認儲存區權限（規則）');
    }
    setScanning(false);
  };

  const cleanOrphans = async () => {
    const be = backend();
    if (!be || !orphans) return;
    setScanning(true);
    let n = 0;
    for (const f of orphans) {
      try { await be.deleteFile(f.ref); n += 1; } catch { /* 個別失敗時跳過 */ }
    }
    setOrphans(null);
    setScanning(false);
    toast(`已刪除 ${n} 個圖片`);
  };

  /* 清理沒有任何關聯的對方角色（v2.0 使用者要求）。
     即使刪除自設關係，該自設關係中建立的對方角色仍會保留。**刻意如此設計** — 如果誤刪自設關係後連角色也消失，就沒有復原的方法（依使用者判斷）。
     因此只有真正沒有加入任何自設關係的角色，才會在這裡選擇刪除。自己的角色（own）與自設關係無關，因此不會處理。 */
  const [chars, setChars] = useLocalList<Character>('ohome.chars.v1', CHAR_SEED);
  const [rels] = useLocalList<Relation>('ohome.rels.v1', REL_SEED);
  const [charAsk, setCharAsk] = useState(false);
  const orphanChars = useMemo(() => {
    const used = new Set<string>();
    rels.forEach(r => r.members.forEach(m => used.add(m.charId)));
    return chars.filter(c => !c.own && !used.has(c.id));
  }, [chars, rels]);

  const cleanChars = () => {
    const gone = new Set(orphanChars.map(c => c.id));
    setChars(chars.filter(c => !gone.has(c.id)));
    toast(`已刪除 ${gone.size} 名對方角色`);
  };

  // 將此瀏覽器原本儲存的網站設定上傳至伺服器（連接後執行一次即可）
  const doPush = async () => {
    setPushing(true);
    try {
      // 只上傳設定鍵列表，避免文章列表等內容資料被寫入設定資料表
      const n = await pushLocalSettings(SETTING_KEYS);
      toast(n > 0 ? `已將 ${n} 項設定上傳至伺服器 — 訪客也會看到相同的樣式` : '沒有需要上傳的設定');
      setUnsynced(unsyncedSettingKeys());
    } catch {
      toast('設定上傳失敗 — 請確認是否已使用管理員帳號登入');
    }
    setPushing(false);
  };
  const toggle = (k: string, v: boolean) => setPicked(p => (v ? [...new Set([...p, k])] : p.filter(x => x !== k)));

  /* ---------- 資料庫遷移（v2.0）— 完整搬移至其他專案／其他服務 ---------- */
  const [migOpen, setMigOpen] = useState(false);
  const [migKind, setMigKind] = useState<BackendKind>('supabase');
  const [migSb, setMigSb] = useState({ url: '', anonKey: '' });
  const [migFb, setMigFb] = useState({ apiKey: '', authDomain: '', projectId: '', storageBucket: '', appId: '' });
  const [migState, setMigState] = useState<'idle' | 'checking' | 'ready' | 'running' | 'done'>('idle');
  const [migMsg, setMigMsg] = useState('');

  const migCfg = (): BackendConfig => (migKind === 'firebase'
    ? {
        kind: 'firebase',
        apiKey: migFb.apiKey.trim(),
        authDomain: migFb.authDomain.trim() || `${migFb.projectId.trim()}.firebaseapp.com`,
        projectId: migFb.projectId.trim(),
        storageBucket: migFb.storageBucket.trim() || `${migFb.projectId.trim()}.appspot.com`,
        appId: migFb.appId.trim(),
      }
    : { kind: 'supabase', url: migSb.url.trim(), anonKey: migSb.anonKey.trim() });

  const migCheck = async () => {
    const bad = validateConfig(migCfg());
    if (bad) { setMigMsg(bad); setMigState('idle'); return; }
    setMigState('checking'); setMigMsg('');
    try {
      const be = await createBackend(migCfg());
      const r = await be.check();
      setMigMsg(r.message);
      setMigState(r.ok ? 'ready' : 'idle');
    } catch (e) {
      setMigMsg(`連接失敗 — ${(e as { message?: string })?.message ?? ''}`);
      setMigState('idle');
    }
  };

  const migRun = async () => {
    setMigState('running');
    try {
      const target = await createBackend(migCfg());
      const r = await migrateTo(target, (m, done, total) => {
        setMigMsg(total ? `${m} (${done}/${total})` : m);
      });
      setMigMsg(`遷移完成 — 項目 ${r.items} 筆・圖片 ${r.files} 個。將下方設定檔上傳至儲存區後，訪客也會看到新的 DB。`);
      setMigState('done');
    } catch (e) {
      setMigMsg(`遷移失敗 — ${(e as { message?: string })?.message ?? ''}`);
      setMigState('ready');
    }
  };

  const migDownloadConfig = () => {
    const blob = new Blob([configFileText(migCfg())], { type: 'application/json' });
    const u = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = u; a.download = 'ohome.config.json';
    a.click();
    URL.revokeObjectURL(u);
  };

  const migSwitch = () => {
    saveLocalConfig(migCfg());
    toast('即將切換至新的資料庫 — 重新整理頁面');
    setTimeout(() => window.location.reload(), 700);
  };

  const doExport = async (includeMembers: boolean) => {
    setBusy(true);
    try {
      const { blob, dataCount, blobCount } = await exportBackup(includeMembers);
      const u = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = u;
      a.download = `ohome-backup${includeMembers ? '-with-members' : ''}-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(u);
      toast(`備份完成 — 資料 ${dataCount} 筆・圖片 ${blobCount} 個${includeMembers ? ' · 包含會員' : ''}`);
    } catch {
      toast('備份建立失敗');
    }
    setBusy(false);
  };

  const doImport = async () => {
    if (!importFile) return;
    setBusy(true);
    try {
      await importBackup(importFile);
      toast('還原完成 — 即將重新整理頁面');
      setTimeout(() => window.location.reload(), 800);
    } catch {
      toast('還原失敗 — 請確認檔案');
      setBusy(false);
    }
  };

  return (
    <div className="set-sec">
      <h3>資料備份</h3>
      <div className="d">文章・角色・自設關係・角色扮演等所有資料（JSON）與全部圖片，打包成一個 zip — 用於搬移至其他瀏覽器／PC</div>

      {/* 只有先在本機設定、之後才連接伺服器時才會出現 — 僅在存在尚未同步至伺服器的設定時顯示（v2.0） */}
      {serverOn && unsynced.length > 0 && (
        <div className="set-row" style={{ flexWrap: 'wrap' }}>
          <div className="l"><b>尚未上傳至伺服器的設定 {unsynced.length} 項</b><small>這些是在連接伺服器前於此瀏覽器設定的內容 — 上傳後訪客也會看到相同的樣式</small></div>
          <button className="btn btn-ghost" style={{ padding: '9px 18px', opacity: pushing ? 0.5 : 1 }}
            disabled={pushing} onClick={doPush}>{pushing ? '上傳中…' : '↑ 上傳設定'}</button>
        </div>
      )}
      {/* 清理未使用的圖片（v2.0）— 即使刪除文章，儲存區中的檔案仍會保留 */}
      {serverOn && (
        <div className="set-row" style={{ flexWrap: 'wrap' }}>
          <div className="l"><b>清理未使用的圖片</b>
            <small>即使刪除文章，圖片仍會保留在儲存區 — 只會挑出任何地方都未使用的檔案來刪除</small></div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {orphans && (
              <span className="hint">
                {orphans.length > 0 ? `${orphans.length} 個 · ${orphanMB.toFixed(1)}MB` : '沒有需要清理的項目'}
              </span>
            )}
            <button className="btn btn-ghost" style={{ padding: '9px 18px', opacity: scanning ? 0.5 : 1 }}
              disabled={scanning} onClick={scanOrphans}>{scanning ? '確認中…' : '尋找'}</button>
            {orphans && orphans.length > 0 && (
              <button className="btn btn-accent" style={{ padding: '9px 18px', opacity: scanning ? 0.5 : 1 }}
                disabled={scanning} onClick={() => setCleanAsk(true)}>{orphans.length} 個刪除</button>
            )}
          </div>
        </div>
      )}
      {/* 清理沒有任何關聯的對方角色（v2.0 使用者要求）— 即使刪除自設關係也刻意保留角色。
          方便誤刪後復原；只有真的未使用的角色才會在這裡選擇刪除 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>清理未登錄的對方角色</b>
          <small>即使刪除自設關係，對方角色仍會保留（方便誤刪後復原）— 只會挑出沒有加入任何自設關係的角色來刪除</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="hint">
            {orphanChars.length > 0 ? `${orphanChars.length} 名` : '沒有需要清理的項目'}
          </span>
          {orphanChars.length > 0 && (
            <button className="btn btn-accent" style={{ padding: '9px 18px' }}
              onClick={() => setCharAsk(true)}>{orphanChars.length} 名刪除</button>
          )}
        </div>
      </div>

      {/* 備份分成兩種（v1.9 使用者確認）— 選擇是否包含會員帳號 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>匯出備份</b><small>文章・角色・設定＋圖片 → zip ・可選擇是否包含會員帳號（註冊者・註冊碼）</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-accent" style={{ padding: '9px 18px', opacity: busy ? 0.5 : 1 }}
            disabled={busy} onClick={() => doExport(false)}>↓ 僅資料</button>
          <button className="btn btn-ghost" style={{ padding: '9px 18px', opacity: busy ? 0.5 : 1 }}
            disabled={busy} onClick={() => doExport(true)}>↓ 包含會員</button>
        </div>
      </div>
      {/* Firebase Storage 預設會阻止從其他網址讀取檔案 —
          雖然不影響首頁查看，但備份・遷移需要直接取得檔案，因此必須先開放一次 */}
      {serverOn && backend()?.kind === 'firebase' && (
        <p className="hint" style={{ margin: '10px 0 16px' }}>
          Firebase 必須<strong>先開放一次儲存區 CORS</strong>，圖片才能包含在備份 zip 中 — 否則只會包含文章・設定。
          安裝指南的「備份」項目中有可直接在瀏覽器完成的方法。
        </p>
      )}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>匯入備份（還原）</b><small>將目前資料覆蓋為備份內容 — 還原後會自動重新整理頁面</small></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <input id="bkImport" type="file" accept=".zip" style={{ display: 'none' }}
            onChange={e => { setImportFile(e.target.files?.[0] ?? null); e.target.value = ''; }} />
          <button className="btn btn-ghost" style={{ height: 35, padding: '0 14px', fontSize: 11 }}
            onClick={() => document.getElementById('bkImport')?.click()}>
            {importFile ? importFile.name : '選擇檔案'}
          </button>
          {importFile && (
            <button className="btn btn-dark" style={{ padding: '0 18px', fontSize: 11, opacity: busy ? 0.5 : 1 }}
              disabled={busy} onClick={doImport}>RESTORE</button>
          )}
        </div>
      </div>

            {/* 資料庫遷移（v2.0）— 整套搬移到新專案・其他服務 */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l"><b>資料庫遷移</b><small>將文章・設定・圖片整套搬移到其他專案或其他服務（Supabase ↔ Firebase）</small></div>
        <button className="btn btn-ghost" style={{ padding: '9px 20px' }}
          onClick={() => { setMigOpen(true); setMigState('idle'); setMigMsg(''); }}>遷移</button>
      </div>

      <Modal open={migOpen} onClose={() => setMigOpen(false)} title="資料庫遷移"
        desc="輸入要搬移到的地方的連接資訊並確認後開始 — 目前資料會保持不變，只會進行複製"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setMigOpen(false)}>CLOSE</button>
          {migState === 'ready' && <button className="btn btn-accent" onClick={migRun}>開始遷移</button>}
          {migState === 'done' && <button className="btn btn-accent" onClick={migSwitch}>切換至新 DB</button>}
        </>}>
        <div className="mini-seg" style={{ marginBottom: 12 }}>
          <button className={migKind === 'supabase' ? 'on' : ''} onClick={() => setMigKind('supabase')}>Supabase</button>
          <button className={migKind === 'firebase' ? 'on' : ''} onClick={() => setMigKind('firebase')}>Firebase</button>
        </div>

        {migKind === 'supabase' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="k-label">Project URL</label>
            <KInput value={migSb.url} onChange={e => setMigSb(s => ({ ...s, url: e.target.value }))} placeholder="https://xxxx.supabase.co" />
            <label className="k-label">anon public key</label>
            <KInput value={migSb.anonKey} onChange={e => setMigSb(s => ({ ...s, anonKey: e.target.value }))} />
            <p className="hint" style={{ margin: 0 }}>如果是新專案，請先執行 Schema SQL — 與安裝畫面中的內容相同。</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            <label className="k-label">貼上設定（firebaseConfig）</label>
            <KTextarea style={{ minHeight: 84, fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 11.5 }}
              onChange={e => {
                const v = parseFirebaseSnippet(e.target.value);
                if (v) setMigFb(f => ({
                  apiKey: v.apiKey ?? f.apiKey, authDomain: v.authDomain ?? f.authDomain,
                  projectId: v.projectId ?? f.projectId, storageBucket: v.storageBucket ?? f.storageBucket,
                  appId: v.appId ?? f.appId,
                }));
              }} />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div><label className="k-label">apiKey</label><KInput value={migFb.apiKey} onChange={e => setMigFb(f => ({ ...f, apiKey: e.target.value }))} /></div>
              <div><label className="k-label">projectId</label><KInput value={migFb.projectId} onChange={e => setMigFb(f => ({ ...f, projectId: e.target.value }))} /></div>
            </div>
            <div><label className="k-label">appId</label><KInput value={migFb.appId} onChange={e => setMigFb(f => ({ ...f, appId: e.target.value }))} /></div>
            <p className="hint" style={{ margin: 0 }}>如果是新專案，請先貼上 Firestore・Storage 安全規則。</p>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
          <button className="btn btn-dark" style={{ height: 33, padding: '0 16px', fontSize: 11 }}
            disabled={migState === 'checking' || migState === 'running'} onClick={migCheck}>
            {migState === 'checking' ? '確認中…' : '確認連接'}
          </button>
          {migState === 'done' && (
            <button className="btn btn-ghost" style={{ height: 33, padding: '0 14px', fontSize: 11 }}
              onClick={migDownloadConfig}>下載 ohome.config.json</button>
          )}
        </div>
        {migMsg && (
          <p className={migState === 'done' || migState === 'ready' ? 'setup-ok' : 'setup-err'} style={{ marginTop: 10 }}>
            {migMsg}
          </p>
        )}
      </Modal>

      {/* 選擇性重設（v1.9 使用者確認）— 依選單勾選 + 網站設定・圖片・會員帳號分開選擇 */}
      <div className="set-row">
        <div className="l"><b>重設</b><small>選擇要刪除的項目 — 各選單資料／網站設定／圖片／會員帳號（無法復原，請先匯出備份）</small></div>
        <button className="btn btn-ghost" style={{ padding: '9px 20px', color: 'var(--accent)' }}
          onClick={() => { setPicked([]); setResetOpen(true); }}>RESET</button>
      </div>

      <Modal open={resetOpen} onClose={() => setResetOpen(false)} title="選擇要重設的項目"
        desc="只會刪除勾選的項目 — 如果排除會員帳號，註冊會員・管理員帳號會保持不變"
        actions={<>
          <button className="btn btn-ghost" onClick={() => setResetOpen(false)}>CANCEL</button>
          <button className="btn btn-accent" disabled={picked.length === 0}
            style={{ opacity: picked.length === 0 ? 0.45 : 1 }}
            onClick={() => { setResetOpen(false); setResetAsk(true); }}>重設選取項目</button>
        </>}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
            onClick={() => setPicked(RESET_CONTENT.map(g => g.key))}>全部選取選單資料</button>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
            onClick={() => setPicked([...RESET_CONTENT, ...RESET_EXTRA].map(g => g.key))}>全部選取</button>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11, marginLeft: 'auto' }}
            onClick={() => setPicked([])}>全部取消</button>
        </div>
        <label className="k-label">各選單資料</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, margin: '6px 0 4px' }}>
          {RESET_CONTENT.map(g => (
            <KCheck key={g.key} label={g.label} checked={picked.includes(g.key)}
              onChange={v => toggle(g.key, v)} />
          ))}
        </div>
        <div style={{ height: 1, background: 'var(--line)', margin: '14px 0 12px' }} />
        <div style={{ display: 'grid', gap: 9 }}>
          {RESET_EXTRA.map(g => (
            <KCheck key={g.key} checked={picked.includes(g.key)} onChange={v => toggle(g.key, v)}
              label={<span>
                <b style={{ fontSize: 12.5 }}>{g.label}</b>{' '}
                <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{g.desc}</small>
              </span>} />
          ))}
        </div>
      </Modal>

      <ConfirmModal open={cleanAsk} title={`要刪除 ${orphans?.length ?? 0} 個未使用的圖片嗎？`}
        body={`將從儲存區清除 ${orphanMB.toFixed(1)}MB。雖然已篩選出目前文章・角色・設定中都沒有引用的檔案，但刪除後將無法復原。如果擔心，請先建立備份。`}
        onClose={() => setCleanAsk(false)}
        buttons={[
          { label: '刪除', kind: 'accent', onClick: () => { setCleanAsk(false); void cleanOrphans(); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setCleanAsk(false) },
        ]} />

      {/* 直接顯示要刪除的角色名稱（v2.0）— 只看數量無法知道哪些角色會消失 */}
      <ConfirmModal open={charAsk} title={`要刪除 ${orphanChars.length} 名對方角色嗎？`}
        body={`${orphanChars.slice(0, 12).map(c => c.name).join(', ')}${orphanChars.length > 12 ? ` 以及其他 ${orphanChars.length - 12} 名` : ''} — 這些角色沒有登錄到任何自設關係中。刪除後將無法復原。`}
        onClose={() => setCharAsk(false)}
        buttons={[
          { label: '刪除', kind: 'accent', onClick: () => { setCharAsk(false); cleanChars(); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setCharAsk(false) },
        ]} />

      <ConfirmModal open={resetAsk} title="要重設選取的項目嗎？"
        body={`要刪除的項目：${[...RESET_CONTENT, ...RESET_EXTRA].filter(g => picked.includes(g.key)).map(g => g.label).join(' · ')}\n刪除的內容將無法復原。`}
        onClose={() => setResetAsk(false)}
        buttons={[
          { label: '重設', kind: 'accent', onClick: () => {
            // 伺服器模式會連 DB 一起刪除，因此完成後重新整理（v2.0）
            setResetAsk(false);
            toast('重設中…');
            void resetGroups(picked)
              .then(r => {
                // 如果隱藏失敗，就會顯示「已刪除」，但伺服器中其實仍然存在 — 直接顯示筆數
                if (r.failed.length) {
                  toast(`${r.failed.length}筆無法從伺服器刪除 — 請確認登入狀態・安全規則`);
                } else if (serverOn) {
                  const part = [`文章 ${r.rows}筆`];
                  if (r.files) part.push(`圖片 ${r.files}個`);
                  if (r.members) part.push(`會員 ${r.members}名`);
                  toast(`已從伺服器刪除 ${part.join(' · ')}${r.members ? '（登入帳號請在控制台中刪除）' : ''}`);
                } else {
                  toast('已重設選取項目 — 將重新整理');
                }
              })
              .catch(() => { toast('重設失敗 — 請確認登入狀態'); })
              .finally(() => setTimeout(() => window.location.reload(), 1400));
          } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setResetAsk(false) },
        ]} />
    </div>
  );
}

/** 會員選擇 Modal（v2.0 使用者要求）— 僅讓特定會員看到「隱藏未登入」的選單。
 * 透過搜尋篩選並勾選，清空後則如同現在一樣，所有已登入會員都能看到。管理員永遠可以看到，因此不會出現在列表中 */
function MemberPickModal({ initial, onApply, onClose, desc }: {
  initial: string[]; onApply: (ids: string[]) => void; onClose: () => void;
  desc?: string;   // 用於選擇什麼 — 顯示限制／文章撰寫權限共用此 Modal（v2.0）
}) {
  const pool = useMembers().filter(p => p.id !== 'admin' && p.role !== 'admin');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<string[]>(initial);
  const t = q.trim().toLowerCase();
  const list = pool.filter(p => !t || p.nickname.toLowerCase().includes(t) || p.id.toLowerCase().includes(t));
  return (
    <Modal open small title="選擇會員" onClose={onClose}
      desc={desc ?? '只有勾選的會員（以及管理員）能看到並開啟此選單 — 清空後則所有已登入會員都能看到'}
      actions={<>
        <button className="btn btn-ghost" onClick={onClose}>CANCEL</button>
        <button className="btn btn-accent" onClick={() => { onApply(sel); onClose(); }}>套用</button>
      </>}>
      <div style={{ display: 'grid', gap: 9 }}>
        <KInput placeholder="搜尋暱稱・ID" value={q} onChange={e => setQ(e.target.value)} />
        <div style={{ maxHeight: 240, overflow: 'auto', display: 'grid', gap: 4, alignContent: 'start' }}>
          {list.map(p => (
            <KCheck key={p.id}
              label={<span style={{ fontSize: 12.5 }}>{p.nickname} <small style={{ color: 'var(--faint)' }}>{p.id}</small></span>}
              checked={sel.includes(p.id)}
              onChange={v => setSel(s => (v ? [...s, p.id] : s.filter(x => x !== p.id)))} />
          ))}
          {list.length === 0 && (
            <p className="hint" style={{ margin: 0 }}>
              {pool.length === 0 ? '沒有已註冊的會員' : '沒有符合搜尋條件的會員'}
            </p>
          )}
        </div>
        {/* 如果選取項目中包含已不在列表的會員，顯示提醒 — 避免在不知情的情況下持續限制存取 */}
        {sel.some(id => !pool.some(p => p.id === id)) && (
          <p className="hint" style={{ margin: 0 }}>
            有 {sel.filter(id => !pool.some(p => p.id === id)).length} 筆選取項目不在會員列表中 — 套用後仍會保留
          </p>
        )}
      </div>
    </Modal>
  );
}

/** 選單管理分頁（5.2 — 選單選擇制）— 顯示・排序・名稱＋各選單附加設定 */
function MenuPane() {
  const [ms, patch, msLoaded] = useMenuSettings();
  // 套用至文章（v2.0 使用者要求）— 參見下方 applyVis
  const { user } = useAuth();
  const [visBusy, setVisBusy] = useState(false);
  // 開啟「允許透過網址查看」時顯示的確認（v2.0 使用者要求）
  const [openAsk, setOpenAsk] = useState<(() => void) | null>(null);
  const [visAsk, setVisAsk] = useState(false);
  // 會員選擇 Modal（v2.0 使用者要求）— 將「隱藏未登入」・圖庫文章撰寫限制縮小到特定會員
  const [memAsk, setMemAsk] = useState<{ ids: string[]; apply: (ids: string[]) => void; desc?: string } | null>(null);
  const [commSet, patchComm] = useCommSettings();
  const { boards, loaded: bLoaded, patchBoard } = useBoards();  // 同步額外留言板名稱・自動加入 + 權限
  const toast = useToast();
  const del = useConfirmDelete();
  const saved = ms.tree ?? defaultTree();
  // 留言板 + 多個建立的區段 — 選單知道的「額外項目」全部（v2.0）
  const { map: secMap } = useSections();
  const { links, setLinks } = useCustomLinks();   // 自訂連結（v2.0 使用者要求）
  // 新的自訂連結輸入表單（v2.0 使用者回報 — 「輸入網址後，還沒命名就先加入了」）。
  // 以前 ADD 會立即建立空白資料列，輸入網址的瞬間，未配置區便出現沒有完成的連結
  const [nlName, setNlName] = useState('');
  const [nlHref, setNlHref] = useState('');
  const extraAll = [...boardEntries(boards), ...sectionMenuEntries(secMap), ...linkEntries(links)];
  const defLabel = (href: string) => menuLabelFor(href, extraAll) ?? href;

  // 草稿 — 所有編輯（包含刪除）都必須按 SAVE 才會真正套用到選單（v1.9 使用者回饋）
  const [draft, setDraft] = useState<MenuGroupNode[] | null>(null);
  const [draftRemoved, setDraftRemoved] = useState<string[] | null>(null);
  const tree = draft ?? saved;
  const removed = draftRemoved ?? ms.removedBoards;
  const dirty = draft !== null && (
    JSON.stringify(draft) !== JSON.stringify(saved)
    || JSON.stringify(removed) !== JSON.stringify(ms.removedBoards));
  // 儲存版本變更時（正規化・其他分頁），僅在編輯前狀態更新草稿
  const savedKey = JSON.stringify([saved, ms.removedBoards]);
  useEffect(() => {
    if (!msLoaded || !bLoaded) return;
    if (!dirty) { setDraft(saved); setDraftRemoved(ms.removedBoards); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey, msLoaded, bLoaded]);

  const setTree = (t: MenuGroupNode[]) => setDraft(t);
  const saveAll = () => { patch({ tree, removedBoards: removed }); toast('選單已儲存'); };

  /* 將已上傳文章的公開範圍套用至伺服器（v2.0 使用者要求）。
     只在畫面上隱藏的話，直接呼叫 API 的人仍然可以看到 — 伺服器（RLS）必須拒絕提供資料。
     逐一掃描 collection，只挑出**套用至私密選單的項目**，只更新該欄位（內容・順序保持不變）。
     新文章每次儲存時都會自動套用相同規則（visFloor），因此此按鈕只用於**已存在的文章**。 */
  const applyVis = async () => {
    const be = backend();
    if (!be) { toast('尚未連接伺服器 — 瀏覽器儲存模式本身沒有伺服器權限'); return; }
    setVisBusy(true);
    try {
      let n = 0;
      for (const coll of CONTENT_COLLECTIONS) {
        const rows = await be.fetchList(coll);
        const targets = rows.filter(r => visFloorOf(coll, r) !== 'public');
        if (targets.length) n += await be.refreshVis(coll, targets, user?.id ?? null);
      }
      toast(n ? `已在伺服器上隱藏 ${n} 筆文章` : '沒有套用私密設定的選單文章');
    } catch (e) {
      toast(e instanceof Error && e.message ? e.message : '無法套用');
    }
    setVisBusy(false);
  };
  const revert = () => { setDraft(saved); setDraftRemoved(ms.removedBoards); };

  // 離開警告 — 有未儲存變更時，如果要移動到上方列・其他設定分頁（與主題相同模式）
  const dirtyRef = useRef(dirty); dirtyRef.current = dirty;
  const [leaveAsk, setLeaveAsk] = useState(false);
  const pendingClick = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onCapture = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      const t = e.target as HTMLElement | null;
      const hit = t?.closest?.('.topbar a, .topbar button, .topbar .brand, .set-nav button') as HTMLElement | null;
      if (!hit) return;
      e.preventDefault(); e.stopPropagation();
      pendingClick.current = hit; setLeaveAsk(true);
    };
    document.addEventListener('click', onCapture, true);
    return () => document.removeEventListener('click', onCapture, true);
  }, []);
  const [resetAsk, setResetAsk] = useState(false);   // 預設配置重設確認 Modal
  const [mtab, setMtab] = useState<'basic' | 'perm'>('basic');   // 基本（配置）／權限分頁（v1.9）
  // 角色扮演未登入提示文字（v1.9 — pagetext 'rp-gate-desc'）
  const [rpGate, setRpGate] = useState('');
  useEffect(() => { setRpGate(getPageText('rp-gate-desc', '역극은 로그인한 참여자에게만 표시됩니다')); }, []);
  const leaveWith = (action: 'save' | 'discard') => {
    if (action === 'save') patch({ tree, removedBoards: removed });
    else revert();
    dirtyRef.current = false;
    setLeaveAsk(false);
    const el = pendingClick.current;
    pendingClick.current = null;
    setTimeout(() => el?.click(), 30);   // 重新執行暫存的點擊 → 前往原本目的地
  };

  /* 樹狀結構正規化（針對儲存版本）— 移除消失的功能（已刪除的留言板）。
     **不會自動加入新建立的項目**（v2.0 使用者確認）— 會保持在未配置狀態 */
  useEffect(() => {
    if (!msLoaded || !bLoaded) return;
    let next: MenuGroupNode[] = saved
      .map(g => (g.href
        ? (menuLabelFor(g.href, extraAll) === null ? null : g)
        : { ...g, items: g.items.filter(it => menuLabelFor(it.href, extraAll) !== null) }))
      .filter((g): g is MenuGroupNode => !!g);
    if (JSON.stringify(next) !== JSON.stringify(saved)) patch({ tree: next });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [msLoaded, bLoaded, boards, ms.tree]);

  // 未配置 = 不在樹狀結構中的功能 — 不會顯示在選單中（資料仍會保留）
  const placedSet = new Set(tree.flatMap(g => (g.href ? [g.href] : g.items.map(i => i.href))));
  const unplaced = [
    ...FEATURES.filter(f => !placedSet.has(f.href)),
    // 留言板・圖庫・Diary 等建立多個的項目也會在這裡顯示（v2.0 使用者要求）。
    // 已取消自動配置，因此**建立後會停留在這裡**— 需要手動加入想要的上層選單
    ...extraAll.map(b => ({ href: b.href, label: b.name })).filter(x => !placedSet.has(x.href)),
  ];

  const patchGroup = (id: string, p: Partial<MenuGroupNode>) =>
    setTree(tree.map(g => (g.id === id ? { ...g, ...p } : g)));
  // 取消配置時，如果是留言板則加入自動加入排除列表（再次配置後取消）— 僅套用到草稿
  const markRemoved = (hrefs: string[]) => {
    // 額外項目（留言板・區段）如果移除，就記錄下來，避免自動配置再次加入 —
    // 如果不記錄，一移除的瞬間自動配置就會將它放回原本的位置
    const known = new Set(extraAll.map(b => b.href));
    const bs = hrefs.filter(h => known.has(h));
    if (bs.length) setDraftRemoved([...new Set([...removed, ...bs])]);
  };
  const removeGroup = (g: MenuGroupNode) => {
    setTree(tree.filter(x => x.id !== g.id));
    markRemoved(g.href ? [g.href] : g.items.map(i => i.href));
  };
  // 刪除會先經過警告 Modal，再套用至草稿 — 按 SAVE 後才會真正從選單消失
  const askRemoveGroup = (g: MenuGroupNode) => del.ask(
    g.href ? `要將獨立選單「${g.label}」從選單移除嗎？` : `要刪除上層選單「${g.label}」嗎？`,
    () => removeGroup(g),
    `${g.href ? '此功能會' : '下層選單會'}移至未配置列表，資料仍會保留。按下 SAVE 後才會真正套用至選單。`);
  const removeItem = (gid: string, href: string) => {
    setTree(tree.map(g => (g.id === gid ? { ...g, items: g.items.filter(i => i.href !== href) } : g)));
    markRemoved([href]);
  };
  const moveItem = (fromGid: string, it: MenuLeaf, to: string) => {
    const stripped = tree.map(g => (g.id === fromGid ? { ...g, items: g.items.filter(i => i.href !== it.href) } : g));
    if (to === 'solo') {
      setTree([...stripped, { id: newGroupId(), label: it.label ?? defLabel(it.href), href: it.href, items: [], pageTitle: it.pageTitle }]);
    } else {
      setTree(stripped.map(g => (g.id === to ? { ...g, items: [...g.items, it] } : g)));
    }
  };
  const placeUnplaced = (href: string, to: string) => {
    if (to === 'solo') setTree([...tree, { id: newGroupId(), label: defLabel(href), href, items: [] }]);
    else setTree(tree.map(g => (g.id === to ? { ...g, items: [...g.items, { href }] } : g)));
    if (href.startsWith('/board?b=')) setDraftRemoved(removed.filter(h => h !== href));
  };
  const groupOptions = (excludeId?: string) => [
    ...tree.filter(g => !g.href && g.id !== excludeId).map(g => ({ value: g.id, label: `→ ${g.label}` })),
    { value: 'solo', label: '→ 獨立選單' },
  ];

  const permSel = (label: string, value: MenuPerm, onChange: (v: MenuPerm) => void) => (
    <KSelect minWidth={110} value={value} onChange={v => onChange(v as MenuPerm)}
      options={[
        { value: 'guest', label: `${label}: 訪客` },
        { value: 'member', label: `${label}: 註冊會員` },
        { value: 'admin', label: `${label}: 管理員` },
      ]} />
  );
  // 各選單附加設定 — 基本分頁用（顯示方式等）
  const extraFor = (href: string) => {
    switch (href) {
      case '/gallery': return (
        <div className="mini-seg">
          <button className={ms.backupView === 'gal' ? 'on' : ''} onClick={() => patch({ backupView: 'gal' })}>預設：圖庫</button>
          <button className={ms.backupView === 'list' ? 'on' : ''} onClick={() => patch({ backupView: 'list' })}>預設：列表</button>
        </div>
      );
      case '/comm': return (
        <div className="mini-seg">
          <button className={commSet.ratio === '3:4' ? 'on' : ''} onClick={() => patchComm({ ratio: '3:4' })}>比例 3:4</button>
          <button className={commSet.ratio === '4:3' ? 'on' : ''} onClick={() => patchComm({ ratio: '4:3' })}>比例 4:3</button>
        </div>
      );
      // 行事曆月份顯示（v1.9）— AUGUST 2026 / 2026.08
      case '/cal': return (
        <div className="mini-seg">
          <button className={(ms.calTitle ?? 'en') === 'en' ? 'on' : ''} onClick={() => patch({ calTitle: 'en' })}>AUGUST 2026</button>
          <button className={ms.calTitle === 'num' ? 'on' : ''} onClick={() => patch({ calTitle: 'num' })}>2026.08</button>
        </div>
      );
      default: return null;
    }
  };

  // 各選單權限附加設定 — 權限分頁用（v1.9）
  const extraPerm = (href: string) => {
    // 角色扮演 — 未登入提示文字（管理員無法查看該畫面，因此在這裡編輯）
    if (href === '/rp') {
      return (
        <KInput value={rpGate}
          onChange={e => { setRpGate(e.target.value); setPageText('rp-gate-desc', e.target.value); }}
          placeholder="未登入提示文字" style={{ width: 210, fontSize: 12 }} />
      );
    }
    // 留言板文章撰寫・留言權限（依留言板） 
    if (href === '/board' || href.startsWith('/board?b=')) {
      const bid = href === '/board' ? MAIN_BOARD_ID : href.slice('/board?b='.length);
      const bd = boards.find(b => b.id === bid);
      if (!bd) return null;
      return (
        <>
          <KSelect minWidth={110} value={bd.permWrite}
            onChange={v => patchBoard(bd.id, { permWrite: v as BoardPerm })}
            options={[
              { value: 'member', label: '文章撰寫：註冊會員' },
              { value: 'admin', label: '文章撰寫：管理員' },
            ]} />
          <KSelect minWidth={110} value={bd.permComment}
            onChange={v => patchBoard(bd.id, { permComment: v as BoardPerm })}
            options={[
              { value: 'guest', label: '留言：訪客' },
              { value: 'member', label: '留言：註冊會員' },
              { value: 'admin', label: '留言：管理員' },
            ]} />
        </>
      );
    }
    if (href === '/loadb') {
      return (
        <>
          {permSel('上傳', ms.roadUpload, v => patch({ roadUpload: v }))}
          {permSel('留言', ms.roadComment, v => patch({ roadComment: v }))}
        </>
      );
    }
    // 圖庫文章撰寫權限（v2.0 使用者要求）— 每個區段 · 可透過「文章撰寫會員」指定特定會員
    if (href === '/gallery' || href.startsWith('/gallery?s=')) {
      const key = href === '/gallery' ? MAIN_SEC : href.slice('/gallery?s='.length);
      // 選單網址中可能寫的是別名（slug）— 統一使用 id 儲存
      const gsec = sectionsOf(secMap, 'gallery').find(s2 => s2.id === key || s2.slug === key);
      if (!gsec) return null;
      const gw = ms.galWrite?.[gsec.id] ?? 'member';
      const gwIds = ms.galWriteMembers?.[gsec.id];
      return (
        <>
          {gw === 'member' && (
            <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
              onClick={() => setMemAsk({
                ids: gwIds ?? [],
                desc: '只有勾選的會員（以及管理員）能在此圖庫發表文章 — 清空後則所有已登入會員都能發表',
                apply: n => {
                  const next = { ...ms.galWriteMembers };
                  if (n.length) next[gsec.id] = n; else delete next[gsec.id];
                  patch({ galWriteMembers: next });
                },
              })}>
              {gwIds?.length ? `文章撰寫會員 ${gwIds.length}名` : '文章撰寫會員'}
            </button>
          )}
          <KSelect minWidth={110} value={gw}
            onChange={v => {
              // 改成僅限管理員時，同時刪除會員選擇 — 避免悄悄殘留（與顯示限制相同規則）
              const next = { ...ms.galWriteMembers };
              if (v !== 'member') delete next[gsec.id];
              patch({ galWrite: { ...ms.galWrite, [gsec.id]: v as MenuPerm }, galWriteMembers: next });
            }}
            options={[
              { value: 'member', label: '文章撰寫：註冊會員' },
              { value: 'admin', label: '文章撰寫：管理員' },
            ]} />
        </>
      );
    }
    return null;
  };

  /* 「允許透過網址查看」（v2.0 使用者要求）— 在選單・Widget 中隱藏，但允許透過網址進入。
     用於建立只能透過連結前往的留言板，因此開啟時要透過 Modal 明確告知**知道網址的人都能看到**。
     （使用者要求）「全部顯示」時本來就能查看，因此隱藏此選項沒有意義 */
  const openChk = (v: MenuVis | undefined, open: boolean | undefined, onChange: (nv: boolean) => void) => (
    (v ?? 'all') === 'all' ? null : (
      <KCheck label={<span style={{ fontSize: 11 }}>允許透過網址查看</span>} checked={!!open}
        onChange={nv => { if (nv) setOpenAsk(() => () => onChange(true)); else onChange(false); }} />
    )
  );

  // 公開範圍選擇器（v1.9）— 選單本身的顯示：全部顯示／隱藏未登入／僅限管理員（草稿 — 透過 SAVE 套用）
  const visSel = (v: MenuVis | undefined, onChange: (nv: MenuVis) => void) => (
    <KSelect minWidth={128} value={v ?? 'all'} onChange={nv => onChange(nv as MenuVis)}
      options={[
        { value: 'all', label: '全部顯示' },
        { value: 'member', label: '隱藏未登入' },
        { value: 'admin', label: '僅限管理員' },
      ]} />
  );

  /* 會員選擇（v2.0 使用者要求）— 僅在「隱藏未登入」時顯示的按鈕。
     只會對搜尋 Modal 中選取的會員（＋管理員）顯示並允許進入 — 清空後則所有已登入會員都能看到 */
  const memberBtn = (v: MenuVis | undefined, ids: string[] | undefined, apply: (ids: string[] | undefined) => void) => (
    v !== 'member' ? null : (
      <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
        onClick={() => setMemAsk({ ids: ids ?? [], apply: n => apply(n.length ? n : undefined) })}>
        {ids?.length ? `會員 ${ids.length}名` : '選擇會員'}
      </button>
    )
  );
  return (
    <div className="set-sec">
      {/* 標題與其他分頁使用相同的起始位置（上方對齊）— 避免被按鈕列高度往下推 */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginBottom: 14 }}>
        <h3 style={{ margin: 0 }}>選單管理</h3>
        {dirty && <span style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 600, marginTop: 3 }}>尚未儲存的變更</span>}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost" style={{ padding: '6px 14px', fontSize: 11 }}
            onClick={() => setResetAsk(true)}>預設配置</button>
          <button className="btn btn-ghost" disabled={!dirty} style={{ opacity: dirty ? 1 : 0.45, padding: '6px 14px', fontSize: 11 }}
            onClick={() => { revert(); toast('已恢復為已儲存的選單'); }}>取消變更</button>
          <button className="btn btn-dark" disabled={!dirty} style={{ opacity: dirty ? 1 : 0.45, padding: '6px 18px', fontSize: 11 }}
            onClick={saveAll}>SAVE</button>
        </div>
      </div>
      {/* 基本（配置）／權限分頁（v1.9）— 權限設定過長，因此分開 */}
      <div className="mini-seg" style={{ marginBottom: 14 }}>
        <button className={mtab === 'basic' ? 'on' : ''} onClick={() => setMtab('basic')}>基本</button>
        <button className={mtab === 'perm' ? 'on' : ''} onClick={() => setMtab('perm')}>權限</button>
      </div>

      {mtab === 'perm' ? (
        /* ---------- 權限分頁 — 選單公開範圍＋各選單權限附加設定 ---------- */
        <div>
          <div className="d">
            公開範圍決定選單顯示方式（全部顯示／隱藏未登入／僅限管理員）— 按 SAVE 後才會套用 · 文章撰寫・留言權限會立即套用
            <br />
            「隱藏未登入」旁的<b>選擇會員</b>可縮小到只有特定會員能看到 — 清空後則所有已登入會員都能看到
            <br />
            開啟<b>允許透過網址查看</b>後，選單中仍會持續隱藏，但<b>知道網址的人可以直接進入</b>此選單 — 適合用於透過連結前往的留言板
          </div>
          {tree.map(g => (
            <div key={g.id} style={{ borderBottom: '1px dashed var(--line)', padding: '9px 0' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <b style={{ fontSize: 13 }}>{g.label}</b>
                {g.href && <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{g.href}</small>}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  {g.href && extraPerm(g.href)}
                  {openChk(g.vis, g.open, nv => patchGroup(g.id, { open: nv || undefined }))}
                  {memberBtn(g.vis, g.visMembers, ids => patchGroup(g.id, { visMembers: ids }))}
                  {visSel(g.vis, nv => patchGroup(g.id, {
                    vis: nv === 'all' ? undefined : nv,
                    ...(nv === 'all' ? { open: undefined } : {}),
                    ...(nv !== 'member' ? { visMembers: undefined } : {}),
                  }))}
                </div>
              </div>
              {!g.href && g.items.map(it => (
                <div key={it.href} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', padding: '6px 0 0 22px' }}>
                  <span style={{ fontSize: 12.5 }}>{it.label ?? defLabel(it.href)}</span>
                  <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{it.href}</small>
                  <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    {extraPerm(it.href)}
                    {openChk(it.vis, it.open, nv => patchGroup(g.id, {
                      items: g.items.map(x => (x.href === it.href ? { ...x, open: nv || undefined } : x)),
                    }))}
                    {memberBtn(it.vis, it.visMembers, ids => patchGroup(g.id, {
                      items: g.items.map(x => (x.href === it.href ? { ...x, visMembers: ids } : x)),
                    }))}
                    {visSel(it.vis, nv => patchGroup(g.id, {
                      items: g.items.map(x => (x.href === it.href
                        ? {
                          ...x, vis: nv === 'all' ? undefined : nv,
                          ...(nv === 'all' ? { open: undefined } : {}),
                          ...(nv !== 'member' ? { visMembers: undefined } : {}),
                        } : x)),
                    }))}
                  </div>
                </div>
              ))}
            </div>
          ))}
          {/* 套用至文章（v2.0 使用者要求）— 將公開範圍套用至伺服器 */}
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <b style={{ fontSize: 13 }}>設為文章私密</b>
            <div className="d" style={{ marginTop: 4, lineHeight: 1.7 }}>
              上述公開範圍只是<b>在畫面上隱藏</b>，因此直接輸入網址或呼叫 API 時，文章仍然會顯示。
              按下此按鈕後，會將<b>已上傳文章的公開範圍套用至伺服器</b>，讓伺服器完全不提供這些文章
              — 「隱藏未登入」會設為會員公開，「僅限管理員」會設為私密。
              <br />
              <b>從現在開始撰寫的文章不需要按這個按鈕，也會以相同方式儲存。</b>{' '}
              <span style={{ color: 'var(--accent)' }}>只會縮小公開範圍，不會擴大</span> —
              之後如果要重新公開，必須逐篇手動恢復各文章的公開範圍。
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
              <button className="btn btn-dark" disabled={visBusy || dirty}
                onClick={() => setVisAsk(true)}>
                {visBusy ? '套用中…' : dirty ? '請先 SAVE' : '套用至文章'}
              </button>
            </div>
          </div>
          {/* 會員選擇（v2.0 使用者要求）— 透過搜尋選取，只對該會員（＋管理員） */}
          {memAsk && (
            <MemberPickModal initial={memAsk.ids} onApply={memAsk.apply} desc={memAsk.desc}
              onClose={() => setMemAsk(null)} />
          )}

          {/* 「允許透過網址查看」確認（v2.0 使用者要求）— 開啟時明確說明會開放什麼 */}
          <ConfirmModal open={!!openAsk} title="將公開給所有知道網址的人"
            body={'選單中仍會持續隱藏，但知道此網址的人即使未登入也可以進入查看。如果收到連結的人將網址轉貼到其他地方，那些人也能查看。請勿將此功能用於絕對不能被公開的內容。'}
            onClose={() => setOpenAsk(null)}
            buttons={[
              { label: 'CANCEL', kind: 'ghost', onClick: () => setOpenAsk(null) },
              { label: '我知道了', kind: 'dark', onClick: () => { openAsk?.(); setOpenAsk(null); } },
            ]} />

          <ConfirmModal open={visAsk} title="要將文章公開範圍套用至伺服器嗎？"
            body={'設為私密的選單文章也會在伺服器端隱藏。每篇文章的公開範圍都會改變，因此若要恢復，必須逐篇手動修改。'}
            onClose={() => setVisAsk(false)}
            buttons={[
              { label: 'CANCEL', kind: 'ghost', onClick: () => setVisAsk(false) },
              { label: '套用', kind: 'dark', onClick: () => { setVisAsk(false); void applyVis(); } },
            ]} />

          {/* 圖片儲存防止（v1.9）— 各區域禁止右鍵・拖曳，管理員除外 · 立即套用 */}
          <div style={{ marginTop: 18 }}>
            <b style={{ fontSize: 13 }}>防止儲存圖片</b>
            <div className="d" style={{ marginTop: 4 }}>在勾選的區域禁止圖片右鍵儲存・拖曳匯出 — 管理員帳號除外 · 立即套用</div>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
              {IMG_PROTECT_AREAS.map(a => (
                <KCheck key={a.key} label={a.label}
                  checked={(ms.imgProtect ?? []).includes(a.key)}
                  onChange={v => patch({
                    imgProtect: v
                      ? [...(ms.imgProtect ?? []), a.key]
                      : (ms.imgProtect ?? []).filter(k => k !== a.key),
                  })} />
              ))}
            </div>
          </div>
        </div>
      ) : (
      <>
      <DragList items={tree} keyOf={g => g.id} onReorder={setTree}
        render={g => (
          <div style={{ width: '100%', borderBottom: '1px dashed var(--line)', padding: '10px 0' }}>
            <div className="set-row" style={{ border: 'none', padding: 0 }}>
              <div className="l" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="drag-h">⠿</span>
                <KInput value={g.label} onChange={e => patchGroup(g.id, { label: e.target.value })}
                  style={{ width: 110, fontWeight: 700 }} />
                {g.href ? (
                  <>
                    <span className="cp-lb">標題</span>
                    <KInput value={g.pageTitle ?? ''} placeholder="預設"
                      onChange={e => patchGroup(g.id, { pageTitle: e.target.value || undefined })}
                      style={{ width: 120, fontSize: 12 }} />
                    <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>獨立 · {g.href}</small>
                  </>
                ) : <span className="pill">上層</span>}
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {g.href && extraFor(g.href)}
                <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                  onClick={() => askRemoveGroup(g)}>{g.href ? '移除' : 'DELETE'}</button>
              </div>
            </div>
            {/* 下層選單 — 群組內排序（⠿）・名稱・移動・移除＋附加設定 */}
            {!g.href && (
              <div style={{ padding: '8px 0 0 34px' }}>
                <DragList items={g.items} keyOf={it => it.href}
                  onReorder={items => patchGroup(g.id, { items })}
                  render={it => (
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', width: '100%', padding: '3px 0' }}>
                      <span className="drag-h" style={{ fontSize: 11 }}>⠿</span>
                      <KInput value={it.label ?? ''} placeholder={defLabel(it.href)}
                        onChange={e => patchGroup(g.id, {
                          items: g.items.map(x => (x.href === it.href
                            ? { ...x, label: e.target.value || undefined } : x)),
                        })}
                        style={{ width: 110, fontSize: 12 }} />
                      <span className="cp-lb">標題</span>
                      <KInput value={it.pageTitle ?? ''} placeholder="預設"
                        onChange={e => patchGroup(g.id, {
                          items: g.items.map(x => (x.href === it.href
                            ? { ...x, pageTitle: e.target.value || undefined } : x)),
                        })}
                        style={{ width: 120, fontSize: 12 }} />
                      <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{it.href}</small>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                        {extraFor(it.href)}
                        <KSelect minWidth={104} value="" placeholder="移動"
                          onChange={v => moveItem(g.id, it, v)} options={groupOptions(g.id)} />
                        <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 10.5 }}
                          onClick={() => removeItem(g.id, it.href)}>移除</button>
                      </div>
                    </div>
                  )} />
                {g.items.length === 0 && (
                  <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>沒有下層選單時，不會顯示在上方選單 — 請從下方「未配置功能」新增</small>
                )}
              </div>
            )}
          </div>
        )} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setTree([...tree, { id: newGroupId(), label: '새 메뉴', items: [] }])}>＋ ADD MENU</button>
      </div>

      <h3 style={{ marginTop: 26 }}>未配置功能</h3>
      <div className="d">未放入樹狀結構的功能 — 不會顯示在選單中，但資料會保留。選擇要放置的位置後會立即配置</div>
      {unplaced.map(f => {
        // 自訂連結即使在未配置列表中也可以刪除（v2.0 使用者要求 — 「想直接從列表中刪除」）。
        // 其他功能（留言板・區段等）有資料存在，因此無法在這裡刪除 — 請在各自的管理畫面處理
        const link = links.find(l => l.href === f.href);
        return (
          <div key={f.href} className="set-row">
            <div className="l" style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
              <b style={{ fontSize: 12.5 }}>{f.label}</b>
              <small style={{ color: 'var(--faint)', fontSize: 10.5 }}>{f.href}</small>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <KSelect minWidth={130} value="" placeholder="配置位置"
                onChange={v => placeUnplaced(f.href, v)} options={groupOptions()} />
              {link && (
                <button className="btn btn-ghost" style={{ padding: '3px 9px', fontSize: 10.5 }}
                  onClick={() => del.ask(`確定要刪除自訂連結「${link.name}」嗎？`,
                    () => setLinks(links.filter(x => x.id !== link.id)),
                    '只會刪除連結本身 — 它所指向的頁面仍然存在。')}>刪除</button>
              )}
            </div>
          </div>
        );
      })}
      {unplaced.length === 0 && (
        <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--faint)' }}>所有功能都已配置到選單中</div>
      )}

      {/* 自訂連結（v2.0 使用者要求）— 將網站內任何頁面加入選單。
          建立後會出現在上方未配置列表，再從那裡加入想要的上層選單 */}
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 22 }}>
        <h3 style={{ margin: 0 }}>自訂連結</h3>
      </div>
      <div className="d">
        原本需要從列表中選擇才能前往的自設關係・角色等頁面，現在可以直接從選單進入 — 只要填入網址即可。
        <br />
        <b>我的首頁網址</b>貼上後會轉換成網站內部導向（例如：<code>…/rels/latte</code> → <code>/rels/latte</code>），
        <b>其他網站網址</b>則會保持原樣並在新視窗開啟。
        建立的連結會出現在上方的<b>未配置</b>列表中，請從那裡加入想要的上層選單。
      </div>
      {links.map(l => (
        <div key={l.id} className="set-row">
          <div className="l" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <KInput value={l.name} placeholder="選單顯示名稱"
              onChange={e => setLinks(links.map(x => (x.id === l.id ? { ...x, name: e.target.value } : x)))}
              style={{ width: 140 }} />
            <KInput value={l.href} placeholder="/rels/latte 或完整網址"
              onChange={e => setLinks(links.map(x => (x.id === l.id ? { ...x, href: e.target.value } : x)))}
              onBlur={e => setLinks(links.map(x => (x.id === l.id ? { ...x, href: toInternalPath(e.target.value) } : x)))}
              style={{ width: 260 }} />
          </div>
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
            onClick={() => del.ask(`確定要刪除自訂連結「${l.name}」嗎？`,
              () => {
                setLinks(links.filter(x => x.id !== l.id));
                // 如果已配置到選單，也一併清除該位置 — 否則會留下不存在的網址，點擊後不會有任何反應
                setTree(tree.map(g => ({ ...g, items: g.items.filter(i => i.href !== l.href) })).filter(g => g.href !== l.href));
              },
              '如果已配置到選單，該位置也會一併清除。它所指向的頁面仍然存在。')}>DELETE</button>
        </div>
      ))}
      {links.length === 0 && (
        <div style={{ padding: '10px 0', fontSize: 12, color: 'var(--faint)' }}>目前還沒有 — 請在下方輸入名稱與網址後按 ADD</div>
      )}
      {/* 新連結必須填寫表單後按 ADD 才會登錄（v2.0 使用者回報）—
          以前會立即建立空白資料列，因此輸入網址的瞬間，未配置列表中就會出現沒有名稱的連結 */}
      <div className="set-row" style={{ borderTop: '1px dashed var(--line)' }}>
        <div className="l" style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <KInput value={nlName} placeholder="選單顯示名稱" onChange={e => setNlName(e.target.value)} style={{ width: 140 }} />
          <KInput value={nlHref} placeholder="/rels/latte 或完整網址" onChange={e => setNlHref(e.target.value)} style={{ width: 260 }} />
        </div>
        <button className="btn btn-dark" style={{ padding: '4px 12px', fontSize: 10.5 }}
          onClick={() => {
            if (!nlName.trim()) { toast('請輸入選單顯示名稱'); return; }
            const href = toInternalPath(nlHref);
            if (!href || href === '/') { toast('請輸入要前往的網址'); return; }
            setLinks([...links, { id: newId(), name: nlName.trim(), href }]);
            setNlName(''); setNlHref('');
            toast('連結已建立 — 請從上方未配置列表加入選單');
          }}>＋ ADD</button>
      </div>
      </>
      )}

            {del.element}
      {/* 基本配置重設確認 (v1.9) — 只替換草稿，透過 SAVE 確認 */}
      <ConfirmModal open={resetAsk} title="要將選單恢復為基本配置嗎？"
        body="編輯畫面會變更為預設提供的選單配置（自設遊戲・留言板・TRPG・委託・紀錄・訪客留言）。必須按下 SAVE 才會實際套用到選單。"
        onClose={() => setResetAsk(false)}
        buttons={[
          { label: 'RESET', kind: 'dark', onClick: () => { setDraft(defaultTree()); setDraftRemoved([]); setResetAsk(false); } },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setResetAsk(false) },
        ]} />
      {/* 未儲存的選單變更離開警告 (v1.9) */}
      <ConfirmModal open={leaveAsk} title="選單尚未儲存"
        body="如果就這樣離開，編輯中的選單變更將會消失。"
        onClose={() => { pendingClick.current = null; setLeaveAsk(false); }}
        buttons={[
          { label: '儲存後離開', kind: 'dark', onClick: () => leaveWith('save') },
          { label: '不儲存並離開', kind: 'ghost', onClick: () => leaveWith('discard') },
          { label: 'CANCEL', kind: 'ghost', onClick: () => { pendingClick.current = null; setLeaveAsk(false); } },
        ]} />
    </div>
  );
}

/** TRPG 分頁 (4.15, v1.9) — 橡果狀態分類標籤＋徽章顏色＋遊玩紀錄顯示欄位 */
function TrpgPane() {
  const [settings, patch] = useTrpgSettings();
  const [ms, patchMenu] = useMenuSettings();   // 遊玩紀錄顯示欄位 (4.16 — 儲存位置為選單設定)
  // 設定密碼的日誌說明文字 (pagetext 'trpg-lock-desc')
  const [lockDesc, setLockDesc] = useState('');
  useEffect(() => { setLockDesc(getPageText('trpg-lock-desc', '輸入密碼後即可查看')); }, []);
  const patchStatus = (k: DotoriStatus, p: Partial<(typeof settings.statuses)[DotoriStatus]>) =>
    patch({ statuses: { ...settings.statuses, [k]: { ...settings.statuses[k], ...p } } });
  // 等寬欄位網格 — 項目寬度不會受到標籤長度影響，因此 PC／手機兩行會垂直對齊 (v1.9)
  const colToggle = (list: string[], k: keyof MenuSettings) => (
    <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${PLAYLOG_COLS.length}, 1fr)`, gap: 6, justifyItems: 'center' }}>
      {PLAYLOG_COLS.map(c => (
        <KCheck key={c.key} label={c.label} checked={list.includes(c.key)}
          onChange={v => patchMenu({ [k]: v ? [...list, c.key] : list.filter(x => x !== c.key) } as Partial<MenuSettings>)} />
      ))}
    </div>
  );
  return (
    <div className="set-sec">
      {/* 設定密碼的日誌說明文字 — 管理員無法看到該畫面，因此在這裡編輯（使用者要求） */}
      <h3>日誌查看說明文字</h3>
      <div className="d">進入設定密碼的日誌時會顯示的文字 — 管理員不會看到該畫面，因此在這裡修改</div>
      <div className="set-row" style={{ alignItems: 'center' }}>
        <div className="l"><b>密碼提示</b><small>留空時會顯示預設文字</small></div>
        <KInput value={lockDesc}
          onChange={e => { setLockDesc(e.target.value); setPageText('trpg-lock-desc', e.target.value); }}
          placeholder="輸入密碼後即可查看" style={{ width: 300 }} />
      </div>

      <h3>橡果狀態分類</h3>
      <div className="d">標籤與徽章顏色（背景／邊框／文字）— 卡片徽章只顯示空頭支票・行程確定</div>
      {DOTORI_STATUS_KEYS.map(k => {
        const st = settings.statuses[k];
        return (
          <div key={k} className="set-row" style={{ alignItems: 'center' }}>
            <div className="l">
              <span className="dt-badge" style={{ ...dotoriBadgeStyle(st), position: 'static' }}>{st.label || '狀態'}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              <KInput value={st.label} onChange={e => patchStatus(k, { label: e.target.value })}
                style={{ width: 100, textAlign: 'right' }} />
              <span className="cp-lb">背景</span>
              <ColorField value={st.bg} onChange={hex => patchStatus(k, { bg: hex })} />
              <span className="cp-lb">邊框</span>
              <ColorField value={st.border} onChange={hex => patchStatus(k, { border: hex })} />
              <span className="cp-lb">文字</span>
              <ColorField value={st.fg} onChange={hex => patchStatus(k, { fg: hex })} />
            </div>
          </div>
        );
      })}

      {/* 遊玩紀錄顯示欄位 — PC／手機分別設定 (4.16 v1.8 · v1.9 移至 TRPG 分頁底部) */}
      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />
      <h3>遊玩紀錄顯示欄位</h3>
      <div className="d">分別選擇 PC 與手機要顯示的欄位（預設：PC 全部 7 欄 · 手機 Date/Scenario/Role/Playtime）</div>
      {/* 固定標籤寬度 — 避免 PC／手機寬度差異造成兩行核取方塊起始位置錯位 (v1.9) */}
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l" style={{ width: 64, flexShrink: 0 }}><b>PC</b></div>
        {colToggle(ms.playlogPc, 'playlogPc')}
      </div>
      <div className="set-row" style={{ flexWrap: 'wrap' }}>
        <div className="l" style={{ width: 64, flexShrink: 0 }}><b>手機</b></div>
        {colToggle(ms.playlogMobile, 'playlogMobile')}
      </div>
    </div>
  );
}

/** 備忘錄分頁 (4.6) — 撰寫權限＋作者顯示 */
function MemoPane() {
  const [settings, patch] = useMemoSettings();
  return (
    <div className="set-sec">
      <h3>便利貼備忘錄</h3>
      <div className="d">便利貼板選項 — 位置與順序會儲存，所有人看到的內容相同</div>
      <div className="set-row">
        <div className="l"><b>允許會員撰寫</b><small>關閉後只有管理員可以貼備忘錄</small></div>
        <KToggle checked={settings.allowMember} onChange={v => patch({ allowMember: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>顯示作者</b><small>在便利貼上方顯示作者暱稱</small></div>
        <KToggle checked={settings.showAuthor} onChange={v => patch({ showAuthor: v })} />
      </div>
    </div>
  );
}

/** 感想串分頁 (4.17) — 分類列表管理＋預設檢視 */
function ThreadPane() {
  const [settings, patch] = useThreadSettings();
  const [works] = useLocalList<ThreadWork>('ohome.threads.v1', THREAD_SEED);
  const del = useConfirmDelete();
  /* 分類會依每個感想串分開設定 (v2.0 使用者要求) — 如果建立了多個，
     要先選擇要修改哪一個的分類。只有一個時沒有可選項目，因此完全不顯示選擇列。 */
  const { list } = useSections();
  const secs = list('threads');
  const [secId, setSecId] = useState(MAIN_SEC);
  const cur = secs.find(s => s.id === secId) ? secId : MAIN_SEC;
  const cats = threadCats(settings, cur);
  const setCats = (next: ThreadCat[]) => patch(threadCatsPatch(settings, cur, next));
  const patchCat = (id: string, p: Partial<ThreadCat>) =>
    setCats(cats.map(c => (c.id === id ? { ...c, ...p } : c)));
  return (
    <div className="set-sec">
      <h3>預設檢視</h3>
      <div className="d">進入感想串選單時首先顯示的檢視</div>
      <div className="set-row">
        <div className="l"><b>第一個畫面</b><small>感想串檢視／列表檢視（海報卡片網格）</small></div>
        <div className="mini-seg">
          <button className={settings.defaultView === 'thread' ? 'on' : ''}
            onClick={() => patch({ defaultView: 'thread' })}>感想串檢視</button>
          <button className={settings.defaultView === 'list' ? 'on' : ''}
            onClick={() => patch({ defaultView: 'list' })}>列表檢視</button>
        </div>
      </div>

      <h3 style={{ marginTop: 26 }}>分類列表</h3>
      <div className="d">
        作品分類徽章 — 名稱 · 背景／邊框／文字顏色 · ⠿ 透過拖曳排序 · 新增／刪除
        {secs.length > 1 && <><br />每個感想串分別設定 — <b>在修改前會直接使用預設感想串的分類</b></>}
      </div>
      {secs.length > 1 && (
        <div className="mini-seg" style={{ flexWrap: 'wrap', marginBottom: 10 }}>
          {secs.map(s => (
            <button key={s.id} className={cur === s.id ? 'on' : ''} onClick={() => setSecId(s.id)}>{s.name}</button>
          ))}
        </div>
      )}
      <DragList items={cats} keyOf={c => c.id} onReorder={next => setCats(next)}
        render={c => (
          <div className="set-row" style={{ width: '100%' }}>
            <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
              <span className="drag-h">⠿</span>
              <span className="pill" style={threadBadgeStyle(c)}>{c.label || '分類'}</span>
            </div>
            <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
              <KInput value={c.label} onChange={e => patchCat(c.id, { label: e.target.value })}
                style={{ width: 100, textAlign: 'right' }} />
              <span className="cp-lb">背景</span>
              <ColorField value={c.bg ?? '#1d2025'} onChange={hex => patchCat(c.id, { bg: hex })} />
              <span className="cp-lb">邊框</span>
              <ColorField value={c.border ?? c.bg ?? '#1d2025'} onChange={hex => patchCat(c.id, { border: hex })} />
              <span className="cp-lb">文字</span>
              <ColorField value={c.fg ?? '#ffffff'} onChange={hex => patchCat(c.id, { fg: hex })} />
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => {
                  const used = works.filter(w => w.catId === c.id && inSection(w.secId, cur)).length;
                  del.ask(`要刪除分類「${c.label}」嗎？`,
                    () => setCats(cats.filter(x => x.id !== c.id)),
                    used > 0 ? `此分類的 ${used} 個感想串會保留，但分類會顯示為「其他」。` : undefined);
                }}>DELETE</button>
            </div>
          </div>
        )} />
      <div style={{ marginTop: 10, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => setCats([...cats, { id: newId(), label: '새 분류' }])}>
          ＋ ADD
        </button>
      </div>
      {del.element}
    </div>
  );
}

/** 委託分頁 (4.18) — 徽章形狀・委託／申請者徽章樣式・全部欄位・申請者列表公開範圍・縮圖比例 */
function CommBadgeRows({ list, shape, onChange, fixedIds }: {
  list: CommBadge[]; shape: 'round' | 'pill';
  onChange: (next: CommBadge[]) => void;
  fixedIds: string[];                      // 預設提供的徽章 — 不可刪除
}) {
  const del = useConfirmDelete();
  const patch = (id: string, p: Partial<CommBadge>) =>
    onChange(list.map(b => (b.id === id ? { ...b, ...p } : b)));
  return (
    <>
      {list.map(b => (
        <div key={b.id} className="set-row" style={{ alignItems: 'center' }}>
          {/* 左側：只顯示一個徽章預覽 (4.18 — 不重複顯示標籤) */}
          <div className="l"><span style={badgeStyle(b, shape)}>{b.label || '徽章'}</span></div>
          {/* 右側群組：文字輸入框（最前方・靠右對齊）＋背景／邊框／文字顏色 */}
          <div className="cp-group" style={{ justifyContent: 'flex-end' }}>
            <KInput value={b.label} onChange={e => patch(b.id, { label: e.target.value })}
              style={{ width: 90, textAlign: 'right' }} />
            <span className="cp-lb">背景</span>
            <ColorField value={b.bg} onChange={hex => patch(b.id, { bg: hex })} />
            <span className="cp-lb">邊框</span>
            <ColorField value={b.border} onChange={hex => patch(b.id, { border: hex })} />
            <span className="cp-lb">文字</span>
            <ColorField value={b.fg} onChange={hex => patch(b.id, { fg: hex })} />
            {!fixedIds.includes(b.id) && (
              <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
                onClick={() => del.ask(`要刪除徽章「${b.label}」嗎？`, () => onChange(list.filter(x => x.id !== b.id)), '使用此徽章的項目會顯示為沒有徽章。')}>DELETE</button>
            )}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 8, display: 'flex', justifyContent: 'flex-end' }}>
        <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }}
          onClick={() => onChange([...list, { id: newId(), label: '새 뱃지', bg: '#5d636d', border: '#4a505a', fg: '#ffffff' }])}>
          ＋ ADD BADGE
        </button>
      </div>
      {del.element}
    </>
  );
}

function CommPane() {
  const [st, patch] = useCommSettings();
  return (
    <div className="set-sec">
      <h3>委託</h3>
      <div className="d">委託列表・詳細・申請者列表的徽章與欄位設定 — 變更立即套用</div>

      <div className="set-row">
        <div className="l"><b>縮圖比例</b><small>統一套用至整個委託圖庫</small></div>
        <div className="mini-seg">
          <button className={st.ratio === '3:4' ? 'on' : ''} onClick={() => patch({ ratio: '3:4' })}>3:4 直向</button>
          <button className={st.ratio === '4:3' ? 'on' : ''} onClick={() => patch({ ratio: '4:3' })}>4:3 橫向</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>徽章形狀</b><small>委託・申請者徽章共用</small></div>
        <div className="mini-seg">
          <button className={st.badgeShape === 'round' ? 'on' : ''} onClick={() => patch({ badgeShape: 'round' })}>圓角方形</button>
          <button className={st.badgeShape === 'pill' ? 'on' : ''} onClick={() => patch({ badgeShape: 'pill' })}>圓形膠囊</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>全部欄位</b><small>可同時接受的總欄位 — 在列表上方顯示剩餘／全部（手動更新）</small></div>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>總數</span>
          <KStep value={st.totalSlot} min={1} max={50} onChange={v => patch({ totalSlot: v, totalUsed: Math.min(st.totalUsed, v) })} />
          <span style={{ fontSize: 11.5, color: 'var(--sub)' }}>已使用</span>
          <KStep value={st.totalUsed} min={0} max={st.totalSlot} onChange={v => patch({ totalUsed: v })} />
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>欄位顯示基準</b><small>在列表・詳細中寫成 3/5 時，前面的數字要代表什麼 — 依營運方式而異</small></div>
        <div className="mini-seg">
          <button className={(st.slotDisplay ?? 'used') === 'used' ? 'on' : ''} onClick={() => patch({ slotDisplay: 'used' })}>已填滿欄位</button>
          <button className={st.slotDisplay === 'remain' ? 'on' : ''} onClick={() => patch({ slotDisplay: 'remain' })}>剩餘欄位</button>
        </div>
      </div>

      <div className="set-row">
        <div className="l"><b>申請者列表公開範圍</b><small>列表本身的公開範圍 — 各申請內容另外判定（管理員／獲准的本人）</small></div>
        <KSelect minWidth={130} value={st.applyVisibility} onChange={v => patch({ applyVisibility: v as CommSettings['applyVisibility'] })}
          options={[
            { value: 'public', label: '完全公開' },
            { value: 'member', label: '會員公開' },
            { value: 'private', label: '私密' },
          ]} />
      </div>

      <div className="set-row">
        <div className="l"><b>申請垃圾桶保留期間</b><small>移至垃圾桶的申請要保留幾天後刪除 — 超過期間後，開啟列表時會自動消失</small></div>
        <KStep value={st.trashDays ?? 30} min={1} max={365} suffix="日" onChange={v => patch({ trashDays: v })} />
      </div>

      <h3 style={{ marginTop: 26 }}>委託徽章</h3>
      <div className="d">預設 3 種（招募中・截止・準備中）固定提供 — 文字與顏色可自由修改</div>
      <CommBadgeRows list={st.commBadges} shape={st.badgeShape} fixedIds={['open', 'closed', 'ready']}
        onChange={next => patch({ commBadges: next })} />

      <hr style={{ margin: '24px 0', border: 'none', borderTop: '1.5px solid var(--line)' }} />

      <h3>申請者列表徽章</h3>
      <div className="d">等待・作業中・完成 — 與委託徽章使用不同的顏色變數</div>
      <CommBadgeRows list={st.applyBadges} shape={st.badgeShape} fixedIds={['wait', 'working', 'done']}
        onChange={next => patch({ applyBadges: next })} />
    </div>
  );
}

/** BGM 曲目單行 — 行內修改（標題／說明／URL）＋刪除確認 */
function BgmTrackRow({ t, onPatch, onDelete }: {
  t: BgmTrack; onPatch: (p: Partial<BgmTrack>) => void; onDelete: () => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(t.title);
  const [desc, setDesc] = useState(t.desc);
  const [url, setUrl] = useState(t.videoId);

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 7, padding: '10px 0', borderBottom: '1px dashed var(--line)', width: '100%' }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
          <KInput placeholder="歌曲標題" value={title} onChange={e => setTitle(e.target.value)} style={{ maxWidth: 150 }} />
          <KInput placeholder="說明（選填）" value={desc} onChange={e => setDesc(e.target.value)} style={{ flex: 1, minWidth: 130 }} />
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          <KInput placeholder="YouTube URL 或影片 ID" value={url} onChange={e => setUrl(e.target.value)} />
          <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }}
            onClick={() => {
              const vid = parseVideoId(url);
              if (!title.trim() || !vid) { toast('請輸入標題與有效的 YouTube URL（或影片 ID）'); return; }
              onPatch({ title: title.trim(), desc: desc.trim(), videoId: vid });
              setEditing(false);
              toast('歌曲已修改');
            }}>SAVE</button>
          <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
            onClick={() => { setEditing(false); setTitle(t.title); setDesc(t.desc); setUrl(t.videoId); }}>CANCEL</button>
        </div>
      </div>
    );
  }

  return (
    <div className="set-row" style={{ width: '100%' }}>
      <div className="l" style={{ display: 'flex', gap: 11, alignItems: 'center' }}>
        <span className="drag-h">⠿</span>
        <div><b>{t.title}</b><small>{t.desc || t.videoId}</small></div>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={() => setEditing(true)}>EDIT</button>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={onDelete}>DELETE</button>
      </div>
    </div>
  );
}

/** BGM 分頁 (5.2 v1.9) — 登錄曲目列表（顯示於迷你播放器列表）＋播放設定 */
function BgmPane() {
  const { state, setTracks, addTrack, removeTrack, setSettings } = useBgm();
  const toast = useToast();
  const del = useConfirmDelete();
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [url, setUrl] = useState('');

  const add = () => {
    if (addTrack(title, desc, url)) {
      setTitle(''); setDesc(''); setUrl('');
      toast('歌曲已新增');
    } else {
      toast('請輸入標題與有效的 YouTube URL（或影片 ID）');
    }
  };

  return (
    <div className="set-sec">
      <h3>BGM</h3>
      <div className="d">YouTube 曲目列表管理 — 顯示於迷你播放器列表 · 隱藏畫面，只播放聲音</div>

      <DragList
        items={state.tracks}
        keyOf={t => t.id}
        onReorder={setTracks}
        render={t => (
          <BgmTrackRow t={t}
            onPatch={p => setTracks(state.tracks.map(x => (x.id === t.id ? { ...x, ...p } : x)))}
            onDelete={() => del.ask(`要刪除歌曲「${t.title}」嗎？`, () => removeTrack(t.id))} />
        )}
      />
      {del.element}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <KInput placeholder="歌曲標題" value={title} onChange={e => setTitle(e.target.value)} style={{ maxWidth: 150 }} />
        <KInput placeholder="說明（選填）" value={desc} onChange={e => setDesc(e.target.value)} style={{ maxWidth: 130 }} />
        <KInput placeholder="YouTube URL 或影片 ID" value={url} onChange={e => setUrl(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        <button className="btn btn-dark" onClick={add}>＋ ADD</button>
      </div>

      <div className="set-row" style={{ marginTop: 16 }}>
        <div className="l"><b>預設音量</b></div>
        <KStep value={state.settings.volume} min={0} max={100} suffix="%" onChange={v => setSettings({ volume: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>播放器位置</b><small>預設：右下方</small></div>
        <div className="mini-seg">
          <button className={state.settings.position === 'br' ? 'on' : ''} onClick={() => setSettings({ position: 'br' })}>右下方</button>
          <button className={state.settings.position === 'bl' ? 'on' : ''} onClick={() => setSettings({ position: 'bl' })}>左下方</button>
        </div>
      </div>
      <div className="set-row">
        <div className="l"><b>隨機播放</b></div>
        <KToggle checked={state.settings.shuffle} onChange={v => setSettings({ shuffle: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>循環播放</b><small>列表結束後從第一首開始</small></div>
        <KToggle checked={state.settings.repeat} onChange={v => setSettings({ repeat: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>顯示播放器</b><small>關閉後網站上的 BGM 播放器會消失</small></div>
        <KToggle checked={state.settings.enabled} onChange={v => setSettings({ enabled: v })} />
      </div>
      <div className="set-row">
        <div className="l"><b>播放方式</b><small>自動：進入後第一次點擊／按鍵輸入的瞬間播放（受瀏覽器政策限制，無法完全無操作自動播放） · 手動：必須按下播放按鈕才能播放</small></div>
        <div className="mini-seg">
          <button className={state.settings.autoplay ? 'on' : ''}
            onClick={() => setSettings({ autoplay: true })}>進入時自動播放</button>
          <button className={!state.settings.autoplay ? 'on' : ''}
            onClick={() => setSettings({ autoplay: false })}>按下按鈕後播放</button>
        </div>
      </div>
    </div>
  );
}

/** 字型列表單行 — 顯示 CSS URL · 修改（名稱／family／URL，上傳字型則為名稱／韓文配對）· 刪除 */
function FontRow({ f }: { f: FontDef }) {
  const { fonts, familyOf, updateFont, removeFont, resetFont, setFontPair } = useFonts();
  const del = useConfirmDelete();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(f.name);
  const [family, setFamily] = useState(f.family);
  const [cssUrl, setCssUrl] = useState(fontCssUrl(f) ?? '');

  if (editing) {
    return (
      <div style={{ display: 'grid', gap: 7, padding: '10px 0', borderBottom: '1px dashed var(--line)' }}>
        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', alignItems: 'center' }}>
          <KInput placeholder="顯示名稱" value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 160 }} />
          {f.fileId ? (
            /* 上傳字型 — family 自動設定，只指定韓文配對 (v1.9) */
            <>
              <span className="cp-lb">韓文配對</span>
              <KSelect minWidth={150} value={f.pairId ?? ''}
                onChange={v => setFontPair(f.id, v || undefined)}
                options={[{ value: '', label: '無配對' },
                  ...fonts.filter(x => x.id !== f.id).map(x => ({ value: x.id, label: x.name }))]} />
            </>
          ) : (
            <>
              <KInput placeholder="font-family 值" value={family} onChange={e => setFamily(e.target.value)} style={{ flex: 1, minWidth: 160 }} />
              {/* 網頁字型也可以指定韓文配對 (v1.9) */}
              <span className="cp-lb">韓文配對</span>
              <KSelect minWidth={140} value={f.pairId ?? ''}
                onChange={v => setFontPair(f.id, v || undefined)}
                options={[{ value: '', label: '無配對' },
                  ...fonts.filter(x => x.id !== f.id).map(x => ({ value: x.id, label: x.name }))]} />
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 7 }}>
          {!f.fileId && <KInput placeholder="CSS URL" value={cssUrl} onChange={e => setCssUrl(e.target.value)} />}
          <button className="btn btn-dark" style={{ whiteSpace: 'nowrap', marginLeft: f.fileId ? 'auto' : undefined }}
            onClick={() => {
              if (updateFont(f.id, { name, family: f.fileId ? f.family : family, cssUrl: f.fileId ? '' : cssUrl })) { setEditing(false); toast('字型已修改'); }
              else toast('請輸入名稱與 font-family 值');
            }}>SAVE</button>
          {/* 將內建字型恢復為初始狀態 (v2.0 使用者發現) — 一次恢復名稱・family・韓文配對。
              之前沒有方法解除錯誤輸入的值（錯誤的 family、指向已刪除字型的配對） */}
          {f.builtin && (
            <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
              onClick={() => {
                resetFont(f.id);
                setEditing(false);
                toast(`已將「${f.name}」恢復為初始狀態`);
              }}>恢復預設值</button>
          )}
          <button className="btn btn-ghost" style={{ whiteSpace: 'nowrap' }}
            onClick={() => { setEditing(false); setName(f.name); setFamily(f.family); setCssUrl(fontCssUrl(f) ?? ''); }}>CANCEL</button>
        </div>
      </div>
    );
  }

  return (
    <div className="set-row">
      <div className="l" style={{ minWidth: 0 }}>
        {/* 預覽會套用配對字型堆疊 — 英文字型＋韓文配對時，韓文會使用配對字型顯示 (v1.9) */}
        {/* familyOf 會連配對一起組合，var(--serif) 等別名也會展開為原始字型堆疊 (v2.0) */}
        <b style={{ fontFamily: familyOf(f.id), fontSize: 15 }}>{f.name} — 가나다 ABC 123</b>
        <small style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {f.fileId
            ? `已上傳檔案 — ${f.fileName ?? '字型檔案'}${f.pairId ? ` · 韓文配對：${fonts.find(x => x.id === f.pairId)?.name ?? ''}` : ''}`
            : `${fontCssUrl(f) ?? (f.locked ? '網站預設字型堆疊 — 無另外的 URL' : '從網站 CSS 載入')}${f.pairId ? ` · 韓文配對：${fonts.find(x => x.id === f.pairId)?.name ?? ''}` : ''}`}
        </small>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
        <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
          onClick={() => setEditing(true)}>EDIT</button>
        {!f.locked && (
          <button className="btn btn-ghost" style={{ padding: '4px 10px', fontSize: 10.5 }}
            onClick={() => del.ask(`要刪除字型「${f.name}」嗎？`, () => removeFont(f.id),
                f.builtin
                  ? '預設字型只會從列表中移除 — 可以透過下方的 [復原] 按鈕恢復，而且使用此字型的項目顯示不會改變。'
                  // 直接登錄的字型會連定義一起消失，因此原本指向的位置也會一併整理 (v2.0)
                  : '直接登錄的字型無法復原。指定使用此字型的位置（角色字型・韓文配對）會恢復為預設值。')}>DELETE</button>
        )}
      </div>
      {del.element}
    </div>
  );
}

/** 字型分頁 (5.1) — 內建字型也可修改・刪除・登錄網頁字型 URL。檔案上傳・配對功能後續加入 */
function FontPane() {
  const { fonts, hiddenCount, addFont, addFontFile, restoreBuiltins } = useFonts();
  const toast = useToast();
  const [name, setName] = useState('');
  const [family, setFamily] = useState('');
  const [cssUrl, setCssUrl] = useState('');
  // 新增網頁字型的韓文配對 (v1.9) — 勾選後即可指定
  const [webPairOn, setWebPairOn] = useState(false);
  const [webPair, setWebPair] = useState('');
  // 字型檔案上傳 (v1.9) — 顯示名稱直接使用檔名（可在 EDIT 中修改，使用者確認）
  const [upPair, setUpPair] = useState('');
  const uploadFontFile = async (f: File | undefined) => {
    if (!f) return;
    const name = f.name.replace(/\.(woff2?|ttf|otf)$/i, '');
    if (await addFontFile(name, f, upPair || undefined)) { setUpPair(''); toast(`已登錄「${name}」字型`); }
  };

  return (
    <div className="set-sec">
      <h3>字型庫</h3>
      <div className="d">可在角色個人資料・自設名稱・劇本標題等位置從此列表選擇使用 — 可以刪除，只保留想要的字型</div>

      {fonts.map(f => <FontRow key={f.id} f={f} />)}
      {hiddenCount > 0 && (
        <div style={{ marginTop: 10 }}>
          <button className="btn btn-ghost" style={{ padding: '5px 12px', fontSize: 11 }} onClick={restoreBuiltins}>
            恢復已刪除的預設字型 {hiddenCount} 個
          </button>
        </div>
      )}
      <p className="hint">即使刪除，已經使用該字型的角色・自設關係顯示也不會損壞 — 只會從選擇列表中移除</p>

      <div style={{ display: 'grid', gap: 8, marginTop: 14 }}>
        <label className="k-label" style={{ margin: 0 }}>新增網頁字型 — 눈누／Google Fonts 的 CSS 連結（URL）與 font-family 值</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <KInput placeholder="顯示名稱" value={name} onChange={e => setName(e.target.value)} style={{ maxWidth: 130 }} />
          <KInput placeholder="font-family 值" value={family}
            onChange={e => setFamily(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <KInput placeholder="CSS URL (https://fonts.googleapis.com/... 或 눈누 連結)" value={cssUrl}
            onChange={e => setCssUrl(e.target.value)} />
          <button className="btn btn-dark" style={{ whiteSpace: 'nowrap' }}
            onClick={() => {
              if (addFont(name, family, cssUrl, webPairOn ? webPair || undefined : undefined)) {
                setName(''); setFamily(''); setCssUrl(''); setWebPairOn(false); setWebPair('');
                toast('字型已新增');
              } else toast('請輸入名稱與 font-family 值');
            }}>＋ ADD</button>
        </div>
        {/* 英文・日文等不支援韓文的網頁字型 — 勾選後指定韓文配對 (v1.9 使用者要求) */}
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <KCheck label="指定韓文配對" checked={webPairOn} onChange={setWebPairOn} />
          {webPairOn && (
            <KSelect minWidth={160} value={webPair} onChange={setWebPair}
              options={[{ value: '', label: '無配對' }, ...fonts.map(f => ({ value: f.id, label: f.name }))]} />
          )}
        </div>
      </div>

      {/* 字型檔案上傳 (v1.9) — woff2・woff・ttf・otf＋英文字型的韓文配對 */}
      <div style={{ display: 'grid', gap: 8, marginTop: 16 }}>
        <label className="k-label" style={{ margin: 0 }}>上傳字型檔案 — woff2・woff・ttf・otf</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <span className="cp-lb">韓文配對</span>
          <KSelect minWidth={160} value={upPair} onChange={setUpPair}
            options={[{ value: '', label: '無配對' }, ...fonts.map(f => ({ value: f.id, label: f.name }))]} />
          <label className="btn btn-dark" style={{ whiteSpace: 'nowrap', cursor: 'var(--cur-pointer,pointer)' }}
            {...fileDrop(fl => uploadFontFile(fl[0]))}>
            ↑ 選擇檔案
            <input type="file" accept=".woff2,.woff,.ttf,.otf" style={{ display: 'none' }}
              onChange={e => { uploadFontFile(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
        </div>
        <p className="hint">顯示名稱會直接使用檔名登錄 — 可在列表的 [EDIT] 中修改。如果是不支援韓文的字型，請指定韓文配對 — 韓文字元會使用配對字型顯示。</p>
      </div>
    </div>
  );
}

function SettingsInner() {
  const { isAdmin } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [tab, setTabState] = useState<(typeof CATEGORIES)[number]>('디자인');
  // 分頁網址 (v1.9 使用者要求) — /settings?tab=…：可透過返回鍵回到上一個分頁，也可從會員詳細頁返回等
  const urlTab = params.get('tab');
  useEffect(() => {
    if (urlTab && (CATEGORIES as readonly string[]).includes(urlTab)) setTabState(urlTab as (typeof CATEGORIES)[number]);
    else if (!urlTab) setTabState('디자인');
  }, [urlTab]);
  const setTab = (t: (typeof CATEGORIES)[number]) => {
    setTabState(t);
    router.push(`/settings?tab=${encodeURIComponent(t)}`);
  };

  // 手機版不提供環境設定 (v1.9 使用者確認 — 要修改的資訊量不適合手機)
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width:620px)');
    const f = () => setIsMobile(mq.matches);
    f();
    mq.addEventListener('change', f);
    return () => mq.removeEventListener('change', f);
  }, []);

  /* 預覽只在此頁面內有效 — 未按 SAVE 離開時恢復為已儲存版本 (v1.9)。
     **之前只有顏色被保留**（v2.0 使用者發現 —「換了字型但沒按 SAVE，切換畫面後卻還是套用了」）。
     設計分頁的 SAVE 會同時儲存顏色・角色字型・Logo／分頁標題**三者**，
     但離開警告與恢復只查看顏色（useTheme）。另外兩者存在於模組／Provider 中的
     草稿，即使離開頁面也不會消失，因此會一直維持套用狀態，看起來像是已經儲存了一樣。 */
  const { dirty: themeDirty, discard: themeDiscard, save: themeSave } = useTheme();
  const { rolesDirty, saveRoles, discardRoles } = useFonts();
  const siteDraft = useSiteDraft();
  const dirty = themeDirty || rolesDirty || siteDraft.dirty;
  const save = () => { themeSave(); saveRoles(); siteDraft.save(); };
  const discard = () => { themeDiscard(); discardRoles(); siteDraft.discard(); };
  const themeRef = useRef({ dirty, discard });
  themeRef.current = { dirty, discard };
  useEffect(() => () => { if (themeRef.current.dirty) themeRef.current.discard(); }, []);

  // 有未儲存變更時，嘗試移動到上方導覽列會顯示警告 (v1.9 — 在 capture 階段暫停點擊)
  const [leaveAsk, setLeaveAsk] = useState(false);
  const pendingClick = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const onCapture = (e: MouseEvent) => {
      if (!themeRef.current.dirty) return;
      const t = e.target as HTMLElement | null;
      const hit = t?.closest?.('.topbar a, .topbar button, .topbar .brand') as HTMLElement | null;
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      pendingClick.current = hit;
      setLeaveAsk(true);
    };
    document.addEventListener('click', onCapture, true);
    return () => document.removeEventListener('click', onCapture, true);
  }, []);
  const leaveWith = (action: 'save' | 'discard') => {
    if (action === 'save') save(); else discard();
    setLeaveAsk(false);
    const el = pendingClick.current;
    pendingClick.current = null;
    // 解除 dirty 後重新執行暫停的點擊 → 前往原本的目的地
    setTimeout(() => el?.click(), 30);
  };

  if (!isAdmin) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>SETTINGS</PageTitle><p>僅限管理員使用的頁面</p></div>
        <div className="panel" style={{ textAlign: 'center', padding: 56 }}>
          <p style={{ fontSize: 13, color: 'var(--faint)' }}>登入管理員帳號後即可使用環境設定。</p>
        </div>
      </section>
    );
  }
  if (isMobile) {
    return (
      <section className="page">
        <div className="page-head"><PageTitle>SETTINGS</PageTitle><p>PC 專用頁面</p></div>
        <div className="panel" style={{ textAlign: 'center', padding: 56 }}>
          <p style={{ fontSize: 13, color: 'var(--faint)' }}>環境設定只能在 PC 畫面中使用。</p>
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>SETTINGS</PageTitle>
        {/* 管理員可點擊修改 (v1.9 — 與其他頁面的說明相同) */}
        <EditableDesc k="settings-desc" def="無程式碼自訂 — 所有控制項皆使用自製 UI Kit（不使用預設瀏覽器 UI）" />
      </div>

      {/* 未儲存的主題變更離開警告 (v1.9) */}
      <ConfirmModal open={leaveAsk} title="主題尚未儲存"
        body="如果就這樣離開，預覽中的變更將會消失，並恢復為已儲存的主題。"
        onClose={() => { pendingClick.current = null; setLeaveAsk(false); }}
        buttons={[
          { label: '儲存後離開', kind: 'dark', onClick: () => leaveWith('save') },
          { label: '不儲存並離開', kind: 'ghost', onClick: () => leaveWith('discard') },
          { label: 'CANCEL', kind: 'ghost', onClick: () => { pendingClick.current = null; setLeaveAsk(false); } },
        ]} />
      <div className="settings-layout">
        <div className="panel set-nav">
          {CATEGORIES.map(c => (
            <button key={c} className={tab === c ? 'on' : ''} onClick={() => setTab(c)}>{c}</button>
          ))}
        </div>
        <div className="panel" style={{ padding: 26 }}>
          {tab === '디자인' ? (
            <DesignPane />
          ) : tab === '메인 페이지' ? (
            <MainPagePane />
          ) : tab === '위젯' ? (
            <WidgetsPane />
          ) : tab === '메뉴 관리' ? (
            <MenuPane />
          ) : tab === '게시판 관리' ? (
            <BoardPane />
          ) : tab === '자관 질문' ? (
            <RelQPane />
          ) : tab === '커미션' ? (
            <CommPane />
          ) : tab === 'TRPG' ? (
            <TrpgPane />
          ) : tab === '감상타래' ? (
            <ThreadPane />
          ) : tab === '메모장' ? (
            <MemoPane />
          ) : tab === '무드 리스트' ? (
            <MoodPane />
          ) : tab === 'BGM' ? (
            <BgmPane />
          ) : tab === '폰트' ? (
            <FontPane />
          ) : tab === '마우스 커서' ? (
            <CursorPane />
          ) : tab === '회원/보안' ? (
            <MemberPane />
          ) : tab === '데이터 백업' ? (
            <DataPane />
          ) : (
            <div className="set-sec">
              <h3>{tab}</h3>
              {/* (v1.9) 移除開發里程碑文字 — 發布版本不會顯示 */}
              <div className="d">沒有設定項目</div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  // useSearchParams 需要 Suspense 邊界 (Next App Router) — 分頁網址 (v1.9)
  return <Suspense fallback={<section className="page" />}><SettingsInner /></Suspense>;
}