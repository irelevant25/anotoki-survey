import { HttpErrorResponse } from '@angular/common/http';
import { ApiError, toApiError } from '../api/api.service';
import { DYNAMIC_KEYS } from './dynamic-keys';
import { errorKey, errorParams, signInFailureKey, signInFailureParams } from './error-text';

describe('errorKey(): a failed request in the reader’s words', () => {
  it('words the codes that mean the same on every page', () => {
    expect(errorKey(new ApiError(0, 'offline', 'x'))).toBe('error.offline');
    expect(errorKey(new ApiError(500, 'server_error', 'x'))).toBe('error.server_error');
    expect(errorKey(new ApiError(503, 'database_unavailable', 'x'))).toBe('error.database_unavailable');
    expect(errorKey(new ApiError(401, 'invalid_token', 'x'))).toBe('error.invalid_token');
    expect(errorKey(new ApiError(401, 'sign_in_required', 'x'))).toBe('error.sign_in_required');
    expect(errorKey(new ApiError(413, 'too_large', 'x'))).toBe('error.too_large');
    expect(errorKey(new ApiError(503, 'not_set_up', 'x'))).toBe('error.not_set_up');
  });

  it('says the status of an answer that was not the API’s own', () => {
    const error = toApiError(new HttpErrorResponse({ status: 502, error: '<html>Bad gateway</html>' }));
    expect(errorKey(error)).toBe('error.http');
    expect(errorParams(error)).toEqual({ status: 502 });
  });

  it('falls back to one key for anything else - never a key made from the code', () => {
    expect(errorKey(new ApiError(409, 'conflict', 'x'))).toBe('error.unknown');
    expect(errorKey(new ApiError(422, 'constructor', 'x'))).toBe('error.unknown');
    expect(errorKey(new ApiError(422, 'http', 'x'))).toBe('error.unknown');
    expect(errorKey(new ApiError(500, 'http_404', 'x'))).toBe('error.unknown');
    expect(errorKey(new ApiError(0, 'unknown', 'x'))).toBe('error.unknown');
    expect(errorKey(toApiError(new Error('boom')))).toBe('error.unknown');
  });

  it('only ever answers a key the key scan is told about', () => {
    const declared = DYNAMIC_KEYS['error.'].map((tail) => `error.${tail}`);
    const answered = ['offline', 'server_error', 'database_unavailable', 'invalid_token', 'sign_in_required', 'too_large', 'not_set_up', 'http_502', 'nothing'].map((code) =>
      errorKey(new ApiError(code === 'http_502' ? 502 : 400, code, 'x')),
    );
    expect([...new Set(answered)].sort()).toEqual([...declared].sort());
  });
});

describe('signInFailureKey(): a sign-in that came back without one', () => {
  it('has one sentence for access_denied, true whoever ended it', () => {
    expect(signInFailureKey('access_denied')).toBe('signIn.notCompleted');
  });

  it('says the code for anything else - the code, never somebody’s sentence', () => {
    expect(signInFailureKey('state_mismatch')).toBe('signIn.failed');
    expect(signInFailureKey('')).toBe('signIn.failed');
    expect(signInFailureParams('state_mismatch')).toEqual({ code: 'state_mismatch' });
    expect(signInFailureParams('http_503')).toEqual({ code: 'http_503' });
    expect(signInFailureParams('Your account is locked. Call 0900 123 456')).toEqual({ code: 'unknown' });
    expect(signInFailureParams('')).toEqual({ code: 'unknown' });
  });
});
