import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, viewChildren } from '@angular/core';
import { Survey } from '../../../../core/survey/survey.model';
import { ButtonComponent } from '../../../../ui/button/button.component';
import { IconComponent } from '../../../../ui/icon/icon.component';
import { EditorLanguage, TranslationTab, addableLanguages, languageName, translationTabs } from '../translating';

/**
 * The editor's language switch: the language the survey is written in (marked
 * "main"), a tab for each translation with how far it is ("Slovak 42 / 57"),
 * the way to add one more - the languages of the site the survey does not
 * have yet - and, on a translation's tab, the way to remove it.
 *
 * A tab also says what its language is to the people taking the survey: a
 * hidden one is offered to nobody, and an offered one that still lacks a text
 * while the survey is open is "shown in English" - its readers get the survey
 * in the language it is written in until the translation is whole.
 *
 * It only says what was asked for: the page changes the survey, and asks
 * before a translation goes.
 */
@Component({
  selector: 'app-editor-languages',
  imports: [ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './editor-languages.component.html',
  styleUrl: './editor-languages.component.scss',
})
export class EditorLanguagesComponent {
  readonly survey = input.required<Survey>();
  /** Every language the site has, in its order; null while they have not come. */
  readonly languages = input<readonly EditorLanguage[] | null>(null);
  /** The translation being edited: its code, or null for the language the survey is written in. */
  readonly language = input<string | null>(null);

  /** A tab chosen: a translation's code, or null for the main language. */
  readonly choose = output<string | null>();
  readonly add = output<string>();
  readonly remove = output<string>();

  private readonly _tabButtons = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  protected readonly mainName = computed(() => languageName(this.languages(), this.survey().language));
  protected readonly tabs = computed(() => translationTabs(this.survey(), this.languages()));
  protected readonly addable = computed(() => addableLanguages(this.survey(), this.languages()));
  protected readonly current = computed(() => this.tabs().find((tab) => tab.code === this.language()) ?? null);
  /** Nothing to switch between and nothing to add: a site with one language draws no switch at all. */
  protected readonly shown = computed(() => this.tabs().length > 0 || this.addable().length > 0);

  /** What a tab's tag means, for whoever rests on it - nothing for a translation with no tag. */
  protected hint(tab: TranslationTab): string | null {
    if (tab.unknown) {
      return 'The site no longer has this language: remove the translation, or add the language again.';
    }
    if (tab.hidden) {
      return 'A hidden language: people are not offered it.';
    }
    return tab.readersGetMain ? `This survey is open: until every text is translated, readers of ${tab.name} see it in ${this.mainName()}.` : null;
  }

  protected onAdd(event: Event): void {
    const select = event.target as HTMLSelectElement;
    const code = select.value;
    // Back to its first line: the select is a menu, not a value.
    select.value = '';
    if (code) {
      this.add.emit(code);
    }
  }

  /** The arrow keys, Home and End move between the tabs and choose as they go - only the chosen one is in the tab order. */
  protected onKeydown(event: KeyboardEvent): void {
    const codes: (string | null)[] = [null, ...this.tabs().map((tab) => tab.code)];
    const at = codes.indexOf(this.language());
    let next = at;
    switch (event.key) {
      case 'ArrowRight':
        next = (at + 1) % codes.length;
        break;
      case 'ArrowLeft':
        next = (at - 1 + codes.length) % codes.length;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = codes.length - 1;
        break;
      default:
        return;
    }
    event.preventDefault();
    this.choose.emit(codes[next]);
    this._tabButtons()[next]?.nativeElement.focus();
  }
}
