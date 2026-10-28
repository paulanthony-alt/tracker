/** Join class names, skipping falsy values. */
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');

/** Trimmed string, or undefined when empty — for optional text fields. */
export const opt = (s: string | undefined | null) => {
  const t = (s ?? '').trim();
  return t ? t : undefined;
};

/** Parse a number input; undefined when blank or invalid. */
export const optNum = (s: string | number | undefined | null): number | undefined => {
  if (s === undefined || s === null || s === '') return undefined;
  const n = typeof s === 'number' ? s : Number(s);
  return Number.isFinite(n) ? n : undefined;
};

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
export const plural = (n: number, word: string, pluralWord = `${word}s`) => `${n} ${n === 1 ? word : pluralWord}`;
export const pct = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `${Math.round(n)}%`);

export function downloadFile(filename: string, content: string, type = 'application/json') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function csvEscape(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
