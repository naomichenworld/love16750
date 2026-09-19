// 顏色工具 — 顏色字串解析 · hex ↔ HSL 轉換、套用透明度、用於主題衍生
// v2.0：除了 hex 之外也接受 rgba()（使用者要求）— 內部計算全部先經過 toRgba
export interface HSL { h: number; s: number; l: number }
export interface RGBA { r: number; g: number; b: number; a: number }

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

/** 顏色字串 → RGBA。#rgb · #rgba · #rrggbb · #rrggbbaa · rgb() · rgba() 都接受 */
export function toRgba(v: string): RGBA {
  const s = (v ?? '').trim();
  const fn = s.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(/[,\s/]+/).filter(Boolean);
    const chan = (x: string | undefined) => {
      if (x == null) return 0;
      const n = parseFloat(x);
      if (!Number.isFinite(n)) return 0;
      return clamp(Math.round(x.endsWith('%') ? (n * 255) / 100 : n), 0, 255);
    };
    const alpha = (x: string | undefined) => {
      if (x == null) return 1;
      const n = parseFloat(x);
      if (!Number.isFinite(n)) return 1;
      return clamp(x.endsWith('%') ? n / 100 : n, 0, 1);
    };
    return { r: chan(parts[0]), g: chan(parts[1]), b: chan(parts[2]), a: alpha(parts[3]) };
  }
  const h = s.replace('#', '');
  // 3·4 位縮寫形式等同於將每個字元重複兩次
  const full = h.length === 3 || h.length === 4 ? h.split('').map(c => c + c).join('') : h;
  const at = (i: number) => {
    const n = parseInt(full.slice(i, i + 2), 16);
    return Number.isFinite(n) ? n : 0;
  };
  const a = full.length >= 8 ? at(6) / 255 : 1;
  return { r: at(0), g: at(2), b: at(4), a };
}

export function hexToHsl(hex: string): HSL {
  const c = toRgba(hex);
  const r = c.r / 255, g = c.g / 255, b = c.b / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h, s, l };
}

export function hslToHex({ h, s, l }: HSL): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r: number, g: number, b: number;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  const to = (v: number) => Math.round(v * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** hex + HSL 部分覆寫 → 顏色字串（原本的顏色如果是半透明，會保留其透明度） */
export function adjust(color: string, fn: (c: HSL) => Partial<HSL>): string {
  const { a } = toRgba(color);
  const c = hexToHsl(color);
  const hex = hslToHex({ ...c, ...fn(c) });
  return a >= 1 ? hex : setAlpha(hex, a);
}

/** 將透明度固定為指定數值 */
export function setAlpha(color: string, alpha: number): string {
  const { r, g, b } = toRgba(color);
  return `rgba(${r},${g},${b},${+clamp(alpha, 0, 1).toFixed(3)})`;
}

/** 將透明度相乘 — 原本的顏色如果已經是半透明，會變得更淡（用於半透明面板·上方導覽列） */
export function withAlpha(color: string, alpha: number): string {
  const { r, g, b, a } = toRgba(color);
  return `rgba(${r},${g},${b},${+clamp(a * alpha, 0, 1).toFixed(3)})`;
}

export function isValidHex(v: string): boolean {
  return /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v.trim());
}

/** 輸入欄中可以輸入的顏色 — hex（3·4·6·8 位）與 rgb()/rgba()（v2.0） */
export function isValidColor(v: string): boolean {
  const s = (v ?? '').trim();
  if (/^#?([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return true;
  const fn = s.match(/^rgba?\(([^)]+)\)$/i);
  if (!fn) return false;
  const parts = fn[1].split(/[,\s/]+/).filter(Boolean);
  return parts.length >= 3 && parts.length <= 4 && parts.every(p => Number.isFinite(parseFloat(p)));
}

export function normalizeHex(v: string): string {
  const m = v.trim().replace('#', '');
  const full = m.length === 3 ? m.split('').map(c => c + c).join('') : m;
  return '#' + full.toLowerCase();
}

/** 轉換成儲存格式 — 不透明時為 #rrggbb，半透明時為 rgba()（v2.0） */
export function normalizeColor(v: string): string {
  const { r, g, b, a } = toRgba(v);
  if (a >= 1) {
    const to = (x: number) => x.toString(16).padStart(2, '0');
    return `#${to(r)}${to(g)}${to(b)}`;
  }
  return `rgba(${r},${g},${b},${+a.toFixed(3)})`;
}