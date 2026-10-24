import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { TranslatePipe, TranslatePluralPipe } from '@anotoki/lib/translations';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { signInOrShowWhy } from '../../../shared/auth/auth.config';
import { AuthService } from '../../../shared/auth/auth.service';

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
  private readonly _router = inject(Router);

  /** To the IAM and back to this page - once the answers on their way have arrived; the screen that says why if it cannot start. */
  protected signIn(): void {
    void signInOrShowWhy(this.auth, this._router);
  }
}
