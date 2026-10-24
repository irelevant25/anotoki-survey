import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { ApiError, toApiError } from '../../api/api.service';
import { DYNAMIC_KEYS } from './dynamic-keys';
import { errorKey, errorParams } from './error-text';

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

  it('reads the anotoki family’s own refusal of a request it never sent - {code, message} - as the API’s {error, code}', () => {
    const error = toApiError(new HttpErrorResponse({ status: 401, error: { code: 'sign_in_required', message: 'Please sign in.' } }));
    expect([error.status, error.code, error.message]).toEqual([401, 'sign_in_required', 'Please sign in.']);
    expect(errorKey(error)).toBe('error.sign_in_required');
    const api = toApiError(new HttpErrorResponse({ status: 401, error: { error: 'Sign in to continue.', code: 'sign_in_required' } }));
    expect(api.message).toBe('Sign in to continue.');
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
