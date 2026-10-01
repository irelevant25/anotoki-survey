import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor: which calls carry the token', () => {
  const auth = { signedIn: vi.fn(() => true), accessToken: vi.fn(async () => 'a-token'), refreshToken: vi.fn(async () => null) };
  let http: HttpClient;
  let server: HttpTestingController;

  beforeEach(() => {
    auth.signedIn.mockClear();
    auth.accessToken.mockClear();
    TestBed.configureTestingModule({ providers: [provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting(), { provide: AuthService, useValue: auth }] });
    http = TestBed.inject(HttpClient);
    server = TestBed.inject(HttpTestingController);
  });

  afterEach(() => server.verify());

  it('adds it to a call to the site’s own API', async () => {
    http.get('/api/surveys').subscribe();
    const request = await vi.waitFor(() => server.expectOne('/api/surveys'));
    expect(request.request.headers.get('Authorization')).toBe('Bearer a-token');
    expect(auth.accessToken).toHaveBeenCalledTimes(1);
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
