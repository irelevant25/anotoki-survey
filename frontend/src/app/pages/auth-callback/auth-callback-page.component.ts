import { ChangeDetectionStrategy, Component, afterNextRender, inject } from '@angular/core';
import { Router } from '@angular/router';
import { SpinnerComponent } from '@anotoki/lib/ui';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/**
 * /auth/callback - where the IAM sends the browser back after signing in (the
 * registered redirect URI). The work is done before the site is drawn: the
 * SDK's init() exchanges the code and puts the address the person came from
 * back in the address bar, so this page is only ever seen when it is opened
 * some other way - and then there is nothing to finish here.
 */
@Component({
  selector: 'app-auth-callback-page',
  imports: [SpinnerComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-callback-page.component.html',
  styleUrl: './auth-callback-page.component.scss',
})
export class AuthCallbackPageComponent {
  constructor() {
    const router = inject(Router);
    afterNextRender(() => void router.navigateByUrl('/', { replaceUrl: true }));
  }
}
