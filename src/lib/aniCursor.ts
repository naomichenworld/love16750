// Windows 動畫游標（.ani）解析器（5.1 v1.9）——瀏覽器無法直接支援 .ani，因此
// 從 RIFF（ACON）容器中取出影格（.cur/.ico）與播放速度，逐影格替換 CSS cursor 來播放。
// 參考結構：「RIFF」size 「ACON」{ anih（標頭 36B） · rate（每步 jiffy） · seq（步驟→影格） · LIST 「fram」{ icon... } }

export interface AniData {
  frames: Blob[];     // 每個影格——本身就是有效的 .cur/.ico（內含熱點）
  steps: number[];    // 播放順序（影格索引）
  delays: number[];   // 每個步驟的延遲 ms（jiffy = 1/60 秒）
}

export function parseAni(buf: ArrayBuffer): AniData | null {
  if (buf.byteLength < 12) return null;
  const dv = new DataView(buf);
  const tag = (o: number) =>
    String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
  if (tag(0) !== 'RIFF' || tag(8) !== 'ACON') return null;

  let dispRate = 6;                 // 預設 6 jiffy = 100ms
  let rates: number[] | null = null;
  let seq: number[] | null = null;
  const frames: Blob[] = [];

  let o = 12;
  while (o + 8 <= buf.byteLength) {
    const id = tag(o);
    const size = dv.getUint32(o + 4, true);
    const body = o + 8;
    if (body + size > buf.byteLength) break;
    if (id === 'anih' && size >= 36) {
      dispRate = dv.getUint32(body + 28, true) || 6;
    } else if (id === 'rate') {
      rates = [];
      for (let i = 0; i < Math.floor(size / 4); i++) rates.push(dv.getUint32(body + i * 4, true));
    } else if (id === 'seq ') {
      seq = [];
      for (let i = 0; i < Math.floor(size / 4); i++) seq.push(dv.getUint32(body + i * 4, true));
    } else if (id === 'LIST' && tag(body) === 'fram') {
      let p = body + 4;
      while (p + 8 <= body + size) {
        const cid = tag(p);
        const csize = dv.getUint32(p + 4, true);
        if (cid === 'icon') frames.push(new Blob([buf.slice(p + 8, p + 8 + csize)], { type: 'image/x-icon' }));
        p += 8 + csize + (csize % 2);   // RIFF 區塊需要 2 位元組對齊
      }
    }
    o = body + size + (size % 2);
  }

  if (frames.length === 0) return null;
  const steps = (seq ?? frames.map((_, i) => i)).filter(i => i < frames.length);
  if (steps.length === 0) return null;
  const delays = steps.map((_, i) => Math.max(16, Math.round(((rates?.[i] ?? dispRate) * 1000) / 60)));
  return { frames, steps, delays };
}

/** 是否為 .cur 靜態游標——熱點已內嵌於檔案中，因此 CSS 中必須省略座標 */
export function isCur(buf: ArrayBuffer): boolean {
  if (buf.byteLength < 4) return false;
  const dv = new DataView(buf);
  return dv.getUint16(0, true) === 0 && dv.getUint16(2, true) === 2;
}