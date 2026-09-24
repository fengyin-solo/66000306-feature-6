// ─── Editable element property rules ────────────────────────────────────────
// Display units: area in mm², Young's modulus in GPa.
// Internal SI units: area in m², modulus in Pa.

// Q235 structural steel allowable stress (yield 235 MPa ≈ allowable 160 MPa)
export const ALLOWABLE_STRESS = 160e6; // Pa

// Accepted input ranges (in display units)
export const AREA_MM2_MIN = 1;
export const AREA_MM2_MAX = 100_000; // 0.1 m² — larger than this is almost certainly a unit slip
export const E_GPA_MIN = 0.001;
export const E_GPA_MAX = 1000; // beyond diamond / graphene, not a structural material

export type PropertyField = 'area' | 'youngsModulus';

export interface FieldCheck {
  ok: boolean;
  /** SI value; NaN when the text cannot be parsed */
  value: number;
  /** Reason string when invalid, so the panel can point at the exact field */
  error: string | null;
}

export function parseAreaMm2(text: string): FieldCheck {
  const t = typeof text === 'string' ? text.trim() : '';
  if (t === '') return { ok: false, value: NaN, error: '截面积不能为空' };
  const v = Number(t);
  if (!Number.isFinite(v)) return { ok: false, value: NaN, error: '截面积必须是数字' };
  if (v === 0) return { ok: false, value: NaN, error: '截面积不能为零' };
  if (v < 0) return { ok: false, value: NaN, error: '截面积不能为负数' };
  if (v < AREA_MM2_MIN) return { ok: false, value: NaN, error: `截面积过小，至少 ${AREA_MM2_MIN} mm²` };
  if (v > AREA_MM2_MAX) return { ok: false, value: NaN, error: `截面积过大，不能超过 ${AREA_MM2_MAX.toLocaleString()} mm²` };
  return { ok: true, value: v * 1e-6, error: null };
}

export function parseModulusGpa(text: string): FieldCheck {
  const t = typeof text === 'string' ? text.trim() : '';
  if (t === '') return { ok: false, value: NaN, error: '弹性模量不能为空' };
  const v = Number(t);
  if (!Number.isFinite(v)) return { ok: false, value: NaN, error: '弹性模量必须是数字' };
  if (v === 0) return { ok: false, value: NaN, error: '弹性模量不能为零' };
  if (v < 0) return { ok: false, value: NaN, error: '弹性模量不能为负数' };
  if (v < E_GPA_MIN) return { ok: false, value: NaN, error: `弹性模量过小，至少 ${E_GPA_MIN} GPa` };
  if (v > E_GPA_MAX) return { ok: false, value: NaN, error: `弹性模量过大，不能超过 ${E_GPA_MAX.toLocaleString()} GPa` };
  return { ok: true, value: v * 1e9, error: null };
}

export function checkField(field: PropertyField, text: string): FieldCheck {
  return field === 'area' ? parseAreaMm2(text) : parseModulusGpa(text);
}

export function formatAreaMm2(areaM2: number): string {
  return String(Math.round(areaM2 * 1e6));
}

export function formatModulusGpa(pa: number): string {
  return String(Math.round(pa / 1e9));
}

/** Unconfirmed edits for one element, kept as the raw text shown in the inputs */
export interface ElementDraft {
  areaText: string;
  modulusText: string;
}
