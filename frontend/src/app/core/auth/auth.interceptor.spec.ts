import { HttpClient, HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { CARRIES_VISITOR_KEY, issuedAs } from '../api/api.service';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';
import { SavesInFlight } from './saves-in-flight';
import { VisitorKey } from './visitor-key';

const KEY = 'k'.repeat(43);
const OTHER_KEY = 'o'.repeat(43);
const NEW_KEY = 'n'.repeat(43);

describe('authInterceptor: who a request is', () => {
  const auth = {
    signedIn: vi.fn(() => true),
    loginRequired: vi.fn(() => false),
    noteLoginRequired: vi.fn(),
    accessToken: vi.fn(async (): Promise<string | null> => 'a-token'),
    refreshToken: vi.fn(async (): Promise<string | null> => null),
  };
  /** This browser's visitor key, as VisitorKey keeps it: the first stays, forgotten only while it is the one held. */
  let held: string | null = null;
  const visitor = {
    current: vi.fn(() => held),
    remember: vi.fn((key: string) => {
      held ??= key;
    }),
    forget: vi.fn((key: string, _lost?: boolean) => {
      if (held === key) {
        held = null;
      }
    }),
  };
  let http: HttpClient;
  let server: HttpTestingController;
  let failed: unknown;
  const fail = { error: (error: unknown) => (failed = error) };

  beforeEach(() => {
    held = null;
    failed = undefined;
    auth.signedIn.mockReset().mockReturnValue(true);
    auth.loginRequired.mockReset().mockReturnValue(false);
    auth.noteLoginRequired.mockReset();
    auth.accessToken.mockReset().mockResolvedValue('a-token');
    auth.refreshToken.mockReset().mockResolvedValue(null);
    visitor.current.mockClear();
    visitor.remember.mockClear();
    visitor.forget.mockClear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: AuthService, useValue: auth }, { provide: VisitorKey, useValue: visitor }],
    });
    http = TestBed.inject(HttpClient);
    server = TestBed.inject(HttpTestingController);
  });

  afterEach(() => server.verify());

  /** Lets the token's promise and what follows it run. */
  const turn = () => new Promise((done) => setTimeout(done));

  describe('a person’s request', () => {
    it('carries the token to the site’s own API', async () => {
      http.get('/api/surveys').subscribe();
      const request = await vi.waitFor(() => server.expectOne('/api/surveys'));
      expect(request.request.headers.get('Authorization')).toBe('Bearer a-token');
      expect(auth.accessToken).toHaveBeenCalledTimes(1);
    });

    it('never carries the visitor key, even one the request set itself - and ignores a key in its answer', async () => {
      held = KEY;
      http.post('/api/surveys/hry/responses', {}, { headers: { 'X-Visitor-Key': KEY }, context: issuedAs('person') }).subscribe();
      const request = await vi.waitFor(() => server.expectOne('/api/surveys/hry/responses'));
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      request.flush({ id: 'r1' }, { status: 201, statusText: 'Created', headers: { 'X-Visitor-Key': NEW_KEY } });
      expect(visitor.remember).not.toHaveBeenCalled();
    });

    it('is never sent when the token comes back null - it fails at once as sign_in_required, and never goes out as nobody’s', async () => {
      auth.accessToken.mockResolvedValue(null);
      http.post('/api/surveys/hry/responses', { answers: {} }).subscribe(fail);
      await turn();
      server.expectNone('/api/surveys/hry/responses');
      expect(failed).toBeInstanceOf(HttpErrorResponse);
      expect((failed as HttpErrorResponse).status).toBe(401);
      expect((failed as HttpErrorResponse).error).toMatchObject({ code: 'sign_in_required' });
      expect(auth.noteLoginRequired).not.toHaveBeenCalled();
    });

    it('stays a person’s request when it was issued as one, whatever the state when it leaves', async () => {
      // Issued while signed in; signed out in another tab before the token came.
      auth.signedIn.mockReturnValue(false);
      auth.accessToken.mockResolvedValue(null);
      held = KEY;
      http.post('/api/surveys/hry/responses', {}, { context: issuedAs('person') }).subscribe(fail);
      await turn();
      server.expectNone('/api/surveys/hry/responses');
      expect((failed as HttpErrorResponse).status).toBe(401);
    });

    it('tries once more with a fresh token after a 401, and only with one that is different', async () => {
      auth.refreshToken.mockResolvedValue('b-token');
      http.get('/api/admin/surveys').subscribe();
      const first = await vi.waitFor(() => server.expectOne('/api/admin/surveys'));
      first.flush({ code: 'invalid_token' }, { status: 401, statusText: 'Unauthorized' });
      const second = await vi.waitFor(() => server.expectOne('/api/admin/surveys'));
      expect(second.request.headers.get('Authorization')).toBe('Bearer b-token');
      second.flush({ surveys: [] });
    });

    it('the move carries both: the token, and the key it set itself', async () => {
      http.post('/api/visitor/move', {}, { headers: { 'X-Visitor-Key': KEY }, context: issuedAs('person').set(CARRIES_VISITOR_KEY, true) }).subscribe();
      const request = await vi.waitFor(() => server.expectOne('/api/visitor/move'));
      expect(request.request.headers.get('Authorization')).toBe('Bearer a-token');
      expect(request.request.headers.get('X-Visitor-Key')).toBe(KEY);
    });
  });

  describe('a visitor’s request', () => {
    beforeEach(() => auth.signedIn.mockReturnValue(false));

    it('carries the key held now to /api/surveys - never a token - and asks for no token', () => {
      held = KEY;
      http.get('/api/surveys').subscribe();
      const request = server.expectOne('/api/surveys');
      expect(request.request.headers.get('X-Visitor-Key')).toBe(KEY);
      expect(request.request.headers.has('Authorization')).toBe(false);
      expect(auth.accessToken).not.toHaveBeenCalled();
    });

    it('stays a visitor’s request when it was issued as one, though somebody signed in before it left', () => {
      auth.signedIn.mockReturnValue(true);
      held = KEY;
      http.get('/api/surveys/hry', { context: issuedAs('visitor') }).subscribe();
      const request = server.expectOne('/api/surveys/hry');
      expect(request.request.headers.get('X-Visitor-Key')).toBe(KEY);
      expect(request.request.headers.has('Authorization')).toBe(false);
    });

    it('goes bare with no key held, and keeps the key the answer that made a visitor brings', () => {
      http.post('/api/surveys/hry/responses', {}).subscribe();
      const request = server.expectOne('/api/surveys/hry/responses');
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      request.flush({ id: 'r1' }, { status: 201, statusText: 'Created', headers: { 'X-Visitor-Key': NEW_KEY } });
      expect(visitor.remember).toHaveBeenCalledWith(NEW_KEY);
      expect(held).toBe(NEW_KEY);
    });

    it('takes no key from an answer to a request that already carried one', () => {
      held = KEY;
      http.post('/api/surveys/hry/responses', {}).subscribe();
      server.expectOne('/api/surveys/hry/responses').flush({ id: 'r1' }, { status: 201, statusText: 'Created', headers: { 'X-Visitor-Key': NEW_KEY } });
      expect(visitor.remember).not.toHaveBeenCalled();
      expect(held).toBe(KEY);
    });

    it('carries no key anywhere but /api/surveys: the admin area, the move, the words, the pictures', () => {
      held = KEY;
      http.get('/api/admin/surveys').subscribe();
      http.post('/api/visitor/move', {}).subscribe();
      http.get('/api/translations/sk').subscribe();
      http.get('/api/images/12.webp').subscribe();
      http.get('/api/surveysx').subscribe();
      for (const url of ['/api/admin/surveys', '/api/visitor/move', '/api/translations/sk', '/api/images/12.webp', '/api/surveysx']) {
        const request = server.expectOne(url);
        expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
        expect(request.request.headers.has('Authorization')).toBe(false);
      }
    });

    it('forgets a key the server no longer knows - only while it is the one held - and goes once more without it', () => {
      held = KEY;
      http.get('/api/surveys').subscribe();
      server.expectOne('/api/surveys').flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      expect(visitor.forget).toHaveBeenCalledWith(KEY, true);
      expect(held).toBeNull();
      const again = server.expectOne('/api/surveys');
      expect(again.request.headers.has('X-Visitor-Key')).toBe(false);
      again.flush({ surveys: [] });
    });

    it('goes once more with the key another tab was given meanwhile - and only once', () => {
      held = KEY;
      visitor.forget.mockImplementationOnce(() => {
        // Another tab stored a new key just before: this one is not forgotten over it.
        held = OTHER_KEY;
      });
      http.get('/api/surveys').subscribe(fail);
      server.expectOne('/api/surveys').flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      const again = server.expectOne('/api/surveys');
      expect(again.request.headers.get('X-Visitor-Key')).toBe(OTHER_KEY);
      again.flush({ code: 'visitor_unknown' }, { status: 401, statusText: 'Unauthorized' });
      server.expectNone('/api/surveys');
      expect((failed as HttpErrorResponse).status).toBe(401);
    });

    it('while the site requires a sign-in: sends neither key nor token, keeps the key, and takes no new one', () => {
      auth.loginRequired.mockReturnValue(true);
      held = KEY;
      http.post('/api/surveys/hry/responses', {}).subscribe(fail);
      const request = server.expectOne('/api/surveys/hry/responses');
      expect(request.request.headers.has('X-Visitor-Key')).toBe(false);
      request.flush({ code: 'sign_in_required' }, { status: 401, statusText: 'Unauthorized', headers: { 'X-Visitor-Key': NEW_KEY } });
      expect(held).toBe(KEY);
      expect(visitor.forget).not.toHaveBeenCalled();
      expect(visitor.remember).not.toHaveBeenCalled();
    });

    it('a 401 sign_in_required from /api/surveys says the switch was turned on since the page loaded - and never forgets the key', () => {
      held = KEY;
      http.get('/api/surveys').subscribe(fail);
      server.expectOne('/api/surveys').flush({ code: 'sign_in_required' }, { status: 401, statusText: 'Unauthorized' });
      expect(auth.noteLoginRequired).toHaveBeenCalledTimes(1);
      expect(held).toBe(KEY);
      server.expectNone('/api/surveys');
    });

    it('a 401 sign_in_required from anything else says nothing of the switch: the preview’s admin calls refuse nobody anyway', () => {
      http.get('/api/admin/surveys/s1').subscribe(fail);
      server.expectOne('/api/admin/surveys/s1').flush({ code: 'sign_in_required' }, { status: 401, statusText: 'Unauthorized' });
      expect(auth.noteLoginRequired).not.toHaveBeenCalled();
    });
  });

  it('counts a write while it is on its way - a sign-in waits for it - and not a read', async () => {
    auth.signedIn.mockReturnValue(false);
    const saves = TestBed.inject(SavesInFlight);
    http.get('/api/surveys').subscribe();
    expect(saves.count()).toBe(0);
    http.post('/api/surveys/hry/responses', {}).subscribe();
    expect(saves.count()).toBe(1);
    server.expectOne('/api/surveys').flush({ surveys: [] });
    server.expectOne('/api/surveys/hry/responses').flush({ id: 'r1' }, { status: 201, statusText: 'Created' });
    expect(saves.count()).toBe(0);
  });

  it('leaves the site’s words alone: no token, and no waiting for one', () => {
    http.get('/api/translations/sk').subscribe();
    // At once - not after a token has been fetched or refreshed.
    const request = server.expectOne('/api/translations/sk');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(auth.accessToken).not.toHaveBeenCalled();
    request.flush({});
  });

  it('leaves the sign-in settings and the pictures alone, as before', () => {
    http.get('/api/auth/config').subscribe();
    http.get('/api/images/12.webp').subscribe();
    expect(server.expectOne('/api/auth/config').request.headers.has('Authorization')).toBe(false);
    expect(server.expectOne('/api/images/12.webp').request.headers.has('Authorization')).toBe(false);
    expect(auth.accessToken).not.toHaveBeenCalled();
  });

  it('does not take an address that only begins like the words’ for one of them', async () => {
    http.get('/api/translations-export').subscribe();
    const request = await vi.waitFor(() => server.expectOne('/api/translations-export'));
    expect(request.request.headers.get('Authorization')).toBe('Bearer a-token');
  });
});
