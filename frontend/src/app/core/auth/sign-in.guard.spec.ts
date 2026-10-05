import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { ToastService } from '../../ui/toast/toast.service';
import { provideTestTranslations } from '../testing/test-translations';
import { AuthService, BootStatus, SignInFailure } from './auth.service';
import { signInGuard, takeSurveysGuard } from './sign-in.guard';

@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageComponent {}

describe('signInGuard and takeSurveysGuard', () => {
  const signedIn = signal(false);
  const status = signal<BootStatus>('ready');
  const failure = signal<SignInFailure | null>(null);
  const welcome = signal(false);
  const auth = { signedIn: () => signedIn(), visitorsWelcome: () => welcome(), status, signInFailure: failure, signIn: vi.fn(async (_returnTo?: string, _uiLocales?: string) => true) };

  beforeEach(() => {
    signedIn.set(false);
    status.set('ready');
    failure.set(null);
    welcome.set(false);
    auth.signIn.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin', canActivate: [signInGuard], component: PageComponent },
          {
            path: '',
            canActivateChild: [takeSurveysGuard],
            children: [
              { path: 'preview/:surveyId', canActivate: [signInGuard], component: PageComponent },
              { path: ':slug', component: PageComponent },
            ],
          },
        ]),
        provideTestTranslations({ 'signIn.storageUnavailable': 'Tento prehliadač nedovolil stránke zapamätať si prebiehajúce prihlásenie.' }, { language: 'sk' }),
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  const go = (url: string) => TestBed.inject(Router).navigateByUrl(url);

  it('lets somebody signed in through, on every page', async () => {
    signedIn.set(true);
    expect(await go('/genshin-6-1?lang=sk')).toBe(true);
    expect(await go('/admin')).toBe(true);
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('sends anybody else to the IAM first - nothing drawn - and back to the address they asked for, in their language', async () => {
    expect(await go('/genshin-6-1?x=1')).toBe(false);
    expect(auth.signIn).toHaveBeenCalledWith('/genshin-6-1?x=1', 'sk');
    expect(await go('/admin')).toBe(false);
    expect(auth.signIn).toHaveBeenLastCalledWith('/admin', 'sk');
  });

  it('lets a page load that came back from the IAM without a sign-in through: sent back, the browser would go round for ever', async () => {
    failure.set({ code: 'access_denied', message: 'No.' });
    expect(await go('/genshin-6-1')).toBe(true);
    expect(auth.signIn).not.toHaveBeenCalled();
  });

  it('lets the page through to its card, and says why, when the sign-in cannot even start - not a blank page', async () => {
    // As AuthService does it: the browser refused the site its storage, so the SDK could not keep the sign-in in progress.
    auth.signIn.mockImplementation(async () => {
      failure.set({ code: 'storage_unavailable', message: 'This browser will not let the site remember the sign-in in progress' });
      return false;
    });
    expect(await go('/genshin-6-1')).toBe(true);
    expect(auth.signIn).toHaveBeenCalledWith('/genshin-6-1', 'sk');
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((toast) => [toast.message, toast.tone]),
    ).toEqual([['Tento prehliadač nedovolil stránke zapamätať si prebiehajúce prihlásenie.', 'danger']]);
    // From then on, as after a refused sign-in: through, with no second trip.
    expect(await go('/admin')).toBe(true);
    expect(auth.signIn).toHaveBeenCalledTimes(1);
  });

  it('says nothing on the way to the IAM', async () => {
    expect(await go('/genshin-6-1')).toBe(false);
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });

  describe('while the site welcomes visitors (the IAM says sign-in is not required)', () => {
    beforeEach(() => welcome.set(true));

    it('lets anybody onto the pages people take surveys on - no trip to the IAM', async () => {
      expect(await go('/genshin-6-1')).toBe(true);
      expect(auth.signIn).not.toHaveBeenCalled();
    });

    it('still sends a visitor to the IAM for the admin panel and the editor’s preview', async () => {
      expect(await go('/admin')).toBe(false);
      expect(auth.signIn).toHaveBeenLastCalledWith('/admin', 'sk');
      expect(await go('/preview/survey-1')).toBe(false);
      expect(auth.signIn).toHaveBeenLastCalledWith('/preview/survey-1', 'sk');
    });
  });

  it('sends anybody to the IAM for the preview, as for every page, while sign-in is required - once', async () => {
    expect(await go('/preview/survey-1')).toBe(false);
    expect(auth.signIn).toHaveBeenCalledTimes(1);
  });

  it('sends nobody anywhere while the site cannot run - the boot pages are drawn then', async () => {
    for (const state of ['loading', 'not-set-up', 'error'] as const) {
      status.set(state);
      expect(await go('/genshin-6-1')).toBe(false);
    }
    expect(auth.signIn).not.toHaveBeenCalled();
  });
});
