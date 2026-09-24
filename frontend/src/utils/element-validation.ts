import type { ElementDraft } from '../types';

/** Allowed ranges for editable element properties (in display units). */
export const LIMITS = {
  areaMm2: { min: 1e-9, max: 1e6 },     // 1e-9 mm² … 1 m²
  youngsGpa: { min: 1e-6, max: 1e3 },   // 1 Pa … 1000 GPa
  allowableMpa: { min: 1e-6, max: 1e4 },// 1 Pa … 10000 MPa
} as const;

function validateField(
  raw: string,
  limits: { min: number; max: number },
  label: string,
  unit: string
): { value: number } | { error: string } {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return { error: `${label}不能为空` };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return { error: `${label}必须是数字` };
  }
  if (value === 0) {
    return { error: `${label}不能为零` };
  }
  if (value < 0) {
    return { error: `${label}不能为负数` };
  }
  if (value < limits.min) {
    return { error: `${label}过小（应 ≥ ${limits.min} ${unit}）` };
  }
  if (value > limits.max) {
    return { error: `${label}过大（应 ≤ ${limits.max.toLocaleString()} ${unit}）` };
  }
  return { value };
}

/**
 * Validate every draft field and write per-field errors back onto the draft.
 * Invalid fields keep the draft text (the committed model value is untouched).
 * Returns the parsed SI values only when all fields are valid.
 */
export function validateDraft(draft: ElementDraft):
  | { ok: true; area: number; youngsModulus: number; allowableStress: number }
  | { ok: false } {
  let valid = true;

  const area = validateField(draft.areaMm2, LIMITS.areaMm2, '截面积', 'mm²');
  if ('error' in area) {
    draft.errors.area = area.error;
    valid = false;
  } else {
    draft.errors.area = undefined;
  }

  const youngs = validateField(draft.youngsGpa, LIMITS.youngsGpa, '弹性模量', 'GPa');
  if ('error' in youngs) {
    draft.errors.youngs = youngs.error;
    valid = false;
  } else {
    draft.errors.youngs = undefined;
  }

  const allowable = validateField(
    draft.allowableMpa,
    LIMITS.allowableMpa,
    '许用应力',
    'MPa'
  );
  if ('error' in allowable) {
    draft.errors.allowable = allowable.error;
    valid = false;
  } else {
    draft.errors.allowable = undefined;
  }

  if (!valid || 'error' in area || 'error' in youngs || 'error' in allowable) {
    return { ok: false };
  }
  return {
    ok: true,
    area: area.value * 1e-6,                 // mm² -> m²
    youngsModulus: youngs.value * 1e9,       // GPa -> Pa
    allowableStress: allowable.value * 1e6,  // MPa -> Pa
  };
}

// ─── Display formatting (SI -> display units) ──────────────────────────────
/** Trim trailing zeros while keeping enough precision for round-tripping. */
function trimNumber(v: number, fractionDigits: number): string {
  return String(Number(v.toFixed(fractionDigits)));
}

export const formatAreaMm2 = (areaM2: number): string =>
  trimNumber(areaM2 * 1e6, 6);

export const formatYoungsGpa = (pa: number): string =>
  trimNumber(pa / 1e9, 6);

export const formatAllowableMpa = (pa: number): string =>
  trimNumber(pa / 1e6, 4);

