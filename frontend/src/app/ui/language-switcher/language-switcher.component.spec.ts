import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '../../core/i18n/translation.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { ToastService } from '../toast/toast.service';
import { LanguageSwitcherComponent } from './language-switcher.component';

const ENGLISH = { 'language.button': 'Language: {name}', 'language.notLoaded': 'The language could not be loaded. Please try again.' };
const SLOVAK = { 'language.button': 'Jazyk: {name}', 'language.notLoaded': 'Jazyk sa nepodarilo načítať. Skúste to, prosím, znova.' };

describe('LanguageSwitcherComponent', () => {
  let fixture: ComponentFixture<LanguageSwitcherComponent>;
  let host: HTMLElement;

  const button = () => host.querySelector<HTMLButtonElement>('button.switcher')!;
  const items = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]'));

  async function open(): Promise<void> {
    button().click();
    await fixture.whenStable();
  }

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    fixture = TestBed.createComponent(LanguageSwitcherComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await fixture.whenStable();
  });

  afterEach(() => host.remove());

  it('is one button: the code in capitals, named with the language as its speakers write it', () => {
    expect(host.querySelectorAll('button')).toHaveLength(1);
    expect(button().textContent?.trim()).toBe('SK');
    expect(button().getAttribute('aria-label')).toBe('Jazyk: Slovenčina');
    expect(button().getAttribute('aria-haspopup')).toBe('menu');
    expect(button().getAttribute('aria-expanded')).toBe('false');
  });

  it('opens a menu of the languages on offer, each in its own name and saying which language that is', async () => {
    await open();

    expect(button().getAttribute('aria-expanded')).toBe('true');
    const menu = host.querySelector('[role="menu"]')!;
    expect(menu.id).toBe(button().getAttribute('aria-controls'));
    expect(menu.getAttribute('aria-labelledby')).toBe(button().id);
    expect(items().map((item) => [item.textContent?.trim(), item.getAttribute('lang'), item.getAttribute('aria-checked')])).toEqual([
      ['English', 'en', 'false'],
      ['Slovenčina', 'sk', 'true'],
    ]);
    // Focus goes into the menu, onto the language in use.
    expect(document.activeElement).toBe(items()[1]);
  });

  it('moves with the arrow keys, and closes on Escape and on a click outside', async () => {
    await open();
    items()[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(items()[0]);
    items()[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(items()[1]);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await fixture.whenStable();
    expect(items()).toEqual([]);
    expect(document.activeElement).toBe(button());

    await open();
    document.body.click();
    await fixture.whenStable();
    expect(items()).toEqual([]);
  });

  it('switches the language of the page, and remembers it on this device', async () => {
    localStorage.clear();
    await open();
    items()[0].click();
    await fixture.whenStable();

    expect(TestBed.inject(TranslationService).language()).toBe('en');
    expect(localStorage.getItem('anotoki-survey:language')).toBe('en');
    expect(button().textContent?.trim()).toBe('EN');
    expect(button().getAttribute('aria-label')).toBe('Language: English');
    expect(items()).toEqual([]);
    localStorage.clear();
  });

  it('says so, and stays as it was, when the language could not be loaded', async () => {
    const i18n = TestBed.inject(TranslationService);
    vi.spyOn(i18n, 'setLanguage').mockResolvedValue(false);
    await open();
    items()[0].click();
    await fixture.whenStable();

    expect(i18n.language()).toBe('sk');
    expect(button().textContent?.trim()).toBe('SK');
    expect(
      TestBed.inject(ToastService)
        .toasts()
        .map((toast) => toast.message),
    ).toEqual(['Jazyk sa nepodarilo načítať. Skúste to, prosím, znova.']);
    vi.restoreAllMocks();
  });

  it('takes a second choice while the first is on its way - the last one wins, and the one overtaken is not called a failure', async () => {
    const i18n = TestBed.inject(TranslationService);
    let overtaken!: (switched: boolean) => void;
    const slow = new Promise<boolean>((done) => (overtaken = done));
    const setLanguage = vi.spyOn(i18n, 'setLanguage').mockImplementation((code: string) => (code === 'en' ? slow : Promise.resolve(true)));

    await open();
    items()[0].click();
    await fixture.whenStable();
    expect(button().getAttribute('aria-busy')).toBe('true');

    // A change of mind while English is on its way: back to Slovak, the language still on the page.
    await open();
    items()[1].click();
    await fixture.whenStable();
    expect(setLanguage.mock.calls).toEqual([['en'], ['sk']]);
    expect(button().hasAttribute('aria-busy')).toBe(false);

    // The first choice comes back as the service answers one that was overtaken.
    overtaken(false);
    await fixture.whenStable();
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
    expect(button().hasAttribute('aria-busy')).toBe(false);
    expect(button().textContent?.trim()).toBe('SK');
    vi.restoreAllMocks();
  });

  it('goes back to the language on the page when that is chosen while another is on its way - with the real service', async () => {
    localStorage.clear();
    const i18n = TestBed.inject(TranslationService);
    let answer!: (bundle: unknown) => void;
    const slow = new Promise<unknown>((done) => (answer = done));
    // What the service would fetch for English: held back until the person has changed their mind.
    const fetch = vi.spyOn(i18n as unknown as { fetchBundle(code: string): Promise<unknown> }, 'fetchBundle').mockReturnValue(slow);

    await open();
    items()[0].click();
    await fixture.whenStable();
    await open();
    items()[1].click();
    await fixture.whenStable();

    answer({ language: 'en', languages: i18n.languages(), values: ENGLISH });
    await fixture.whenStable();
    await new Promise((done) => setTimeout(done));

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(i18n.language()).toBe('sk');
    expect(localStorage.getItem('anotoki-survey:language')).toBe('sk');
    expect(button().textContent?.trim()).toBe('SK');
    expect(TestBed.inject(ToastService).toasts()).toEqual([]);
    vi.restoreAllMocks();
    localStorage.clear();
  });
});
