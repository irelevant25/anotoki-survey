import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { AnotokiDialog } from '@anotoki/lib/ui/dialog';
import { firstValueFrom } from 'rxjs';

/** What one version changed, by kind: each a sentence about something people notice. */
export interface ChangelogChanges {
  added?: string[];
  fixed?: string[];
  updated?: string[];
}

/**
 * One version in public/changelog.json, newest first - the shape of the other
 * anotoki sites' changelogs (version, date, changes in English), and beside it
 * the same lists in another language (`translations.sk`: this site's formal
 * Slovak), which a reader of that language is shown when it is whole.
 */
export interface ChangelogEntry {
  /** MAJOR.MINOR.PATCH: big changes, new features, fixes ("0.4.0"). */
  version: string;
  /** YYYY-MM-DD. */
  date: string;
  /** In English: what every language falls back to. */
  changes: ChangelogChanges;
  /** The same lists in another language, by its code. */
  translations?: Record<string, ChangelogChanges>;
}

/** The kinds of change, in the order a version lists them. */
export const CHANGE_KINDS = ['added', 'fixed', 'updated'] as const;
export type ChangeKind = (typeof CHANGE_KINDS)[number];

/** Where the list is: shipped with the pages (public/), next to index.html - never asked of the API. */
export const CHANGELOG_URL = 'changelog.json';

/**
 * The survey's versions and what each changed (public/changelog.json). The
 * newest entry's version is the site's version - one source: what the family's
 * footer shows ("v0.4.0", which a screen reader hears as "Version 0.4.0";
 * `current()`) under every page and in the admin panel, and
 * frontend/package.json's own version is held to it by a spec. What's new
 * (`open()`) lists every version in the kit's dialog (ui/changelog-dialog,
 * loaded with the first press: no first load carries it), in the reader's
 * language.
 *
 * It opens when asked - by the What's new link of the family's footer
 * (<anotoki-site-footer>, anotoki-lib 0.6.3: its `(whatsNew)`, in each frame -
 * layouts/participant-layout, legal-layout and admin-layout) - and never by
 * itself: nothing about what a browser has seen is kept, so nothing new is
 * stored in it (the Privacy page lists every item the site keeps there). The
 * list is asked for once a page load, as the site starts (boot(), never waited
 * for), so the footer has its version when the first page is drawn; a list
 * that cannot be had (a broken upload) leaves no version and no What's new -
 * the frames show neither -, and is asked for again next time.
 */
@Injectable({ providedIn: 'root' })
export class Changelog {
  private readonly _http = inject(HttpClient);
  private readonly _dialog = inject(AnotokiDialog);
  private _loading: Promise<void> | null = null;

  /** Every version, newest first; none until the list came. */
  readonly entries = signal<readonly ChangelogEntry[]>([]);
  /** The site's version - "0.4.0" - or null until the list came. */
  readonly current = computed(() => this.entries()[0]?.version ?? null);

  /** The list, once a page load. Never rejects. */
  load(): Promise<void> {
    return (this._loading ??= this._fetch());
  }

  /** What's new: every version, newest first, in the kit's dialog - nothing when there is no list. */
  async open(): Promise<void> {
    await this.load();
    const entries = this.entries();
    if (entries.length === 0) {
      return;
    }
    const { ChangelogDialogComponent } = await import('../../ui/changelog-dialog/changelog-dialog.component');
    this._dialog.open(ChangelogDialogComponent, { data: entries, size: 'lg' });
  }

  private async _fetch(): Promise<void> {
    try {
      this.entries.set(changelogEntries(await firstValueFrom(this._http.get<unknown>(CHANGELOG_URL))));
    } catch {
      // No list - a broken upload, a dropped connection: no version, no What's new; the next ask tries again.
      this.entries.set([]);
      this._loading = null;
    }
  }
}

/** The entries of a changelog as the file has them - each version with a version, a date and its English lists; anything else left out. */
export function changelogEntries(value: unknown): ChangelogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const entries: ChangelogEntry[] = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item['version'] !== 'string' || typeof item['date'] !== 'string') {
      continue;
    }
    const changes = changesOf(item['changes']);
    if (changes === null) {
      continue;
    }
    const translations: Record<string, ChangelogChanges> = {};
    if (isRecord(item['translations'])) {
      for (const [code, lists] of Object.entries(item['translations'])) {
        const translated = changesOf(lists);
        if (translated !== null) {
          translations[code] = translated;
        }
      }
    }
    entries.push({ version: item['version'], date: item['date'], changes, translations });
  }
  return entries;
}

/**
 * A version's lists in `language` - its translation when that is whole (every
 * kind of the English with as many sentences, each with words in it) - or the
 * English; and the language they are in.
 */
export function changesIn(entry: ChangelogEntry, language: string): { changes: ChangelogChanges; lang: string } {
  const base = language.split('-')[0];
  const translation = Object.hasOwn(entry.translations ?? {}, language) ? entry.translations?.[language] : Object.hasOwn(entry.translations ?? {}, base) ? entry.translations?.[base] : undefined;
  if (base !== 'en' && translation && isWhole(entry.changes, translation)) {
    return { changes: translation, lang: Object.hasOwn(entry.translations ?? {}, language) ? language : base };
  }
  return { changes: entry.changes, lang: 'en' };
}

function isWhole(english: ChangelogChanges, translation: ChangelogChanges): boolean {
  return CHANGE_KINDS.every((kind) => {
    const want = english[kind] ?? [];
    const have = translation[kind] ?? [];
    return want.length === have.length && have.every((sentence) => sentence.trim() !== '');
  });
}

function changesOf(value: unknown): ChangelogChanges | null {
  if (!isRecord(value)) {
    return null;
  }
  const changes: ChangelogChanges = {};
  for (const kind of CHANGE_KINDS) {
    const list = value[kind];
    if (Array.isArray(list)) {
      changes[kind] = list.filter((sentence): sentence is string => typeof sentence === 'string');
    }
  }
  return changes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
