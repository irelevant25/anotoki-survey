import { TranslationParams } from '@anotoki/lib/translations';
import { ApiError } from '../../api/api.service';

/**
 * What the site says when a whole request fails, in the reader's language.
 *
 * A participant is never shown the server's English sentence - nor the IAM's
 * (a sign-in that came back without one is the anotoki family's screen's to
 * word, from its code). The codes whose meaning does not depend on the page are
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
  ['visitor_unknown', 'error.visitor_unknown'],
  ['too_many_visitors', 'error.too_many_visitors'],
  ['visitor_move_retry', 'error.visitor_move_retry'],
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
