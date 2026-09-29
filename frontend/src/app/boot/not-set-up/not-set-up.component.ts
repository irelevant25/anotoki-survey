import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { BrandComponent } from '../../ui/brand/brand.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { IconComponent } from '../../ui/icon/icon.component';

/**
 * The backend answered 503 not_set_up: config/database.local.php and
 * config/iam.local.php are not there yet, or the database needs an update.
 * The setup page does both. Drawn instead of the whole site.
 */
@Component({
  selector: 'app-not-set-up',
  imports: [BrandComponent, ButtonComponent, IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './not-set-up.component.html',
  styleUrl: './not-set-up.component.scss',
})
export class NotSetUpComponent {
  protected readonly auth = inject(AuthService);
}
