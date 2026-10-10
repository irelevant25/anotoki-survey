import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AlertComponent, ButtonComponent, IconComponent } from '@anotoki/lib/ui';
import { ToastService } from '@anotoki/lib/ui/toast';
import { AuthService } from '../../../core/auth/auth.service';
import { signInOrSayWhy } from '../../../core/auth/sign-in-failure';
import { TranslatePluralPipe } from '../../../core/i18n/translate-plural.pipe';
import { TranslatePipe } from '../../../core/i18n/translate.pipe';
import { TranslationService } from '../../../core/i18n/translation.service';

/**
 * What somebody taking surveys without signing in is told: that this browser
 * remembers which surveys they answered for the days the site keeps a visitor
 * unseen (`visitorDays`, from the server), and that signing in moves them
 * into their account - with the button that does it. On the home page above
 * the list, and on a survey's welcome, "answered" and "sent" - never on its
 * steps. The page decides when (AuthService.taker()?.visitor); this draws it.
 */
@Component({
  selector: 'app-visitor-notice',
  imports: [AlertComponent, ButtonComponent, IconComponent, TranslatePipe, TranslatePluralPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './visitor-notice.component.html',
  styleUrl: './visitor-notice.component.scss',
})
export class VisitorNoticeComponent {
  protected readonly auth = inject(AuthService);
  private readonly _i18n = inject(TranslationService);
  private readonly _toast = inject(ToastService);

  /** To the IAM and back to this page - once the answers on their way have arrived; a toast if it cannot start. */
  protected signIn(): void {
    void signInOrSayWhy(this.auth, this._i18n, this._toast);
  }
}
