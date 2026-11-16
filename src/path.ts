import { ConfigurationError } from './errors';

const COUNTRY_PATTERN = /^[a-z]{2}$/;
const MAX_SEGMENT_LENGTH = 512;

/**
 * Normalise and validate a country code before it becomes the first path
 * segment of the URL (`/{country}/v1/…`). Anything that is not two ASCII
 * letters is refused — it could otherwise rewrite the request path.
 *
 * @internal
 */
export function normalizeCountry(value: unknown): string {
  if (typeof value !== 'string') {
    throw new ConfigurationError('The country code must be a string such as "bf".');
  }
  const country = value.trim().toLowerCase();
  if (!COUNTRY_PATTERN.test(country)) {
    throw new ConfigurationError(
      'Invalid country code: expected two letters such as "bf", "bj" or "sn".',
    );
  }
  return country;
}

/**
 * Encode a caller-supplied identifier as exactly ONE path segment.
 *
 * `encodeURIComponent` alone is not enough: it leaves `.` and `..` untouched,
 * and URL normalisation would then climb out of the intended path. Empty
 * values, dot segments, control characters and `/` are refused outright (the
 * API cannot route an encoded slash, so such a lookup could only ever fail).
 *
 * @internal
 */
export function pathSegment(value: unknown, label: string): string {
  if (typeof value !== 'string') {
    throw new ConfigurationError(`The ${label} must be a string.`);
  }
  if (value.trim() === '') {
    throw new ConfigurationError(`The ${label} must not be empty.`);
  }
  if (value.length > MAX_SEGMENT_LENGTH) {
    throw new ConfigurationError(`The ${label} is too long.`);
  }
  if (value === '.' || value === '..') {
    throw new ConfigurationError(`The ${label} must not be a dot segment.`);
  }
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(value)) {
    throw new ConfigurationError(`The ${label} must not contain control characters.`);
  }
  if (value.includes('/')) {
    throw new ConfigurationError(
      `The ${label} must not contain a slash: such a value cannot be looked up by path — ` +
        'filter a list call instead (for example `list({ order_id })`).',
    );
  }

  try {
    return encodeURIComponent(value);
  } catch {
    throw new ConfigurationError(`The ${label} is not valid Unicode text.`);
  }
}
