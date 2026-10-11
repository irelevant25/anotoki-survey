import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { AuthService } from '../../../core/auth/auth.service';
import { SYSTEM_PAGES } from './system-pages';

/**
 * /admin/system: what keeps the site running, for its ADMIN - the way to each
 * of the System pages (SYSTEM_PAGES, system-pages.ts), the top bar's one link
 * for all of them. Anybody else (an EDITOR) is told whose the pages are, as
 * each of them says too; the server refuses them all the same.
 */
@Component({
  selector: 'app-system',
  imports: [RouterLink, ButtonComponent, EmptyStateComponent, IconComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './system.component.html',
  styleUrl: './system.component.scss',
})
export class SystemComponent {
  protected readonly auth = inject(AuthService);
  protected readonly pages = SYSTEM_PAGES;
}
