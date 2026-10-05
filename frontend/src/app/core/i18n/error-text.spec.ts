import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
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
    expect(errorKey(new ApiError(401, 'visitor_unknown', 'x'))).toBe('error.visitor_unknown');
    expect(errorKey(new ApiError(429, 'too_many_visitors', 'x'))).toBe('error.too_many_visitors');
    expect(errorKey(new ApiError(503, 'visitor_move_retry', 'x'))).toBe('error.visitor_move_retry');
  });

  it('keeps the wait a Retry-After asked for, in seconds - and nothing for none or for garbage', () => {
    const headers = (value: string) => new HttpHeaders({ 'Retry-After': value });
    expect(toApiError(new HttpErrorResponse({ status: 503, error: { code: 'visitor_move_retry' }, headers: headers('2') })).retryAfter).toBe(2);
    expect(toApiError(new HttpErrorResponse({ status: 503, error: { code: 'visitor_move_retry' } })).retryAfter).toBeNull();
    expect(toApiError(new HttpErrorResponse({ status: 429, error: { code: 'too_many_visitors' }, headers: headers('soon') })).retryAfter).toBeNull();
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
    const codes = [
      'offline',
      'server_error',
      'database_unavailable',
      'invalid_token',
      'sign_in_required',
      'too_large',
      'not_set_up',
      'visitor_unknown',
      'too_many_visitors',
      'visitor_move_retry',
      'http_502',
      'nothing',
    ];
    const answered = codes.map((code) => errorKey(new ApiError(code === 'http_502' ? 502 : 400, code, 'x')));
    expect([...new Set(answered)].sort()).toEqual([...declared].sort());
  });
});

describe('signInFailureKey(): a sign-in that came back without one', () => {
  it('has one sentence for access_denied, true whoever ended it', () => {
    expect(signInFailureKey('access_denied')).toBe('signIn.notCompleted');
  });

  it('says why a sign-in could not start when the browser refused the site its storage', () => {
    expect(signInFailureKey('storage_unavailable')).toBe('signIn.storageUnavailable');
    // Map lookups only: a code named like an object's own property is "anything else".
    expect(signInFailureKey('constructor')).toBe('signIn.failed');
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
