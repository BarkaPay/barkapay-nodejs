import { resourceOf } from '../dto';
import { ApiError } from '../errors';
import { coerceStr } from '../util';

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
    throw new ApiError(`Unexpected response: \`data.${key}\` is missing.`, {
      code: coerceStr(envelope, 'code') ?? '',
      httpStatus: 200,
      requestId: coerceStr(envelope, 'request_id'),
    });
  }
  return resource;
}
