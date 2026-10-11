import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { SurveyImage } from '../../core/survey/survey.model';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { LightboxComponent } from './lightbox.component';
import { LightboxService, LightboxView } from './lightbox.service';

const ENGLISH = {
  'common.close': 'Close',
  'image.missing': 'The picture is missing',
  'lightbox.label': 'Picture, shown large',
  'lightbox.position': '{n} / {m}',
  'lightbox.positionSpoken': 'Picture {n} of {m}',
  'lightbox.positionSpokenCaption': 'Picture {n} of {m}: {caption}',
  'lightbox.previous': 'The picture before',
  'lightbox.next': 'The next picture',
};
const SLOVAK = {
  'common.close': 'Zavrieť',
  'image.missing': 'Obrázok chýba',
  'lightbox.label': 'Zväčšený obrázok',
  'lightbox.position': '{n} / {m}',
  'lightbox.positionSpoken': 'Obrázok {n}, spolu obrázkov: {m}',
  'lightbox.positionSpokenCaption': 'Obrázok {n}, spolu obrázkov: {m}. {caption}',
  'lightbox.previous': 'Predchádzajúci obrázok',
  'lightbox.next': 'Ďalší obrázok',
};

function picture(id: string, alt: string): SurveyImage {
  return { id, alt, width: 800, height: 600, src: `/api/images/${id}.webp` };
}

describe('LightboxComponent: its own words', () => {
  let fixture: ComponentFixture<LightboxComponent>;
  let host: HTMLElement;

  const spoken = () => host.querySelector('[aria-live="polite"]')?.textContent?.trim();
  const seen = () => host.querySelector('.count')?.textContent?.trim();
  const names = () => Array.from(host.querySelectorAll('button')).map((button) => button.getAttribute('aria-label'));

  async function show(view: LightboxView): Promise<void> {
    fixture = TestBed.createComponent(LightboxComponent);
    fixture.componentRef.setInput('view', view);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  beforeAll(() => {
    // jsdom has the element and not its modal: enough of one for a component that opens itself.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
  });

  it('says where it is among the pictures in words for the ear, and in numbers for the eye', async () => {
    await show({ images: [picture('a', 'Mačka na okne'), picture('b', '')], index: 0, caption: null });

    expect(host.querySelector('dialog')?.getAttribute('aria-label')).toBe('Zväčšený obrázok');
    expect(seen()).toBe('1 / 2');
    expect(host.querySelector('.count')?.getAttribute('aria-hidden')).toBe('true');
    expect(spoken()).toBe('Obrázok 1, spolu obrázkov: 2. Mačka na okne');
    expect(names()).toEqual(['Zavrieť', 'Predchádzajúci obrázok', 'Ďalší obrázok']);

    // The next one has no words of its own and nobody gave any: only where it is.
    fixture.componentRef.setInput('view', { images: [picture('a', 'Mačka na okne'), picture('b', '')], index: 1, caption: null });
    await fixture.whenStable();
    expect(seen()).toBe('2 / 2');
    expect(spoken()).toBe('Obrázok 2, spolu obrázkov: 2');
  });

  it('a picture on its own is only what it shows: no count, no arrows', async () => {
    await show({ images: [picture('a', '')], index: 0, caption: 'Možnosť A' });
    expect(seen()).toBeUndefined();
    expect(spoken()).toBe('Možnosť A');
    expect(names()).toEqual(['Zavrieť']);
  });

  it('says which language the picture’s words are in when it is told: the picture and its caption - and the spoken line only when it is nothing but those words', async () => {
    const lang = (selector: string) => host.querySelector(selector)?.getAttribute('lang') ?? null;

    await show({ images: [picture('a', '')], index: 0, caption: 'Option A', lang: 'en' });
    expect(host.querySelector('figcaption')?.textContent).toBe('Option A');
    expect(host.querySelector('figcaption')?.closest('[lang]:not(html)')?.getAttribute('lang')).toBe('en');
    expect(host.querySelector('img')?.closest('[lang]:not(html)')?.getAttribute('lang')).toBe('en');
    // One picture: the line is the caption and nothing else.
    expect(spoken()).toBe('Option A');
    expect(lang('[aria-live="polite"]')).toBe('en');

    // Several: the line is the site's sentence with the caption inside it - the page's language.
    fixture.componentRef.setInput('view', { images: [picture('a', 'A cat'), picture('b', '')], index: 0, caption: null, lang: 'en' });
    await fixture.whenStable();
    expect(spoken()).toBe('Obrázok 1, spolu obrázkov: 2. A cat');
    expect(lang('[aria-live="polite"]')).toBeNull();
    expect(lang('figure')).toBe('en');
    // The site's own: the dialog's name, the count, the buttons.
    expect(lang('dialog')).toBeNull();
    expect(host.querySelector('.count')?.closest('[lang]:not(html)')).toBeNull();
    expect(host.querySelector('button')?.closest('[lang]:not(html)')).toBeNull();

    // Told nothing, it says nothing: the words are in the page's language.
    fixture.componentRef.setInput('view', { images: [picture('a', 'Mačka')], index: 0, caption: null });
    await fixture.whenStable();
    expect(host.querySelectorAll('[lang]')).toHaveLength(0);
  });

  it('follows the language, and what a picture shows is never read as a string of its own', async () => {
    await show({ images: [picture('a', '{m} {caption}'), picture('b', '')], index: 0, caption: null });
    expect(spoken()).toBe('Obrázok 1, spolu obrázkov: 2. {m} {caption}');

    await TestBed.inject(TranslationService).setLanguage('en', { remember: false });
    await fixture.whenStable();
    expect(spoken()).toBe('Picture 1 of 2: {m} {caption}');
    expect(names()).toEqual(['Close', 'The picture before', 'The next picture']);
  });
});

describe('LightboxService', () => {
  it('keeps the language the pictures’ words are in - none unless it is said', () => {
    const lightbox = TestBed.inject(LightboxService);

    lightbox.open([picture('a', 'A cat'), picture('b', '')], 1);
    expect(lightbox.view()).toEqual({ images: [picture('a', 'A cat'), picture('b', '')], index: 1, caption: null, lang: null });

    lightbox.open([picture('a', '')], 0, 'Option A', 'en');
    expect(lightbox.view()).toMatchObject({ caption: 'Option A', lang: 'en' });
    // Moving among the pictures keeps it.
    lightbox.open([picture('a', ''), picture('b', '')], 0, null, 'en');
    lightbox.move(1);
    expect(lightbox.view()).toMatchObject({ index: 1, lang: 'en' });

    lightbox.close();
    expect(lightbox.view()).toBeNull();
  });
});
