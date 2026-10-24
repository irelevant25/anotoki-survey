import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { SwitchComponent } from '@anotoki/lib/ui/forms';
import { AdminDates } from '../../../../shared/admin/admin-dates.service';
import { slugify, uniqueSlug } from '../../../../shared/survey/survey-factory';
import { translationCodes } from '../../../../shared/survey/localize';
import { Survey } from '../../../../shared/survey/survey.model';
import { todayIsoDay } from '../../../../shared/util/dates';
import { EditorLanguage, languageName, listOfNames } from '../translating';

/**
 * A survey's settings: its address, the language it is written in, the day it
 * closes by itself, whether it asks for gender and age - and, at the bottom,
 * for an administrator, the way to delete it.
 *
 * The language can be changed only while the survey has no translation: a
 * translation is the same texts in another language, and would be left
 * translating something else.
 */
@Component({
  selector: 'app-editor-settings',
  imports: [ButtonComponent, IconComponent, SwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-settings.component.html',
  styleUrl: './editor-settings.component.scss',
})
export class EditorSettingsComponent {
  readonly survey = input.required<Survey>();
  /** The other surveys' addresses, which this one may not take. */
  readonly takenSlugs = input<string[]>([]);
  /** Problems with the settings (the title, the address). */
  readonly problems = input<string[]>([]);
  /** Every language the site has, in its order; null while they have not come. */
  readonly languages = input<readonly EditorLanguage[] | null>(null);
  /** Deleting is an administrator's; an editor does not get the button. */
  readonly canDelete = input(false);

  readonly patch = output<Partial<Survey>>();
  /** Another language chosen as the one the survey is written in. */
  readonly languageChange = output<string>();
  readonly deleteSurvey = output<void>();

  protected readonly host = globalThis.location?.host ?? 'survey.anotoki.eu';
  protected readonly today = todayIsoDay();
  protected readonly formatDateTime = inject(AdminDates).formatDateTime;
  protected readonly suggested = computed(() => uniqueSlug(this.survey().title, this.takenSlugs()));

  /** The languages to choose from - with the survey's own, even if the site no longer has it (by its code). */
  protected readonly choices = computed<EditorLanguage[]>(() => {
    const languages = this.languages() ?? [];
    const own = this.survey().language;
    return languages.some((language) => language.code === own) ? [...languages] : [{ code: own, name: own, enabled: true }, ...languages];
  });
  /** What the survey is translated into, by name: while there is any, its language stays. */
  protected readonly translatedInto = computed(() => listOfNames(translationCodes(this.survey()).map((code) => languageName(this.languages(), code))));
  protected readonly languageLocked = computed(() => this.translatedInto() !== '' || this.choices().length < 2);

  /**
   * While typing: small letters, digits and dashes, a dash for anything else -
   * but a dash at the end stays, or the next word could never be typed after
   * it. Leaving the field tidies the ends.
   */
  protected onSlugInput(event: Event): void {
    const input = event.target as HTMLInputElement;
    const typed = input.value
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/-{2,}/g, '-');
    if (typed !== input.value) {
      input.value = typed;
    }
    this.patch.emit({ slug: typed });
  }

  protected onSlugBlur(event: Event): void {
    const input = event.target as HTMLInputElement;
    const tidy = slugify(input.value);
    if (tidy !== input.value) {
      input.value = tidy;
      this.patch.emit({ slug: tidy });
    }
  }

  protected useSuggested(): void {
    this.patch.emit({ slug: this.suggested() });
  }

  protected onLanguage(event: Event): void {
    const code = (event.target as HTMLSelectElement).value;
    if (code && code !== this.survey().language && !this.languageLocked()) {
      this.languageChange.emit(code);
    }
  }

  protected onClosesOn(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patch.emit({ closesOn: /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null });
  }
}
