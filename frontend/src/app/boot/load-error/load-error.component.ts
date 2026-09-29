import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { BrandComponent } from '../../ui/brand/brand.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { IconComponent } from '../../ui/icon/icon.component';

/**
 * The server could not be reached as the site started - it is down, or the
 * connection is. Drawn instead of the whole site, with a way to try again.
 */
@Component({
  selector: 'app-load-error',
  imports: [BrandComponent, ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './load-error.component.html',
  styleUrl: './load-error.component.scss',
})
export class LoadErrorComponent {
  private readonly _auth = inject(AuthService);
  protected readonly trying = signal(false);

  protected async retry(): Promise<void> {
    this.trying.set(true);
    await this._auth.init();
    this.trying.set(false);
  }
}
