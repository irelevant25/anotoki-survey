import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { AnotokiDialog, AnotokiDialogRef } from '@anotoki/lib/ui/dialog';
import { AuthService } from '../../core/auth/auth.service';
import type { ChangelogEntry } from '../../core/changelog/changelog.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { ChangelogDialogComponent } from './changelog-dialog.component';

const ENTRIES: ChangelogEntry[] = [
  {
    version: '0.5.0',
    date: '2026-11-01',
    changes: { added: ['A new page', 'A second thing'], fixed: ['A fixed thing'] },
    translations: { sk: { added: ['Nová stránka', 'Druhá vec'], fixed: ['Opravená vec'] } },
  },
  // Its Slovak is short of a sentence: no translation - the English, saying so.
  { version: '0.4.0', date: '2026-10-15', changes: { updated: ['A changed thing', 'Another'] }, translations: { sk: { updated: ['Zmenená vec'] } } },
];

/** The frame's words: migration 015's. */
const ENGLISH = {
  'whatsNew.title': "What's new",
  'whatsNew.version': 'Version {version}',
  'whatsNew.latest': 'Latest',
  'whatsNew.added': 'Added',
  'whatsNew.fixed': 'Fixed',
  'whatsNew.updated': 'Changed',
};
const SLOVAK = {
  'whatsNew.title': 'Čo je nové',
  'whatsNew.version': 'Verzia {version}',
  'whatsNew.latest': 'Najnovšia',
  'whatsNew.added': 'Pridané',
  'whatsNew.fixed': 'Opravené',
  'whatsNew.updated': 'Zmenené',
};

describe('What’s new: the survey’s versions in the kit’s dialog, in the reader’s language', () => {
  let ref: AnotokiDialogRef | null = null;
  const stable = () => TestBed.inject(ApplicationRef).whenStable();
  /** The kit's dialog (AnotokiDialog puts it at the end of <body>). */
  const dialog = () => document.querySelector<HTMLElement>('anotoki-dialog')!;
  const texts = (selector: string) => [...dialog().querySelectorAll<HTMLElement>(selector)].map((element) => element.textContent?.replace(/\s+/g, ' ').trim());

  async function open(language: 'en' | 'sk'): Promise<void> {
    TestBed.configureTestingModule({
      providers: [
        language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH),
        { provide: AuthService, useValue: { preferences: () => null, signedIn: () => false, user: () => null } },
      ],
    });
    ref = TestBed.inject(AnotokiDialog).open(ChangelogDialogComponent, { data: ENTRIES, size: 'lg' });
    await stable();
  }

  afterEach(async () => {
    ref?.close();
    ref = null;
    await stable();
  });

  it('in English: the heading, each version with its date, Latest on the newest, the kinds, the sentences - nothing marked', async () => {
    await open('en');
    expect(texts('h2')).toEqual(["What's new"]);
    expect(texts('h3.version')).toEqual(['Version 0.5.0', 'Version 0.4.0']);
    expect(texts('anotoki-badge')).toEqual(['Latest']);
    expect(texts('.release-head .date')).toEqual(['1 November 2026', '15 October 2026']);
    expect(texts('h4.kind')).toEqual(['Added', 'Fixed', 'Changed']);
    expect(texts('li')).toEqual(['A new page', 'A second thing', 'A fixed thing', 'A changed thing', 'Another']);
    expect(dialog().querySelectorAll('.release [lang]')).toHaveLength(0);
    expect(texts('.anotoki-dialog__footer button')).toEqual(['Close']);
  });

  it('in Slovak: the frame in Slovak, and a version’s own Slovak where it is whole - the English where it is not, its lists saying they are English', async () => {
    await open('sk');
    expect(texts('h2')).toEqual(['Čo je nové']);
    expect(texts('h3.version')).toEqual(['Verzia 0.5.0', 'Verzia 0.4.0']);
    expect(texts('anotoki-badge')).toEqual(['Najnovšia']);
    expect(texts('.release-head .date')).toEqual(['1. novembra 2026', '15. októbra 2026']);
    expect(texts('h4.kind')).toEqual(['Pridané', 'Opravené', 'Zmenené']);
    expect(texts('li')).toEqual(['Nová stránka', 'Druhá vec', 'Opravená vec', 'A changed thing', 'Another']);
    const lists = [...dialog().querySelectorAll('ul')];
    expect(lists.map((list) => list.getAttribute('lang'))).toEqual([null, null, 'en']);
    // The library's Close, in this site's words.
    expect(texts('.anotoki-dialog__footer button')).toEqual(['Zavrieť']);
  });

  it('follows the language on the page, and closes with its Close', async () => {
    await open('sk');
    expect(texts('h2')).toEqual(['Čo je nové']);
    TestBed.inject(TranslationService).noteAddress('/admin');
    await stable();
    expect(texts('h2'), 'the admin panel reads English').toEqual(["What's new"]);
    expect(texts('li')[0]).toBe('A new page');

    dialog().querySelector<HTMLButtonElement>('.anotoki-dialog__footer button')!.click();
    await stable();
    expect(document.querySelector('anotoki-dialog')).toBeNull();
    ref = null;
  });
});
