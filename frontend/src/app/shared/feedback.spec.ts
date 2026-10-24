import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ANOTOKI_FEEDBACK_CONFIG, feedbackWords } from '@anotoki/lib/feedback';
import { FeedbackFormComponent } from '@anotoki/lib/feedback/form';
import { AuthService } from './auth/auth.service';
import { provideSiteFeedback } from './feedback';
import { provideTestTranslations } from './testing/test-translations';
import { FORMAL_SLOVAK } from './translations';

/**
 * The family's feedback form as this site sets it up (shared/feedback.ts): drawn
 * for real, in the language on the page and this site's formal Slovak, for
 * somebody signed in and for anybody else - no address ever written in.
 */
describe('the feedback form, as the survey sets it up', () => {
  let fixture: ComponentFixture<FeedbackFormComponent>;
  let host: HTMLElement;
  let requests: HttpTestingController;
  // As AuthService has them: a person signed in - their address in the token, shown in the bar, never kept here - or nobody.
  const person = signal<{ id: string; name: string } | null>(null);

  async function draw(language: 'sk' | 'en' = 'sk'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        language === 'sk' ? provideTestTranslations({}, { language: 'sk' }) : provideTestTranslations({}),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideSiteFeedback(),
        { provide: AuthService, useValue: { person: () => person(), user: () => (person() ? { sub: person()!.id, email: 'pat@example.org' } : null) } },
      ],
    });
    requests = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(FeedbackFormComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => person.set(null));
  afterEach(() => requests.verify());

  it('speaks this site’s formal Slovak where the library’s speaks to the reader informally - with no strings from the server, and from the database’s', async () => {
    await draw('sk');
    expect(host.getAttribute('lang')).toBe('sk');
    expect(host.querySelector('.anotoki-feedback-form__title')?.textContent?.trim()).toBe('Pošlite nám spätnú väzbu');
    expect(host.querySelector('.anotoki-feedback-form__lead')?.textContent?.trim()).toBe(FORMAL_SLOVAK['anotoki.feedback.lead']);
    expect(feedbackWords('sk').words.title, 'the library’s own, which this site never shows').toBe('Pošli nám spätnú väzbu');
    const config = TestBed.inject(ANOTOKI_FEEDBACK_CONFIG);
    expect(config.language?.()).toBe('sk');
    for (const [key, words] of Object.entries(FORMAL_SLOVAK).filter(([key]) => key.startsWith('anotoki.feedback.'))) {
      expect(config.translate?.(key), key).toBe(words);
    }
    expect(Object.keys(FORMAL_SLOVAK).filter((key) => key.startsWith('anotoki.feedback.')).length, 'the sixteen that speak to the reader').toBe(16);
  });

  it('for somebody signed in: "send it without my name" - and no address written in: the IAM is the only holder of anybody’s address', async () => {
    person.set({ id: '101', name: 'pat' });
    await draw('sk');
    expect(host.querySelector('[data-anonymous]')).not.toBeNull();
    expect(host.querySelector<HTMLInputElement>('[data-email] input')?.value).toBe('');
    expect(TestBed.inject(ANOTOKI_FEEDBACK_CONFIG).email).toBeUndefined();
  });

  it('for anybody else - nobody, a visitor - no "without my name": there is no name to leave out', async () => {
    await draw('sk');
    expect(host.querySelector('[data-anonymous]')).toBeNull();
    expect(TestBed.inject(ANOTOKI_FEEDBACK_CONFIG).signedIn?.()).toBe(false);
  });

  it('sends what was written to the site’s own route, in the language on the page, with no address it was not given - and thanks', async () => {
    person.set({ id: '101', name: 'pat' });
    await draw('en');
    const message = host.querySelector<HTMLTextAreaElement>('[data-message] textarea')!;
    message.value = 'The Next button does nothing on step 2.';
    message.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    host.querySelector<HTMLButtonElement>('[data-send]')!.click();
    await fixture.whenStable();

    const sent = requests.expectOne('/api/feedback');
    expect(sent.request.method).toBe('POST');
    expect(sent.request.body).toEqual({ kind: 'bug', message: 'The Next button does nothing on step 2.', page: location.pathname, language: 'en', website: '' });
    sent.flush({ ok: true }, { status: 201, statusText: 'Created' });
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(host.querySelector('[data-thanks]')).not.toBeNull();
    });
  });
});
