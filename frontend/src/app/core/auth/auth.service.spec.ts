import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { inject } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { SavesInFlight } from '@anotoki/lib/auth';
import { type TestAnotokiAuth, type TestAnotokiAuthOptions, provideTestAnotokiAuth, testAnotokiAuth } from '@anotoki/lib/auth/testing';
import { VISITOR_SLOT } from '../survey/drafts';
import { AuthService } from './auth.service';

/**
 * AuthService is the survey's face of the anotoki family's sign-in
 * (@anotoki/lib/auth): it reads the backend's boot configuration itself and
 * hands it to the library, which the specs run with the library's own client
 * in memory (provideTestAnotokiAuth) - nothing leaves the test.
 */
const IAM = { issuer: 'https://iam.example.test', client_id: 'survey' };

interface Started {
  auth: AuthService;
  http: HttpTestingController;
  handle: TestAnotokiAuth;
}

function setUp(options: TestAnotokiAuthOptions = {}): Started {
  const handle = testAnotokiAuth();
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      // The boot configuration is the one AuthService read from the backend, as in the app (core/auth/auth.config.ts).
      ...provideTestAnotokiAuth({ ...options, config: { config: () => inject(AuthService).bootConfig() } }, handle),
    ],
  });
  return { auth: TestBed.inject(AuthService), http: TestBed.inject(HttpTestingController), handle };
}

/** The start, with the backend answering `config` to GET /api/auth/config. */
async function start(started: Started, config: object): Promise<void> {
  const done = started.auth.init();
  started.http.expectOne('/api/auth/config').flush(config);
  await done;
}

afterEach(() => vi.restoreAllMocks());

describe('AuthService.init(): what the sign-in settings say', () => {
  it('signs in - the status is ready - and the token says who is the site’s ADMIN (the one the system pages are for)', async () => {
    const started = setUp({ user: { sub: '1', preferred_username: 'owner' }, roles: ['MEMBER', 'ADMIN'] });
    expect(started.auth.status()).toBe('loading');
    expect(started.auth.bootConfig()).toBeNull();
    await start(started, { ...IAM, login_required: true, visitor_days: 30 });
    expect(started.auth.status()).toBe('ready');
    expect(started.auth.signedIn()).toBe(true);
    expect(started.auth.isAdmin()).toBe(true);
    expect(started.auth.isStaff()).toBe(true);
    expect(started.auth.person()).toEqual({ id: '1', name: 'owner' });
    expect(started.auth.bootConfig()).toEqual({ ...IAM, login_required: true, visitor_days: 30 });
  });

  it('a MEMBER - every account holds it - is an ordinary person: neither staff nor an ADMIN', async () => {
    const started = setUp({ user: { sub: '3', preferred_username: 'pat' }, roles: ['MEMBER'] });
    await start(started, IAM);
    expect(started.auth.signedIn()).toBe(true);
    expect(started.auth.isStaff()).toBe(false);
    expect(started.auth.isAdmin()).toBe(false);
  });

  it('an EDITOR is staff, and no ADMIN: the system pages are not theirs', async () => {
    const started = setUp({ user: { sub: '2', preferred_username: 'edith' }, roles: ['MEMBER', 'EDITOR'] });
    await start(started, IAM);
    expect(started.auth.isStaff()).toBe(true);
    expect(started.auth.isAdmin()).toBe(false);
  });

  it('names the person by the IAM’s name - by the address in the token only when there is no name; it keeps no address itself', async () => {
    const started = setUp({ user: { sub: '4', preferred_username: null, email: 'nameless@example.test' } });
    await start(started, IAM);
    expect(started.auth.person()).toEqual({ id: '4', name: 'nameless@example.test' });
  });

  it('reads the IAM\'s "Sign-in required" switch as the backend relays it: true unless it says false', async () => {
    const started = setUp();
    expect(started.auth.loginRequired()).toBe(true);
    expect(started.auth.visitorsWelcome()).toBe(false);
    await start(started, { ...IAM, login_required: false, visitor_days: 30 });
    expect(started.auth.loginRequired()).toBe(false);
    expect(started.auth.visitorDays()).toBe(30);
    expect(started.auth.visitorsWelcome()).toBe(true);
    expect(started.auth.visiting()).toBe(true);
  });

  it('reads the camelCase a backend from before the library answered, too', async () => {
    const started = setUp();
    await start(started, { issuer: IAM.issuer, clientId: 'survey', loginRequired: false, visitorDays: 7 });
    expect(started.auth.loginRequired()).toBe(false);
    expect(started.auth.visitorDays()).toBe(7);
    expect(started.auth.visitorsWelcome()).toBe(true);
  });

  for (const visitor_days of [undefined, 0, 1.5, '30', null]) {
    it(`welcomes no visitor from a backend that does not say how long it keeps one (${JSON.stringify(visitor_days)}) - and tells the library so`, async () => {
      const started = setUp();
      await start(started, { ...IAM, login_required: false, visitor_days });
      expect(started.auth.visitorDays()).toBeNull();
      expect(started.auth.visitorsWelcome()).toBe(false);
      expect(started.auth.loginRequired()).toBe(true);
      expect(started.auth.bootConfig()?.login_required).toBe(true);
    });
  }

  for (const login_required of [true, undefined, 'false', 0, null]) {
    it(`requires sign-in when the backend says so, says nothing, or says something that is not false (${JSON.stringify(login_required)})`, async () => {
      const started = setUp();
      await start(started, { ...IAM, login_required, visitor_days: 30 });
      expect(started.auth.loginRequired()).toBe(true);
      expect(started.auth.visitorsWelcome()).toBe(false);
    });
  }

  it('stops welcoming visitors when the server says sign-in has become required since the page loaded', async () => {
    const started = setUp();
    await start(started, { ...IAM, login_required: false, visitor_days: 30 });
    started.auth.noteLoginRequired();
    expect(started.auth.loginRequired()).toBe(true);
    expect(started.auth.visitorsWelcome()).toBe(false);
  });

  it('welcomes nobody while the site is not set up, whatever the switch - and starts no sign-in', async () => {
    const started = setUp();
    const done = started.auth.init();
    started.http.expectOne('/api/auth/config').flush({ code: 'not_set_up' }, { status: 503, statusText: 'Service Unavailable' });
    await done;
    expect(started.auth.status()).toBe('not-set-up');
    expect(started.auth.visitorsWelcome()).toBe(false);
    expect(started.handle.client).toBeNull();
  });

  it('says the server could not be reached - the load error card - and starts the sign-in once it answers (Try again)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const started = setUp({ user: { sub: '1' } });
    const failed = started.auth.init();
    started.http.expectOne('/api/auth/config').error(new ProgressEvent('error'));
    await failed;
    expect(started.auth.status()).toBe('error');
    expect(started.handle.client).toBeNull();

    await start(started, IAM);
    expect(started.auth.status()).toBe('ready');
    expect(started.auth.signedIn()).toBe(true);
  });
});

describe('AuthService: who takes the surveys', () => {
  it('the person signed in, by their id', async () => {
    const started = setUp({ user: { sub: '1', preferred_username: 'owner' } });
    await start(started, { ...IAM, login_required: false, visitor_days: 30 });
    expect(started.auth.taker()).toEqual({ id: '1', visitor: false });
    expect(started.auth.visiting()).toBe(false);
  });

  it('else this browser’s visitor while visitors are welcome', async () => {
    const started = setUp();
    await start(started, { ...IAM, login_required: false, visitor_days: 30 });
    expect(started.auth.taker()).toEqual({ id: VISITOR_SLOT, visitor: true });
  });

  it('else nobody', async () => {
    const started = setUp();
    await start(started, { ...IAM, login_required: true, visitor_days: 30 });
    expect(started.auth.taker()).toBeNull();
    expect(started.auth.visiting()).toBe(false);
  });
});

describe('AuthService.signIn()', () => {
  it('answers true on the way to the IAM, back to the address asked for', async () => {
    const started = setUp();
    await start(started, IAM);
    expect(await started.auth.signIn('/genshin-6-1?x=1')).toBe(true);
    expect(started.handle.client?.logins).toEqual([expect.objectContaining({ returnTo: '/genshin-6-1?x=1' })]);
    expect(started.auth.signInFailure()).toBeNull();
  });

  it('asks the IAM for the password again for the backups’ proof (prompt=login)', async () => {
    const started = setUp({ user: { sub: '1' }, roles: ['ADMIN'] });
    await start(started, IAM);
    expect(await started.auth.signIn('/admin/backups', 'login')).toBe(true);
    expect(started.handle.client?.logins).toEqual([expect.objectContaining({ returnTo: '/admin/backups', prompt: 'login' })]);
  });

  it('answers false, and says why in signInFailure, when the browser refuses the site the storage the sign-in needs', async () => {
    const started = setUp();
    await start(started, IAM);
    started.handle.client!.login = () => Promise.reject(Object.assign(new Error('This browser will not let the site remember the sign-in in progress'), { code: 'storage_unavailable' }));
    expect(await started.auth.signIn('/genshin-6-1')).toBe(false);
    expect(started.auth.signInFailure()).toEqual(expect.objectContaining({ code: 'storage_unavailable' }));
  });

  it('leaves for the IAM only once the sends on their way have their answers: a visitor’s first answers bring the key the move needs', async () => {
    const started = setUp();
    await start(started, { ...IAM, login_required: false, visitor_days: 30 });
    const end = TestBed.inject(SavesInFlight).begin();
    const going = started.auth.signIn('/genshin-6-1');
    await new Promise((done) => setTimeout(done));
    expect(started.handle.client?.logins).toEqual([]);
    end();
    expect(await going).toBe(true);
    expect(started.handle.client?.logins.length).toBe(1);
  });

  it('answers false, with nothing to say, before the sign-in is set up', async () => {
    const started = setUp();
    expect(await started.auth.signIn('/')).toBe(false);
    expect(started.auth.signInFailure()).toBeNull();
  });
});

describe('AuthService: the account’s preferences - the theme, the date order and the clock every anotoki site follows', () => {
  const PREFERENCES = { theme: 'dark', date_format: 'ymd_dash', time_format: '24' } as const;

  it('are the signed-in person’s, as the IAM sends them', async () => {
    const started = setUp({ user: { sub: '7', preferred_username: 'owner', locale: 'sk', preferences: PREFERENCES } });
    await start(started, IAM);
    expect(started.auth.preferences()).toEqual(PREFERENCES);
  });

  it('are null while nobody is signed in, and for an IAM that sends none - the site keeps its own then', async () => {
    const nobody = setUp();
    await start(nobody, IAM);
    expect(nobody.auth.preferences()).toBeNull();

    TestBed.resetTestingModule();
    const none = setUp({ user: { sub: '7', preferences: null } });
    await start(none, IAM);
    expect(none.auth.preferences()).toBeNull();
  });

  it('are saved through the library - for every anotoki site - and its refusal, with the IAM’s code, is the caller’s', async () => {
    const started = setUp({ user: { sub: '7', preferred_username: 'owner', locale: 'sk', preferences: PREFERENCES } });
    await start(started, IAM);
    await expect(started.auth.savePreferences({ theme: 'light' })).resolves.toEqual({ locale: 'sk', preferences: { ...PREFERENCES, theme: 'light' } });
    expect(started.handle.client?.saved).toEqual([{ theme: 'light' }]);

    started.handle.client!.preferencesError = 'invalid_request';
    await expect(started.auth.savePreferences({ language: 'de' })).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('cannot be saved before the sign-in is set up: login_required', async () => {
    const started = setUp();
    await expect(started.auth.savePreferences({ theme: 'light' })).rejects.toMatchObject({ code: 'login_required' });
  });
});
