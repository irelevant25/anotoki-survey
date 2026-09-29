import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { slugify, uniqueSlug } from '../../../../core/survey/survey-factory';
import { Survey } from '../../../../core/survey/survey.model';
import { formatDateTime, todayIsoDay } from '../../../../core/util/dates';
import { ButtonComponent } from '../../../../ui/button/button.component';
import { IconComponent } from '../../../../ui/icon/icon.component';
import { SwitchComponent } from '../../../../ui/switch/switch.component';

/**
 * A survey's settings: its address, the day it closes by itself, whether it
 * asks for gender and age - and, at the bottom, for an administrator, the way
 * to delete it.
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
  /** Deleting is an administrator's; an editor does not get the button. */
  readonly canDelete = input(false);

  readonly patch = output<Partial<Survey>>();
  readonly deleteSurvey = output<void>();

  protected readonly host = globalThis.location?.host ?? 'survey.anotoki.eu';
  protected readonly today = todayIsoDay();
  protected readonly formatDateTime = formatDateTime;
  protected readonly suggested = computed(() => uniqueSlug(this.survey().title, this.takenSlugs()));

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

  protected onClosesOn(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.patch.emit({ closesOn: /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null });
  }
}
