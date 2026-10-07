import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { AuthService } from './auth.service';
import { SavesInFlight } from './saves-in-flight';

describe('AuthService.signIn()', () => {
  let auth: AuthService;
  const login = vi.fn();

  beforeEach(() => {
    login.mockReset();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    // The SDK as init() leaves it - only login() is asked for here.
    (auth as unknown as { _client: { login: typeof login } })._client = { login };
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('answers true on the way to the IAM, back to the address and in the language asked for', async () => {
    login.mockResolvedValue(undefined);
    expect(await auth.signIn('/genshin-6-1?x=1', 'sk')).toBe(true);
    expect(login).toHaveBeenCalledWith({ returnTo: '/genshin-6-1?x=1', uiLocales: 'sk' });
    expect(auth.signInFailure()).toBeNull();
  });

  it('answers false, and says why in signInFailure, when the browser refuses the site the storage the sign-in needs', async () => {
    login.mockRejectedValue(Object.assign(new Error('This browser will not let the site remember the sign-in in progress'), { code: 'storage_unavailable' }));
    expect(await auth.signIn('/', 'en')).toBe(false);
    expect(auth.signInFailure()).toEqual({ code: 'storage_unavailable', message: 'This browser will not let the site remember the sign-in in progress' });
  });

  it('keeps no code that is not a string: the failure is then one without a sentence of its own', async () => {
    login.mockRejectedValue({ code: 42 });
    expect(await auth.signIn('/')).toBe(false);
    expect(auth.signInFailure()).toEqual({ code: '', message: '' });
  });

  it('leaves for the IAM only once the sends on their way have their answers: a visitor’s first answers bring the key the move needs', async () => {
    login.mockResolvedValue(undefined);
    const saves = TestBed.inject(SavesInFlight);
    const end = saves.begin();
    const going = auth.signIn('/genshin-6-1', 'sk');
    await new Promise((done) => setTimeout(done));
    expect(login).not.toHaveBeenCalled();
    end();
    expect(await going).toBe(true);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it('answers false, with nothing to say, before the sign-in is set up', async () => {
    (auth as unknown as { _client: null })._client = null;
    expect(await auth.signIn('/')).toBe(false);
    expect(auth.signInFailure()).toBeNull();
  });
});

describe("AuthService.init(): what the sign-in settings say - the IAM's switch", () => {
  let auth: AuthService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    // The SDK, already made: init() only restores the session here.
    const roles = ['ADMIN'];
    (auth as unknown as { _client: object })._client = {
      init: async () => ({}),
      user: () => ({ sub: 1, preferred_username: 'owner', roles }),
      isAuthenticated: () => true,
    };
  });

  async function started(config: object): Promise<void> {
    const done = auth.init();
    http.expectOne('/api/auth/config').flush(config);
    await done;
  }

  it('signs in - the status is ready - and the token says who is the site’s ADMIN (the one the Migrations page is for)', async () => {
    await started({ issuer: 'https://iam.example.test', clientId: 'survey' });
    expect(auth.status()).toBe('ready');
    expect(auth.signedIn()).toBe(true);
    expect(auth.isAdmin()).toBe(true);
    expect(auth.isStaff()).toBe(true);
  });

  it('reads the IAM\'s "Sign-in required" switch as the backend relays it: true unless it says false', async () => {
    expect(auth.loginRequired()).toBe(true);
    expect(auth.visitorsWelcome()).toBe(false);
    await started({ issuer: 'https://iam.example.test', clientId: 'survey', loginRequired: false, visitorDays: 30 });
    expect(auth.loginRequired()).toBe(false);
    expect(auth.visitorDays()).toBe(30);
    expect(auth.visitorsWelcome()).toBe(true);
  });

  it('welcomes no visitor from a backend that does not say how long it keeps one: a backend from before visitors', async () => {
    for (const visitorDays of [undefined, 0, 1.5, '30', null]) {
      await started({ issuer: 'https://iam.example.test', clientId: 'survey', loginRequired: false, visitorDays });
      expect(auth.visitorDays()).toBeNull();
      expect(auth.visitorsWelcome()).toBe(false);
    }
    await started({ issuer: 'https://iam.example.test', clientId: 'survey', loginRequired: false, visitorDays: 7 });
    expect(auth.visitorDays()).toBe(7);
    expect(auth.visitorsWelcome()).toBe(true);
  });

  it('stops welcoming visitors when the server says sign-in has become required since the page loaded', async () => {
    await started({ issuer: 'https://iam.example.test', clientId: 'survey', loginRequired: false, visitorDays: 30 });
    auth.noteLoginRequired();
    expect(auth.loginRequired()).toBe(true);
    expect(auth.visitorsWelcome()).toBe(false);
  });

  it('says who takes the surveys: the person signed in by their id, else the visitor while visitors are welcome, else nobody', async () => {
    await started({ issuer: 'https://iam.example.test', clientId: 'survey', loginRequired: false, visitorDays: 30 });
    expect(auth.taker()).toEqual({ id: '1', visitor: false });
    expect(auth.visiting()).toBe(false);

    (auth as unknown as { _client: { isAuthenticated: () => boolean; user: () => null } })._client.isAuthenticated = () => false;
    (auth as unknown as { _client: { user: () => null } })._client.user = () => null;
    await started({ issuer: 'https://iam.example.test', clientId: 'survey', loginRequired: false, visitorDays: 30 });
    expect(auth.taker()).toEqual({ id: 'visitor', visitor: true });
    expect(auth.visiting()).toBe(true);

    await started({ issuer: 'https://iam.example.test', clientId: 'survey', loginRequired: true, visitorDays: 30 });
    expect(auth.taker()).toBeNull();
    expect(auth.visiting()).toBe(false);
  });

  it('requires sign-in when the backend says so, says nothing, or says something that is not false', async () => {
    for (const loginRequired of [true, undefined, 'false', 0, null]) {
      await started({ issuer: 'https://iam.example.test', clientId: 'survey', loginRequired });
      expect(auth.loginRequired()).toBe(true);
      expect(auth.visitorsWelcome()).toBe(false);
    }
  });

  it('welcomes nobody while the site cannot run, whatever the switch', async () => {
    const done = auth.init();
    http.expectOne('/api/auth/config').flush({ code: 'not_set_up' }, { status: 503, statusText: 'Service Unavailable' });
    await done;
    expect(auth.status()).toBe('not-set-up');
    expect(auth.visitorsWelcome()).toBe(false);
  });

  it('a MEMBER - every account holds it - is an ordinary person: neither staff nor an ADMIN', async () => {
    (auth as unknown as { _client: { user: () => object } })._client.user = () => ({ sub: 3, preferred_username: 'pat', roles: ['MEMBER'] });
    await started({ issuer: 'https://iam.example.test', clientId: 'survey' });
    expect(auth.signedIn()).toBe(true);
    expect(auth.isStaff()).toBe(false);
    expect(auth.isAdmin()).toBe(false);
  });

  it('an EDITOR is staff, and no ADMIN: the Migrations page is not theirs', async () => {
    (auth as unknown as { _client: { user: () => object } })._client.user = () => ({ sub: 2, preferred_username: 'edith', roles: ['EDITOR'] });
    await started({ issuer: 'https://iam.example.test', clientId: 'survey' });
    expect(auth.isStaff()).toBe(true);
    expect(auth.isAdmin()).toBe(false);
  });
});

describe('AuthService: the account’s preferences - the theme, the date order and the clock every anotoki site follows', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  const client = { init: async () => ({}), user: vi.fn(), isAuthenticated: vi.fn(), savePreferences: vi.fn() };
  const PREFERENCES = { theme: 'dark', date_format: 'ymd_dash', time_format: '24' };

  beforeEach(() => {
    client.user.mockReset();
    client.isAuthenticated.mockReset();
    client.savePreferences.mockReset();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    // The SDK, already made: init() only restores the session here.
    (auth as unknown as { _client: object })._client = client;
  });

  /** The site started with this person signed in - or nobody. */
  async function startedWith(user: object | null): Promise<void> {
    client.user.mockReturnValue(user);
    client.isAuthenticated.mockReturnValue(user !== null);
    const done = auth.init();
    http.expectOne('/api/auth/config').flush({ issuer: 'https://iam.example.test', clientId: 'survey' });
    await done;
  }

  it('are the signed-in person’s, as the IAM sends them', async () => {
    await startedWith({ sub: '7', preferred_username: 'owner', roles: ['MEMBER'], locale: 'sk', preferences: PREFERENCES });
    expect(auth.preferences()).toEqual(PREFERENCES);
  });

  it('are null while nobody is signed in, and for an IAM that sends none - the site keeps its own then', async () => {
    await startedWith(null);
    expect(auth.preferences()).toBeNull();
    await startedWith({ sub: '7', preferred_username: 'owner', roles: ['MEMBER'], locale: 'sk', preferences: null });
    expect(auth.preferences()).toBeNull();
    // A session kept by a copy of the SDK from before preferences.
    await startedWith({ sub: '7', preferred_username: 'owner', roles: ['MEMBER'], locale: 'sk' });
    expect(auth.preferences()).toBeNull();
  });

  it('are saved through the SDK - for every anotoki site - and its refusal, with the IAM’s code, is the caller’s', async () => {
    await startedWith({ sub: '7', preferred_username: 'owner', roles: ['MEMBER'], locale: 'sk', preferences: PREFERENCES });
    client.savePreferences.mockResolvedValue({ locale: 'sk', preferences: { ...PREFERENCES, theme: 'light' } });
    await expect(auth.savePreferences({ theme: 'light' })).resolves.toEqual({ locale: 'sk', preferences: { ...PREFERENCES, theme: 'light' } });
    expect(client.savePreferences).toHaveBeenCalledWith({ theme: 'light' });

    client.savePreferences.mockRejectedValue(Object.assign(new Error('Not a language the IAM offers'), { code: 'invalid_request' }));
    await expect(auth.savePreferences({ language: 'de' })).rejects.toMatchObject({ code: 'invalid_request' });
  });

  it('cannot be saved before the sign-in is set up: login_required', async () => {
    (auth as unknown as { _client: null })._client = null;
    await expect(auth.savePreferences({ theme: 'light' })).rejects.toMatchObject({ code: 'login_required' });
  });
});
