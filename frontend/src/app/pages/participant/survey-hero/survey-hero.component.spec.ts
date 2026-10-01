import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '../../../core/i18n/translation.service';
import { provideTestTranslations } from '../../../core/testing/test-translations';
import { SurveyHeroComponent } from './survey-hero.component';

const ENGLISH = { 'take.step': 'Step {n} of {m}', 'take.stepSpoken': 'Step {n} of {m}', 'take.progress': 'Your progress' };
const SLOVAK = { 'take.step': 'Krok {n} / {m}', 'take.stepSpoken': 'Krok {n}, spolu krokov: {m}', 'take.progress': 'Váš postup' };

describe('SurveyHeroComponent', () => {
  let fixture: ComponentFixture<SurveyHeroComponent>;
  let host: HTMLElement;

  const where = () => host.querySelector<HTMLElement>('.where > span')!;
  const bar = () => host.querySelector<HTMLElement>('[role="progressbar"]')!;
  /** The line as it is read: the words with single spaces. */
  const line = () => where().textContent?.replace(/\s+/g, ' ').trim();

  async function draw(inputs: Record<string, unknown>, slovak: Record<string, string> = SLOVAK): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideTestTranslations(slovak, { language: 'sk', english: ENGLISH })] });
    fixture = TestBed.createComponent(SurveyHeroComponent);
    host = fixture.nativeElement;
    for (const [name, value] of Object.entries({ heading: 'Čo hráte?', eyebrow: 'Prieskum', ...inputs })) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
  }

  it('says what it is given above the name, and has no words of its own there', async () => {
    await draw({});
    expect(host.querySelector('.eyebrow')?.textContent).toBe('Prieskum');
    expect(host.querySelector('h1')?.textContent).toBe('Čo hráte?');
    // The welcome, the thanks: no step, so no step line and no bar.
    expect(host.querySelector('.progress')).toBeNull();
  });

  it('shows the step line cut around its number, which is set in bold', async () => {
    await draw({ current: 2, total: 5 });
    expect(line()).toBe('Krok 2 / 5');
    expect(where().querySelector('strong')?.textContent).toBe('2');
    // The pieces exactly as the string has them: nothing but the string's own spaces around the number.
    expect(Array.from(where().children).map((piece) => piece.textContent)).toEqual(['Krok ', '2', ' / 5']);
  });

  it('shows a step line that leaves the number out as it is: no number is glued onto it', async () => {
    // A language other than English may leave a placeholder out.
    await draw({ current: 2, total: 5 }, { ...SLOVAK, 'take.step': 'Krokov: {m}' });
    expect(line()).toBe('Krokov: 5');
    expect(where().querySelector('strong')).toBeNull();
    // The bar still says the step, in its own words.
    expect(bar().getAttribute('aria-valuetext')).toBe('Krok 2, spolu krokov: 5');
  });

  it('says the step in other words than it shows, and names the bar', async () => {
    await draw({ current: 2, total: 5 });
    expect(bar().getAttribute('aria-label')).toBe('Váš postup');
    expect(bar().getAttribute('aria-valuetext')).toBe('Krok 2, spolu krokov: 5');
    expect(bar().getAttribute('aria-valuenow')).toBe('2');
    expect(bar().getAttribute('aria-valuemax')).toBe('5');
    expect(host.querySelectorAll('.segment')).toHaveLength(5);
  });

  it('marks the survey’s own words with their language when it is given one - and the site’s words never', async () => {
    await draw({ current: 2, total: 5, heading: 'What do you play?' });
    expect(host.querySelectorAll('[lang]')).toHaveLength(0);

    fixture.componentRef.setInput('lang', 'en');
    await fixture.whenStable();
    // The survey's name is the only text of the survey here: a step's own title is the page's heading, under the hero.
    expect(Array.from(host.querySelectorAll('[lang]')).map((element) => [element.className, element.textContent, element.getAttribute('lang')])).toEqual([['title', 'What do you play?', 'en']]);
    // "Prieskum", "Krok 2 / 5": the page's.
    expect(host.querySelector('.eyebrow')?.hasAttribute('lang')).toBe(false);
    expect(where().closest('[lang]:not(html)')).toBeNull();
  });

  it('follows the step, and the language when it is switched', async () => {
    await draw({ current: 2, total: 5 });
    fixture.componentRef.setInput('current', 3);
    await fixture.whenStable();
    expect(line()).toBe('Krok 3 / 5');

    expect(await TestBed.inject(TranslationService).setLanguage('en', false)).toBe(true);
    await fixture.whenStable();
    expect(line()).toBe('Step 3 of 5');
    expect(bar().getAttribute('aria-label')).toBe('Your progress');
    expect(bar().getAttribute('aria-valuetext')).toBe('Step 3 of 5');
  });
});
