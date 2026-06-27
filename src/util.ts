/**
 * Defensive readers for decoded JSON — keep DTO hydration null-safe and tidy.
 * @internal
 */

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function coerceStr(data: Record<string, unknown>, key: string): string | null {
  const value = data[key];
  return typeof value === 'string' ? value : null;
}

export function coerceInt(data: Record<string, unknown>, key: string): number | null {
  const value = data[key];
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return Number.parseInt(value, 10);
  }
  return null;
}

/**
 * Amount as returned by the API (whole number for fiat, decimal string for
 * crypto). Returned as-is to avoid lossy coercion.
 */
export function coerceAmount(
  data: Record<string, unknown>,
  key: string,
): number | string | null {
  const value = data[key];
  return typeof value === 'number' || typeof value === 'string' ? value : null;
}

export function coerceObject(
  data: Record<string, unknown>,
  key: string,
): Record<string, unknown> | null {
  const value = data[key];
  return isRecord(value) ? value : null;
}

export function coerceArray(data: Record<string, unknown>, key: string): unknown[] | null {
  const value = data[key];
  return Array.isArray(value) ? value : null;
}

/** Decode a JSON object. Returns null for empty input or anything not an object. */
export function decodeEnvelope(text: string): Record<string, unknown> | null {
  if (text.trim() === '') {
    return null;
  }
  try {
    const decoded: unknown = JSON.parse(text);
    return isRecord(decoded) ? decoded : null;
  } catch {
    return null;
  }
}
