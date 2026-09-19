'use client';
// UI Kit 示範 — 用於確認第 0 階段成果（企劃書第 7 章「漂亮的控制元件」）
import React, { useState } from 'react';
import {
  KInput, KTextarea, KCheck, KRadio, KToggle, KStep, KSelect, SearchBar, Pager, Tip,
} from '@/components/ui/Kit';
import { ColorField } from '@/components/ui/ColorField';
import { FileDrop } from '@/components/ui/FileDrop';
import { CropEditor, CropValue, CropAspect } from '@/components/ui/CropEditor';
import { ConfirmModal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { PageTitle } from '@/components/ui/PageText';

export default function UiKitPage() {
  const toast = useToast();
  const [check, setCheck] = useState(true);
  const [radio, setRadio] = useState('a');
  const [toggle, setToggle] = useState(true);
  const [num, setNum] = useState(5);
  const [sel, setSel] = useState('md');
  const [color, setColor] = useState('#a63a45');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState(false);
  const [text, setText] = useState('');
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [cropAspect, setCropAspect] = useState<CropAspect>('3:4');
  const [cropResult, setCropResult] = useState<CropValue | null>(null);

  return (
    <section className="page">
      <div className="page-head">
        <PageTitle>UI KIT</PageTitle>
        <p>全面取代瀏覽器預設 UI — 所有功能都使用這套元件（企劃書第 7 章）</p>
        <div className="head-actions">
          <SearchBar onSearch={q => toast(`搜尋: ${q || '(空白)'}`)} />
          <button className="btn btn-dark" onClick={() => toast('按鈕點擊')}>✎ WRITE</button>
        </div>
      </div>

      <div className="panel">
        <div className="set-sec">
          <h3>輸入</h3>
          <div className="d">文字輸入框 · 自動高度 textarea（沒有縮放控制點）</div>
          <div style={{ display: 'grid', gap: 10, maxWidth: 460 }}>
            <KInput placeholder="輸入文字" />
            <KTextarea placeholder="會根據內容自動增加高度的 textarea" value={text} onChange={e => setText(e.target.value)} />
          </div>
        </div>

        <div className="set-sec">
          <h3>選擇控制元件</h3>
          <div className="d">核取方塊 15px · 單選按鈕 14px · Toggle · Stepper — 核取方塊垂直置中，與標籤對齊</div>
          <div style={{ display: 'flex', gap: 26, alignItems: 'center', flexWrap: 'wrap' }}>
            <KCheck label="核取方塊" checked={check} onChange={setCheck} />
            <KRadio label="單選 A" value="a" current={radio} onChange={setRadio} name="demo" />
            <KRadio label="單選 B" value="b" current={radio} onChange={setRadio} name="demo" />
            <KToggle label="Toggle" checked={toggle} onChange={setToggle} />
            <KStep value={num} onChange={setNum} />
          </div>
        </div>

        <div className="set-sec">
          <h3>下拉選單 · 顏色 · Tooltip</h3>
          <div className="d">自製 Select（箭頭垂直置中）· hex＋色彩選擇器組合 · 自訂 Tooltip</div>
          <div style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect
              value={sel}
              onChange={setSel}
              options={[
                { value: 'md', label: 'Markdown' },
                { value: 'html', label: 'HTML' },
                { value: 'txt', label: '一般文字' },
              ]}
            />
            <ColorField value={color} onChange={setColor} />
            <Tip tip="自訂設計的 Tooltip">
              <span className="pill">試著將滑鼠懸停在這裡</span>
            </Tip>
            <Tip tip="跟隨下拉選單顏色的變體" dd>
              <span className="pill dark">這個也是</span>
            </Tip>
          </div>
        </div>

        <div className="set-sec">
          <h3>按鈕</h3>
          <div className="d">登錄／撰寫文章（btn-dark）與搜尋框相同，固定垂直高度 35px</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-dark">＋ ADD CHARACTER</button>
            <button className="btn btn-accent">POST</button>
            <button className="btn btn-ghost">CANCEL</button>
            <button className="btn btn-dark" onClick={() => setModal(true)}>開啟 Modal</button>
            <button className="btn btn-ghost" onClick={() => toast('這是 Toast 通知')}>Toast</button>
          </div>
        </div>

        <div className="set-sec">
          <h3>檔案上傳</h3>
          <div className="d">拖曳＆放置區域＋顯示各檔案容量</div>
          <div style={{ maxWidth: 460 }}>
            <FileDrop multiple onFiles={fs => toast(`${fs.length} 個檔案已選取`)} />
          </div>
        </div>

        <div className="set-sec">
          <h3>縮圖裁切編輯器</h3>
          <div className="d">選擇圖片 → 拖曳移動＋放大／縮小，固定規格比例＋三分割線指南</div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <KSelect minWidth={120} value={cropAspect} onChange={v => setCropAspect(v as CropAspect)}
              options={[
                { value: '3:4', label: '3:4（角色）' },
                { value: '4:3', label: '4:3（自設關係）' },
                { value: '16:9', label: '16:9（票券・橡果）' },
                { value: '1:1', label: '1:1' },
              ]} />
            <div style={{ maxWidth: 320, flex: 1 }}>
              <FileDrop accept="image/*" label="選擇要裁切的圖片"
                onFiles={fs => { if (fs[0]) setCropSrc(URL.createObjectURL(fs[0])); }} />
            </div>
            {cropResult && (
              <span className="pill">crop: x {Math.round(cropResult.x)} · y {Math.round(cropResult.y)} · {cropResult.scale.toFixed(2)}×</span>
            )}
          </div>
          {cropSrc && (
            <CropEditor open={!!cropSrc} src={cropSrc} aspect={cropAspect}
              onClose={() => setCropSrc(null)}
              onApply={c => { setCropResult(c); setCropSrc(null); toast('裁切座標已儲存（保留原始圖片）'); }} />
          )}
        </div>

        <div className="set-sec">
          <h3>列表資料列懸停 · 分頁</h3>
          <div className="d">資料列懸停時會變更背景＋文字顏色，不會超出圓角範圍</div>
          <div className="hover-list" style={{ border: '1px solid var(--line)' }}>
            {['第一篇文章標題', '第二篇文章標題', '第三篇文章標題'].map(t => (
              <div className="row" key={t}><span className="pill">閒聊</span>{t}</div>
            ))}
          </div>
          <Pager page={page} total={4} onChange={setPage} />
        </div>
      </div>

      <ConfirmModal
        open={modal}
        title="確定要結束編輯嗎？"
        body="尚未儲存的變更將會消失。（結束編輯確認 Modal 示範 — v1.8）"
        onClose={() => setModal(false)}
        buttons={[
          { label: '儲存後結束', kind: 'dark', onClick: () => { setModal(false); toast('已儲存'); } },
          { label: '不儲存直接結束', kind: 'ghost', onClick: () => setModal(false) },
          { label: 'CANCEL', kind: 'ghost', onClick: () => setModal(false) },
        ]}
      />
    </section>
  );
}