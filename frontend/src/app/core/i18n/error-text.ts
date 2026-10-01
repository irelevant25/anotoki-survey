import { ApiError } from '../api/api.service';
import { TranslationParams } from './translation.service';

/**
 * What the site says when a whole request fails, in the reader's language.
 *
 * A participant is never shown the server's English sentence - nor the IAM's,
 * nor the SDK's. The codes whose meaning does not depend on the page are
 * worded here; a page words its own refusals (a survey that closed, an answer
 * that is not allowed) before it falls back to this. The admin area, which is
 * English, goes on showing the server's sentences.
 *
 * The key comes from a table and never from the code itself: a code nobody
 * listed is `error.unknown`. The tails are also in dynamic-keys.ts.
 */
const BY_CODE = new Map<string, string>([
  ['offline', 'error.offline'],
  ['server_error', 'error.server_error'],
  ['database_unavailable', 'error.database_unavailable'],
  ['invalid_token', 'error.invalid_token'],
  ['sign_in_required', 'error.sign_in_required'],
  ['too_large', 'error.too_large'],
  ['not_set_up', 'error.not_set_up'],
]);

/**
 * The key for a failed request. `error.http` is for an answer that was not
 * the API's own (no code in it) and has a `{status}` - word it with
 * errorParams(), or the placeholder stays as written.
 */
export function errorKey(error: ApiError): string {
  const byCode = BY_CODE.get(error.code);
  if (byCode) {
    return byCode;
  }
  return error.status > 0 && error.code === `http_${error.status}` ? 'error.http' : 'error.unknown';
}

/** What errorKey()'s strings are filled with: `i18n.t(errorKey(error), errorParams(error))`. */
export function errorParams(error: ApiError): TranslationParams {
  return { status: error.status };
}

/** An OAuth error code, or one of the SDK's own: a short word, nothing a sentence could hide in. */
const FAILURE_CODE = /^[A-Za-z0-9_.-]{1,40}$/;

/**
 * The key for a sign-in that came back without one. `access_denied` is the IAM
 * turning the account away, or the person going back from its page - one
 * sentence that is true either way. Anything else is `signIn.failed`, which
 * has a `{code}`: the code (signInFailureParams()), never the IAM's or the
 * SDK's own English sentence.
 */
export function signInFailureKey(code: string): string {
  return code === 'access_denied' ? 'signIn.notCompleted' : 'signIn.failed';
}

/** The `{code}` of `signIn.failed`: the code when it looks like one, `unknown` otherwise - it came through the address. */
export function signInFailureParams(code: string): TranslationParams {
  return { code: FAILURE_CODE.test(code) ? code : 'unknown' };
}
