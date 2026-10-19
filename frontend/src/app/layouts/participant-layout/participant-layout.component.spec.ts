import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { provideAnotokiLegal } from '@anotoki/lib/legal';
import { ToastService } from '@anotoki/lib/ui/toast';
import { VisitorMove } from '../../core/api/api.service';
import { AuthService, SignInFailure } from '../../core/auth/auth.service';
import { VisitorKey } from '../../core/auth/visitor-key';
import { Changelog } from '../../core/changelog/changelog.service';
import { provideSiteFeedback } from '../../core/feedback';
import { surveyLegalConfig } from '../../core/legal/legal.config';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { FORMAL_SLOVAK } from '../../core/translations';
import { TopBarComponent } from '../top-bar/top-bar.component';
import { ParticipantLayoutComponent } from './participant-layout.component';

/** The top bar has its own spec; here it is only a place at the top. */
@Component({ selector: 'app-top-bar', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class TopBarStubComponent {
  readonly area = input<'survey' | 'admin'>('survey');
  readonly width = input<'wide' | 'narrow'>('wide');
}

@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '<p class="stub-page">A survey</p>' })
class PageComponent {}

@Component({ selector: 'app-test-site', imports: [RouterOutlet], changeDetection: ChangeDetectionStrategy.OnPush, template: '<router-outlet />' })
class SiteComponent {}

/** Where the anotoki family's screen of a failed sign-in stands (the callback route). */
@Component({ selector: 'app-test-failure', changeDetection: ChangeDetectionStrategy.OnPush, template: '<p class="failure-screen">Signing in did not work</p>' })
class FailureScreenComponent {}

const SLOVAK = {
  'common.skipToSurvey': 'Preskočiť na prieskum',
  'common.signIn': 'Prihlásiť sa',
  'signedOut.heading': 'Nie ste prihlásení',
  'signedOut.text': 'Prieskumy sú pre prihlásených s anotoki účtom, ktorý zaručuje, že každý odpovie iba raz. Po prihlásení sa vrátite na túto stránku aj s rozpracovanými odpoveďami.',
  'visitor.moved.one': '1 prieskum, ktorý ste vyplnili bez prihlásenia, je teraz vo Vašom účte.',
  'visitor.moved.few': '{count} prieskumy, ktoré ste vyplnili bez prihlásenia, sú teraz vo Vašom účte.',
  'visitor.moved.other': '{count} prieskumov, ktoré ste vyplnili bez prihlásenia, je teraz vo Vašom účte.',
  'visitor.kept.one': '1 prieskum, ktorý ste vyplnili bez prihlásenia, ste už predtým vyplnili aj vo svojom účte – zostávajú Vaše skoršie odpovede.',
  'visitor.kept.few': '{count} prieskumy, ktoré ste vyplnili bez prihlásenia, ste už predtým vyplnili aj vo svojom účte – zostávajú Vaše skoršie odpovede.',
  'visitor.kept.other': '{count} prieskumov, ktoré ste vyplnili bez prihlásenia, ste už predtým vyplnili aj vo svojom účte – zostávajú Vaše skoršie odpovede.',
  'visitor.lost': 'Predchádzajúca návšteva bez prihlásenia sa v tomto prehliadači skončila, takže prieskumy môžete vyplniť znova.',
};

describe('ParticipantLayoutComponent', () => {
  const signedIn = signal(true);
  const welcome = signal(false);
  const failure = signal<SignInFailure | null>(null);
  const auth = {
    signedIn: () => signedIn(),
    // Whom the feedback form is for (core/feedback.ts): the person signed in - no address of theirs is ever handed to it.
    person: () => (signedIn() ? { id: '101', name: 'pat' } : null),
    visitorsWelcome: () => welcome(),
    signInFailure: failure,
    signIn: vi.fn(async (_returnTo?: string, _prompt?: 'login') => true),
  };
  const visitor = { moved: signal<VisitorMove | null>(null), lost: signal(false) };
  /** The survey's versions as the footer reads them (core/changelog/): the newest is the version; What's new opens the site's dialog. */
  const changelog = { current: signal<string | null>('0.4.0'), open: vi.fn(async () => undefined) };

  let fixture: ComponentFixture<SiteComponent>;
  let host: HTMLElement;
  const text = (selector: string) => (host.querySelector(selector)?.textContent ?? '').replace(/\s+/g, ' ').trim();
  /** The family's footer's first row as it is read: each part's words, and the dots between them. */
  const footerRow = () => Array.from(host.querySelectorAll('anotoki-site-footer .anotoki-site-footer__row > *')).map((part) => (part.textContent ?? '').replace(/\s+/g, ' ').trim());
  /** About · Support · Terms · Privacy · Contact in the footer: [the words, where each goes]. */
  const footerLinks = () =>
    Array.from(host.querySelectorAll<HTMLAnchorElement>('anotoki-site-footer anotoki-legal-links a')).map((link) => [(link.textContent ?? '').trim(), link.getAttribute('href')]);

  beforeEach(async () => {
    signedIn.set(true);
    welcome.set(false);
    visitor.moved.set(null);
    visitor.lost.set(false);
    failure.set(null);
    changelog.current.set('0.4.0');
    changelog.open.mockClear();
    auth.signIn.mockReset().mockResolvedValue(true);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'auth/callback', component: FailureScreenComponent },
          {
            path: '',
            component: ParticipantLayoutComponent,
            children: [
              { path: 'preview/:surveyId', component: PageComponent },
              { path: ':slug', component: PageComponent },
            ],
          },
        ]),
        provideTestTranslations(SLOVAK, { language: 'sk' }),
        { provide: AuthService, useValue: auth },
        { provide: VisitorKey, useValue: visitor },
        { provide: Changelog, useValue: changelog },
        // What the family's footer reads, wired as the app wires it (app.config.ts): its links' words and paths, and the
        // feedback form its Feedback opens.
        provideAnotokiLegal(surveyLegalConfig),
        provideSiteFeedback(),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    TestBed.overrideComponent(ParticipantLayoutComponent, { remove: { imports: [TopBarComponent] }, add: { imports: [TopBarStubComponent] } });
    fixture = TestBed.createComponent(SiteComponent);
    host = fixture.nativeElement;
    await TestBed.inject(Router).navigateByUrl('/genshin-6-1');
    await fixture.whenStable();
  });

  it('draws the page for somebody signed in, and no card', () => {
    expect(text('.stub-page')).toBe('A survey');
    expect(host.querySelector('anotoki-empty-state')).toBeNull();
  });

  it('takes the page away the moment nobody is signed in - nothing of the survey stays - with no navigation', async () => {
    signedIn.set(false);
    await fixture.whenStable();

    expect(host.querySelector('.stub-page')).toBeNull();
    expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('Nie ste prihlásení');
    expect(text('anotoki-empty-state .anotoki-empty-state__text')).toBe(SLOVAK['signedOut.text']);
    expect(TestBed.inject(Router).url).toBe('/genshin-6-1');

    signedIn.set(true);
    await fixture.whenStable();
    expect(text('.stub-page')).toBe('A survey');
  });

  it('signs in from the card, back to this page (the library opens the IAM in the language the person reads)', async () => {
    signedIn.set(false);
    await fixture.whenStable();
    const button = host.querySelector<HTMLButtonElement>('anotoki-empty-state button')!;
    expect(text('anotoki-empty-state button')).toBe('Prihlásiť sa');
    button.click();
    expect(auth.signIn).toHaveBeenCalledTimes(1);
    expect(auth.signIn.mock.calls[0][0]).toBeUndefined();
    await fixture.whenStable();
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });

  it('opens the screen that says why when the sign-in cannot even start - the browser refuses the site its storage', async () => {
    auth.signIn.mockImplementation(async () => {
      failure.set({ code: 'storage_unavailable', returnTo: '/genshin-6-1' });
      return false;
    });
    signedIn.set(false);
    await fixture.whenStable();
    host.querySelector<HTMLButtonElement>('anotoki-empty-state button')!.click();
    for (let turn = 0; turn < 3; turn++) {
      await fixture.whenStable();
    }
    expect(TestBed.inject(Router).url).toBe('/auth/callback');
    expect(text('.failure-screen')).toBe('Signing in did not work');
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
  });

  describe('while the site welcomes visitors', () => {
    beforeEach(async () => {
      welcome.set(true);
      signedIn.set(false);
      await fixture.whenStable();
    });

    it('draws the page for somebody who is not signed in, and no card', () => {
      expect(text('.stub-page')).toBe('A survey');
      expect(host.querySelector('anotoki-empty-state')).toBeNull();
    });

    it('takes the page away when the site comes to require a sign-in', async () => {
      welcome.set(false);
      await fixture.whenStable();
      expect(host.querySelector('.stub-page')).toBeNull();
      expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('Nie ste prihlásení');
    });

    it('draws the editor’s preview for nobody but somebody signed in - the card stands there for a visitor', async () => {
      await TestBed.inject(Router).navigateByUrl('/preview/survey-1');
      await fixture.whenStable();
      expect(host.querySelector('.stub-page')).toBeNull();
      expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('Nie ste prihlásení');

      signedIn.set(true);
      await fixture.whenStable();
      expect(text('.stub-page')).toBe('A survey');

      signedIn.set(false);
      await TestBed.inject(Router).navigateByUrl('/genshin-6-1');
      await fixture.whenStable();
      expect(text('.stub-page')).toBe('A survey');
    });
  });

  it('says once what the move after a sign-in did, in the reader’s language - what moved, then what kept the person’s own answers', async () => {
    const toasts = () =>
      TestBed.inject(ToastService)
        .toasts()
        .map((toast) => [toast.message, toast.tone]);
    visitor.moved.set({ found: true, moved: 3, kept: 1 });
    await fixture.whenStable();
    expect(toasts()).toEqual([[`${SLOVAK['visitor.moved.few'].replace('{count}', '3')} ${SLOVAK['visitor.kept.one']}`, 'success']]);
    expect(visitor.moved()).toBeNull();

    visitor.moved.set({ found: true, moved: 0, kept: 5 });
    await fixture.whenStable();
    expect(toasts()[1]).toEqual([SLOVAK['visitor.kept.other'].replace('{count}', '5'), 'success']);
  });

  it('says once that this browser’s earlier visit has ended', async () => {
    visitor.lost.set(true);
    await fixture.whenStable();
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((toast) => toast.message),
    ).toEqual([SLOVAK['visitor.lost']]);
    expect(visitor.lost()).toBe(false);
  });

  describe('the family’s footer (<anotoki-site-footer>, anotoki-lib 0.6.3)', () => {
    it('stands under the page: the version, What’s new and Feedback, then About · Support · Terms · Privacy · Contact - in the reader’s language, no fan clause', () => {
      const footer = host.querySelector('app-participant-layout > anotoki-site-footer');
      expect(footer?.previousElementSibling?.classList).toContain('page');
      expect(footer?.querySelector(':scope > footer')).not.toBeNull();
      // The version reads "v0.4.0" on screen and "Verzia 0.4.0" to a screen reader (anotoki-lib 0.7.1): its text holds both.
      expect(footerRow()).toEqual(['v0.4.0Verzia 0.4.0', '·', 'Čo je nové', '·', 'Spätná väzba']);
      expect(footerLinks()).toEqual([
        ['O projekte', '/about'],
        ['Podporiť', '/support'],
        ['Podmienky', '/terms'],
        ['Súkromie', '/privacy'],
        ['Kontakt', '/contact'],
      ]);
      expect(host.querySelector('anotoki-site-footer [data-fan]')).toBeNull();
    });

    it('opens the survey’s own What’s new: the footer tells the frame, which asks the changelog', async () => {
      host.querySelector<HTMLButtonElement>('anotoki-site-footer [data-whats-new]')!.click();
      await fixture.whenStable();
      expect(changelog.open).toHaveBeenCalledTimes(1);
    });

    it('stays under the card for nobody signed in: Feedback and the legal pages are anybody’s here', async () => {
      signedIn.set(false);
      await fixture.whenStable();
      expect(text('anotoki-empty-state .anotoki-empty-state__heading')).toBe('Nie ste prihlásení');
      expect(footerRow()).toEqual(['v0.4.0Verzia 0.4.0', '·', 'Čo je nové', '·', 'Spätná väzba']);
      expect(footerLinks().map(([words]) => words)).toEqual(['O projekte', 'Podporiť', 'Podmienky', 'Súkromie', 'Kontakt']);
    });

    it('says no version and offers no What’s new while the list of versions cannot be had - Feedback stays', async () => {
      changelog.current.set(null);
      await fixture.whenStable();
      expect(footerRow()).toEqual(['Spätná väzba']);
      expect(host.querySelector('anotoki-site-footer [data-whats-new]')).toBeNull();
    });

    it('opens the family’s feedback form as this site sets it up (core/feedback.ts): formal Slovak, no address written in', async () => {
      host.querySelector<HTMLButtonElement>('anotoki-site-footer [data-open-feedback]')!.click();
      await vi.waitFor(async () => {
        await fixture.whenStable();
        expect(host.querySelector('[data-feedback-dialog] anotoki-feedback-form [data-message]')).not.toBeNull();
      });
      const dialog = host.querySelector('[data-feedback-dialog]')!;
      expect(text('[data-feedback-dialog] .anotoki-dialog__title')).toBe('Spätná väzba');
      expect(text('[data-feedback-dialog] .anotoki-feedback-form__lead')).toBe(FORMAL_SLOVAK['anotoki.feedback.lead']);
      // Signed in: "send it without my name" - and the reply address only what the sender types.
      expect(dialog.querySelector('[data-anonymous]')).not.toBeNull();
      expect(dialog.querySelector<HTMLInputElement>('[data-email] input')?.value).toBe('');
      TestBed.inject(HttpTestingController).verify();
    });
  });
});
