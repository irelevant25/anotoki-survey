import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LoadErrorComponent } from './boot/load-error/load-error.component';
import { NotSetUpComponent } from './boot/not-set-up/not-set-up.component';
import { AuthService } from './core/auth/auth.service';
import { ConfirmHostComponent } from './ui/confirm/confirm-host.component';
import { LightboxComponent } from './ui/lightbox/lightbox.component';
import { LightboxService } from './ui/lightbox/lightbox.service';
import { ToastHostComponent } from './ui/toast/toast-host.component';

/**
 * The page - or, while the site cannot run, the card saying why (not set up
 * yet, or the server out of reach) - plus what is drawn over any page:
 * toasts, the confirm dialog, and a picture shown large.
 */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent, LightboxComponent, NotSetUpComponent, LoadErrorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  protected readonly auth = inject(AuthService);
  protected readonly lightbox = inject(LightboxService);
}
