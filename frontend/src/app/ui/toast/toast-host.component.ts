import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { IconComponent, IconName } from '../icon/icon.component';
import { ToastService, ToastTone } from './toast.service';

const ICONS: Record<ToastTone, IconName> = { success: 'checkCircle', info: 'info', warning: 'alert', danger: 'xCircle' };

/**
 * The toasts, bottom right (bottom centre on a phone).
 *
 * The region is always in the page, empty or not: a live region that is
 * created together with its first message is one many screen readers never
 * announce.
 */
@Component({
  selector: 'app-toast-host',
  imports: [IconComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './toast-host.component.html',
  styleUrl: './toast-host.component.scss',
})
export class ToastHostComponent {
  protected readonly toasts = inject(ToastService);
  protected readonly icons = ICONS;
  private readonly _i18n = inject(TranslationService);

  /**
   * The region's name. The region is there on the pages drawn when the site
   * cannot run too, where there may be no strings at all: it is named in
   * English then, as those pages word themselves - never with the key.
   */
  protected readonly regionLabel = computed(() => (this._i18n.has('toast.region') ? this._i18n.t('toast.region') : 'Notifications'));
}
