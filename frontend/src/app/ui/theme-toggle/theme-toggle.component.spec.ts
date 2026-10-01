import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '../../core/i18n/translation.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { ThemeToggleComponent } from './theme-toggle.component';

const ENGLISH = { 'theme.label': 'Theme', 'theme.light': 'Light', 'theme.dark': 'Dark', 'theme.auto': 'Automatic', 'theme.autoHint': 'As your device is set' };
const SLOVAK = { 'theme.label': 'Vzhľad', 'theme.light': 'Svetlý', 'theme.dark': 'Tmavý', 'theme.auto': 'Systémový', 'theme.autoHint': 'Podľa nastavenia systému' };

describe('ThemeToggleComponent: its own words', () => {
  let fixture: ComponentFixture<ThemeToggleComponent>;
  let host: HTMLElement;

  const options = () => Array.from(host.querySelectorAll<HTMLButtonElement>('[role="radio"]'));

  async function draw(compact: boolean): Promise<void> {
    fixture = TestBed.createComponent(ThemeToggleComponent);
    fixture.componentRef.setInput('compact', compact);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
  });

  it('compact: the icons alone, each named and explained in the language on the page', async () => {
    await draw(true);
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Vzhľad');
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual(['Svetlý', 'Tmavý', 'Systémový']);
    expect(options().map((option) => option.getAttribute('title'))).toEqual(['Svetlý', 'Tmavý', 'Podľa nastavenia systému']);
    expect(options().map((option) => option.textContent?.trim())).toEqual(['', '', '']);
  });

  it('in full: the names are on the buttons, so nothing names them twice', async () => {
    await draw(false);
    expect(options().map((option) => option.textContent?.trim())).toEqual(['Svetlý', 'Tmavý', 'Systémový']);
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual([null, null, null]);
  });

  it('follows the language: a choice holds the key of its name, never the name', async () => {
    await draw(true);
    await TestBed.inject(TranslationService).setLanguage('en', false);
    await fixture.whenStable();
    expect(host.querySelector('[role="radiogroup"]')?.getAttribute('aria-label')).toBe('Theme');
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'Automatic']);
    expect(options().map((option) => option.getAttribute('title'))).toEqual(['Light', 'Dark', 'As your device is set']);
  });

  it('is English in the admin area', async () => {
    TestBed.inject(TranslationService).noteAddress('/admin');
    await draw(true);
    expect(options().map((option) => option.getAttribute('aria-label'))).toEqual(['Light', 'Dark', 'Automatic']);
  });
});
