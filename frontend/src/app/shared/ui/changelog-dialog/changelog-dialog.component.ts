import { ChangeDetectionStrategy, Component, computed, effect, inject } from '@angular/core';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { AnotokiDatePipe } from '@anotoki/lib/ui/dates';
import { ANOTOKI_DIALOG_DATA, AnotokiDialogRef, DialogFooterDirective } from '@anotoki/lib/ui/dialog';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { type ChangeKind, type ChangelogEntry, changesIn } from '../../changelog/changelog.service';

/** Each kind of change: the key of its heading, and its icon (the kit's own). */
const KINDS: readonly { kind: ChangeKind; key: string; icon: string }[] = [
  { kind: 'added', key: 'whatsNew.added', icon: 'plus' },
  { kind: 'fixed', key: 'whatsNew.fixed', icon: 'check' },
  { kind: 'updated', key: 'whatsNew.updated', icon: 'refresh' },
];

/** A version as the dialog draws it: its lists in the reader's language where they are whole, and that language where it is not the page's. */
interface ShownVersion {
  version: string;
  date: string;
  lang: string | null;
  lists: { kind: ChangeKind; key: string; icon: string; sentences: string[] }[];
}

/**
 * What's new: the survey's versions it is handed (Changelog.open() - every
 * one, from public/changelog.json), newest first, each with what it added,
 * put right and changed - in the kit's dialog (the anotoki family's
 * AnotokiDialog: its focus, Escape and backdrop, the focus back where it was).
 *
 * The frame's words are the site's keys (`whatsNew.*`, migration 015, in the
 * language on the page: English in the admin panel) - the heading, a
 * version's name, Latest, the three headings - with the library's Close, and
 * the date in the anotoki account's order (localDate). The sentences are the
 * file's: a version's translation into the reader's language when it is whole
 * (`translations.sk`: formal Slovak), its English otherwise - and then its
 * lists say they are English.
 */
@Component({
  selector: 'app-changelog-dialog',
  imports: [BadgeComponent, ButtonComponent, DialogFooterDirective, IconComponent, AnotokiDatePipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './changelog-dialog.component.html',
  styleUrl: './changelog-dialog.component.scss',
})
export class ChangelogDialogComponent {
  private readonly _entries = inject(ANOTOKI_DIALOG_DATA) as readonly ChangelogEntry[];
  private readonly _i18n = inject(TranslationService);
  protected readonly ref = inject(AnotokiDialogRef);

  protected readonly versions = computed<ShownVersion[]>(() => {
    const language = this._i18n.effectiveLanguage();
    return this._entries.map((entry) => {
      const { changes, lang } = changesIn(entry, language);
      return {
        version: entry.version,
        date: entry.date,
        lang: lang === language ? null : lang,
        lists: KINDS.map((kind) => ({ ...kind, sentences: changes[kind.kind] ?? [] })).filter((list) => list.sentences.length > 0),
      };
    });
  });

  constructor() {
    // The dialog's heading is set here, so it follows the language on the page.
    effect(() => this.ref.heading.set(this._i18n.t('whatsNew.title')));
  }
}
