import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { TranslationService } from '../../core/i18n/translation.service';
import { BrandComponent } from '../../ui/brand/brand.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { keptWord } from '../kept-word';

/**
 * The backend answered 503 not_set_up: config/database.local.php and
 * config/iam.local.php are not there yet, or the database needs an update.
 * The setup page does both. Drawn instead of the whole site.
 *
 * Its words cannot be asked for - the strings live in the database this page
 * is about - so each is the string the browser kept from an earlier visit, or
 * the English written here (keptWord()). The line saying what is missing is
 * the server's own, for whoever runs the site, and is shown as it came.
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
  private readonly _i18n = inject(TranslationService);

  protected readonly area = computed(() => keptWord(this._i18n, 'brand.area', 'survey'));
  protected readonly title = computed(() => keptWord(this._i18n, 'boot.notSetUp.title', 'The survey site is not set up yet'));
  protected readonly text = computed(() =>
    keptWord(this._i18n, 'boot.notSetUp.text', 'It needs its database, and the address of the anotoki account people sign in with. The setup page asks for both and takes a minute.'),
  );
  protected readonly open = computed(() => keptWord(this._i18n, 'boot.notSetUp.open', 'Open the setup page'));
  protected readonly after = computed(() => keptWord(this._i18n, 'boot.notSetUp.after', 'When it is done, come back here and reload the page.'));
}
