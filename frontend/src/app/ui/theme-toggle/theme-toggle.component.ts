import { ChangeDetectionStrategy, Component, ElementRef, inject, input, viewChildren } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ThemeMode, ThemeService } from '../../core/theme/theme.service';
import { IconComponent, IconName } from '../icon/icon.component';

/**
 * Each choice with the key of its name - a key and never the name itself: a
 * constant is worded once, and the language changes under it. The template
 * words it (the translate pipe).
 */
const OPTIONS: { mode: ThemeMode; icon: IconName; labelKey: string }[] = [
  { mode: 'light', icon: 'sun', labelKey: 'theme.light' },
  { mode: 'dark', icon: 'moon', labelKey: 'theme.dark' },
  { mode: 'auto', icon: 'monitor', labelKey: 'theme.auto' },
];

/**
 * Light, dark or automatic, as a three-way segmented control.
 *
 * A radio group underneath (`role="radiogroup"`, arrow keys move the choice),
 * because it is one choice out of three - not three buttons. `compact` shows
 * the icons alone, with the names as labels and tooltips.
 */
@Component({
  selector: 'app-theme-toggle',
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './theme-toggle.component.html',
  styleUrl: './theme-toggle.component.scss',
})
export class ThemeToggleComponent {
  protected readonly theme = inject(ThemeService);
  protected readonly options = OPTIONS;

  readonly compact = input(false);

  private readonly _buttons = viewChildren<ElementRef<HTMLButtonElement>>('option');

  protected onKeydown(event: KeyboardEvent): void {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
    if (!step) {
      return;
    }
    event.preventDefault();
    const index = OPTIONS.findIndex((option) => option.mode === this.theme.mode());
    const next = (index + step + OPTIONS.length) % OPTIONS.length;
    this.theme.set(OPTIONS[next].mode);
    this._buttons()[next]?.nativeElement.focus();
  }
}
