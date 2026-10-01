import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { ButtonComponent } from '../button/button.component';
import { DialogComponent } from '../dialog/dialog.component';
import { ConfirmService } from './confirm.service';

/**
 * Draws the question ConfirmService is asking, if any.
 *
 * Focus starts on Cancel: for the destructive questions this mostly asks,
 * the safe answer should be the one a stray Enter gives.
 *
 * The question and its answers arrive as finished sentences and are not worded
 * again; only the two labels nobody gave ("Cancel", "Confirm") are the site's
 * own words, in the language on the page.
 */
@Component({
  selector: 'app-confirm-host',
  imports: [ButtonComponent, DialogComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './confirm-host.component.html',
  styleUrl: './confirm-host.component.scss',
})
export class ConfirmHostComponent {
  protected readonly confirm = inject(ConfirmService);
}
