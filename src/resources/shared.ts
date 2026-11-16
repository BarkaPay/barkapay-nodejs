import { resourceOf } from '../dto';
import { ApiError } from '../errors';
import { coerceObject, coerceStr, isRecord } from '../util';

/**
 * The object under `data.<key>` of a success envelope. A success response
 * without it is a contract violation: fail loudly instead of handing back an
 * empty resource the caller would mistake for a real one.
 *
 * @internal
 */
export function expectResource(
  envelope: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const resource = resourceOf(envelope, key);
  if (resource === null) {
    throw unexpected(envelope, `\`data.${key}\` is missing`);
  }
  return resource;
}

/**
 * The `data` object of a success envelope. Missing, it is a contract
 * violation, not an empty result.
 *
 * @internal
 */
export function expectData(envelope: Record<string, unknown>): Record<string, unknown> {
  const data = coerceObject(envelope, 'data');
  if (data === null) {
    throw unexpected(envelope, '`data` is missing');
  }
  return data;
}

/**
 * The list under `data.<key>` of a success envelope. A malformed answer is
 * never passed off as "no result".
 *
 * @internal
 */
export function expectRows(envelope: Record<string, unknown>, key: string): void {
  const data = expectData(envelope);
  const rows = data[key];
  if (!Array.isArray(rows) || !rows.every(isRecord)) {
    throw unexpected(envelope, `\`data.${key}\` is missing or not a list of objects`);
  }
}

function unexpected(envelope: Record<string, unknown>, what: string): ApiError {
  return new ApiError(
    `Unexpected response from the API: ${what}. ` +
      'The request was accepted: after a create call, look it up by your order id before sending it again.',
    {
      code: 'invalid_response',
      httpStatus: 200,
      requestId: coerceStr(envelope, 'request_id'),
    },
  );
}
