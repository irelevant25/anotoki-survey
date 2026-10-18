import { ChangeDetectionStrategy, Component, Type } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AnotokiAuth } from '@anotoki/lib/auth';
import { provideTestAnotokiAuth } from '@anotoki/lib/auth/testing';
import { ANOTOKI_LEGAL_CONFIG, provideAnotokiLegal } from '@anotoki/lib/legal';
import { ContactPageComponent, PrivacyPageComponent, TermsPageComponent } from '@anotoki/lib/legal/pages';
import { TranslationService } from '@anotoki/lib/translations';
import { AuthService } from '../auth/auth.service';
import { provideTestTranslations } from '../testing/test-translations';
import { SIGN_IN_HINT_COOKIE, SURVEY_LEGAL_UPDATED, surveyLegalFacts, surveyLegalPagesConfig } from './legal-facts';
import { surveyLegalConfig } from './legal.config';

/** The IAM this test's site signs in with: GET /api/auth/config's issuer and client id. */
const IAM = 'https://iam.anotoki.example';

/** Every address a legal page of the survey's may link to: the anotoki account's pages, its own Contact page, the family's address and operator, the authority, Cloudflare. */
const ADDRESSES = [`${IAM}/account`, `${IAM}/privacy`, '/contact', 'mailto:support@anotoki.eu', 'https://codehero.sk', 'https://dataprotection.gov.sk/', 'https://www.websupport.sk', 'https://www.cloudflare.com/privacypolicy/'];

/**
 * The survey's own strings the facts name, as stand-ins: the words themselves are migration 013's (and the
 * backend's tests hold them - no address, formal Slovak); what is checked here is where each goes.
 */
const WORDS: Record<string, string> = {
  'brand.site': 'anotoki survey',
  'legal.about': 'Surveys for the anotoki sites.',
  'legal.record.name': 'Your record',
  'legal.record.what': 'The record.',
  'legal.record.why': 'Why the record.',
  'legal.record.kept': 'How long the record.',
  'legal.answers.name': 'Your answers',
  'legal.answers.what': 'The answers.',
  'legal.answers.why': 'Why the answers.',
  'legal.answers.kept': 'How long the answers.',
  'legal.writing.name': 'Writing surveys',
  'legal.writing.what': 'Who wrote what.',
  'legal.writing.why': 'Why who wrote what.',
  'legal.writing.kept': 'How long who wrote what.',
  'legal.visitors.what': 'A visitor.',
  'legal.visitors.why': 'Why a visitor.',
  'legal.visitors.kept.one': 'The key ends {count} day after the last visit.',
  'legal.visitors.kept.few': 'The key ends {count} days after the last visit.',
  'legal.visitors.kept.other': 'The key ends {count} days after the last visit.',
  'legal.auditLog.what': 'The editors’ and administrators’ changes.',
  'legal.backups.what': 'A copy on each day the site is used.',
  'legal.backups.kept': 'The 14 newest daily copies.',
  'legal.storage.signIn.purpose': 'The sign-in.',
  'legal.storage.signInUnderWay.purpose': 'A sign-in under way.',
  'legal.storage.signInUnderWay.kept': 'Until it comes back.',
  'legal.storage.hint.purpose': 'Never read here.',
  'legal.storage.tabLanguage.purpose': 'A tab’s language.',
  'legal.storage.untilTabClosed': 'Until the tab is closed.',
  'legal.storage.visitorKey.kept': 'Until you sign in.',
  'legal.storage.draft.purpose': 'A survey begun.',
  'legal.storage.draft.kept': 'Until it is sent.',
  'legal.storage.wordDrafts.purpose': 'Unsaved words.',
};

/** The legal pages' frame, as layouts/legal-layout gives the pages their configuration: the survey's, with its facts. */
@Component({
  selector: 'app-test-privacy-frame',
  imports: [PrivacyPageComponent],
  providers: [{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: surveyLegalPagesConfig }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<anotoki-privacy-page />',
})
class PrivacyFrameComponent {}

@Component({
  selector: 'app-test-terms-frame',
  imports: [TermsPageComponent],
  providers: [{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: surveyLegalPagesConfig }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<anotoki-terms-page />',
})
class TermsFrameComponent {}

@Component({
  selector: 'app-test-contact-frame',
  imports: [ContactPageComponent],
  providers: [{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: surveyLegalPagesConfig }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<anotoki-contact-page />',
})
class ContactFrameComponent {}

/**
 * The family's legal pages (@anotoki/lib/legal/pages) as the survey fills them in: the root configuration
 * (core/legal/legal.config.ts - the language, the database's words, no facts) and the facts the pages' frame gives
 * them (core/legal/legal-facts.ts) - drawn for real, so that what the pages say of the survey is checked where people
 * read it: its parts, its cookies and stored items by name, who else handles data, the anotoki account's pages at
 * the IAM's address the site signs in with - and every link where the code says, whatever an administrator rewords.
 */
describe('the legal pages, as the survey fills them in', () => {
  let fixture: ComponentFixture<unknown> | null = null;

  async function configure(values: Record<string, string> = {}, visitorDays: number | null = 30, language: 'en' | 'sk' = 'en'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        language === 'en' ? provideTestTranslations({ ...WORDS, ...values }) : provideTestTranslations({ ...WORDS, ...values }, { language: 'sk', english: WORDS }),
        provideAnotokiLegal(surveyLegalConfig),
        ...provideTestAnotokiAuth({ config: { config: () => ({ issuer: IAM, client_id: 'survey', login_required: true, sign_in_available: true }) } }),
        { provide: AuthService, useValue: { visitorDays: () => visitorDays } },
      ],
    });
    await TestBed.inject(AnotokiAuth).init();
  }

  async function draw(frame: Type<unknown>): Promise<HTMLElement> {
    fixture = TestBed.createComponent(frame);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const texts = (host: HTMLElement, selector: string) => Array.from(host.querySelectorAll(selector)).map((element) => element.textContent?.replace(/\s+/g, ' ').trim());

  afterEach(() => {
    fixture?.destroy();
    fixture = null;
    document.body.innerHTML = '';
  });

  it('the root configuration: the page’s language, the database’s words of the library’s keys - and no facts, which come with the pages’ frame', async () => {
    await configure({ 'anotoki.legal.privacyTitle': 'Our privacy' });
    const config = TestBed.inject(ANOTOKI_LEGAL_CONFIG);
    expect(config.language?.()).toBe('en');
    expect(config.translate?.('anotoki.legal.privacyTitle')).toBe('Our privacy');
    expect(config.paths).toBeUndefined();
    expect(config.operator).toBeUndefined();
    expect(() => config.facts()).toThrow(/frame/);
  });

  it('the facts: three parts of its own, the visitors for the days the server keeps them, its audit log and plain backups in its words, no feedback, its cookies and storage by name, the hosting company and Cloudflare', async () => {
    await configure();
    const facts = surveyLegalFacts(TestBed.inject(TranslationService), TestBed.inject(AnotokiAuth), 14);
    expect(facts.site).toBe('anotoki survey');
    expect(facts.about).toBe(WORDS['legal.about']);
    expect(facts.updated).toBe(SURVEY_LEGAL_UPDATED);
    // The anotoki account's pages at the IAM the site signs in with - never a string's address.
    expect(facts.account).toEqual({ deleteUrl: `${IAM}/account`, privacyUrl: `${IAM}/privacy` });
    expect(facts.data.map((part) => part.name)).toEqual(['Your record', 'Your answers', 'Writing surveys']);
    expect(facts.visitors).toEqual({ what: WORDS['legal.visitors.what'], why: WORDS['legal.visitors.why'], kept: 'The key ends 14 days after the last visit.' });
    expect(facts.feedback).toBeUndefined();
    expect(facts.errorLog).toBeUndefined();
    expect(facts.analytics).toBeUndefined();
    expect(facts.auditLog).toEqual({ what: WORDS['legal.auditLog.what'] });
    expect(facts.backups).toEqual({ what: WORDS['legal.backups.what'], kept: WORDS['legal.backups.kept'] });
    expect(facts.storage.map((item) => [item.name, item.kind ?? null, item.preset ?? null])).toEqual([
      ['anotoki-auth:survey', null, 'signIn'],
      ['anotoki-auth:survey:login:…, anotoki-auth:discovery:…', 'session', null],
      [SIGN_IN_HINT_COOKIE, null, 'signInHint'],
      ['anotoki-survey:theme', null, 'theme'],
      ['anotoki-survey:language, anotoki-survey:language-cache', null, 'language'],
      ['anotoki-survey:language', 'session', null],
      ['anotoki-survey:visitor', null, 'visitorKey'],
      ['anotoki-survey:draft:…', 'local', null],
      ['anotoki-survey:localization-drafts', 'session', null],
    ]);
    expect(facts.processors).toEqual([{ preset: 'hosting', name: 'WebSupport s.r.o.', url: 'https://www.websupport.sk' }, { preset: 'cloudflare' }]);
    // A backend that does not say how long it keeps a visitor: the backend's own default, 30 days.
    expect(surveyLegalFacts(TestBed.inject(TranslationService), TestBed.inject(AnotokiAuth), null).visitors?.kept).toBe('The key ends 30 days after the last visit.');
  });

  it('the Privacy page, drawn for real in the frame’s configuration: the survey’s parts in order, its storage, who else handles data, the account kept by the anotoki account - and every link where the code says, a rewording changing words, never an address', async () => {
    await configure({ 'legal.answers.what': 'See https://evil.example for more.', 'anotoki.legal.accountPage': 'Delete it at https://evil.example' });
    const host = await draw(PrivacyFrameComponent);

    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Privacy policy');
    expect(Array.from(host.querySelectorAll('[data-kept]')).map((part) => part.getAttribute('data-kept'))).toEqual(['data-0', 'data-1', 'data-2', 'visitors', 'error-log', 'audit-log', 'backups']);
    // The survey's words, then the library's sentence for plain backups: on the server, out of public reach.
    const backups = texts(host, '[data-kept="backups"] .anotoki-legal-page__text')[0] ?? '';
    expect([backups.startsWith(`${WORDS['legal.backups.what']} `), backups.includes('out of public reach'), backups.includes('encrypted')]).toEqual([true, true, false]);
    expect(texts(host, '[data-duration="visitors"] dd')).toEqual(['The key ends 30 days after the last visit.']);
    expect(texts(host, '[data-stored] code')).toEqual([
      'anotoki-auth:survey',
      'anotoki-auth:survey:login:…, anotoki-auth:discovery:…',
      'anotoki_signed_in',
      'anotoki-survey:theme',
      'anotoki-survey:language, anotoki-survey:language-cache',
      'anotoki-survey:language',
      'anotoki-survey:visitor',
      'anotoki-survey:draft:…',
      'anotoki-survey:localization-drafts',
    ]);
    expect(texts(host, '[data-recipient] .anotoki-legal-page__item-name')).toEqual(['WebSupport s.r.o.', 'Cloudflare, Inc.']);
    expect(host.querySelector('[data-analytics]')?.textContent).toContain('umami.anotoki.eu');

    // The account: kept by the anotoki account, whose own Privacy page - at the IAM the site signs in with - is linked.
    expect(host.querySelector('[data-account-privacy]')?.getAttribute('href')).toBe(`${IAM}/privacy`);
    const deletion = host.querySelector<HTMLAnchorElement>('[data-account-page]')!;
    expect([deletion.getAttribute('href'), deletion.textContent?.trim()]).toEqual([`${IAM}/account`, 'Delete it at https://evil.example']);
    expect(host.querySelector('[data-kept="data-1"]')?.textContent).toContain('See https://evil.example for more.');
    const links = Array.from(host.querySelectorAll('a[href]')).map((link) => link.getAttribute('href')!);
    expect(links.filter((href) => !href.startsWith('#') && !ADDRESSES.includes(href))).toEqual([]);
    expect(links).not.toContain('https://evil.example');
  });

  it('Terms: what the survey is, first; no fan clause', async () => {
    await configure();
    const host = await draw(TermsFrameComponent);
    expect(host.querySelector('[data-about]')?.textContent?.trim()).toBe(WORDS['legal.about']);
    expect(host.querySelector('[data-section="what"] h2')?.textContent?.trim()).toBe('What anotoki survey is');
    expect(host.querySelector('[data-fan]')).toBeNull();
  });

  it('Contact: the address alone - the survey takes no feedback - and the anotoki account’s page to delete the account', async () => {
    await configure();
    const host = await draw(ContactFrameComponent);
    expect(host.querySelector('[data-open-feedback]')).toBeNull();
    expect(host.querySelector('[data-section="email"] h2')?.textContent?.trim()).toBe('By e-mail');
    expect(host.querySelector('[data-section="email"] a')?.getAttribute('href')).toBe('mailto:support@anotoki.eu');
    expect(host.querySelector('[data-account-page]')?.getAttribute('href')).toBe(`${IAM}/account`);
    expect(host.querySelector('[data-section="delete"]')?.textContent).toContain('anotoki survey then keeps what you did here without your name');
  });

  it('in Slovak: the library’s words - which address nobody - around the survey’s, and the days a plural of the language', async () => {
    await configure({ 'legal.visitors.kept.few': 'Kľúč zanikne {count} dni po poslednej návšteve.', 'legal.visitors.kept.other': 'Kľúč zanikne {count} dní po poslednej návšteve.' }, 3, 'sk');
    const host = await draw(PrivacyFrameComponent);
    expect(host.querySelector('anotoki-privacy-page')?.getAttribute('lang')).toBe('sk');
    expect(host.querySelector('h1')?.textContent?.trim()).toBe('Ochrana osobných údajov');
    expect(texts(host, '[data-duration="visitors"] dd')).toEqual(['Kľúč zanikne 3 dni po poslednej návšteve.']);
  });
});
