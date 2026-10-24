import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { BadgeComponent } from '@anotoki/lib/ui/badge';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { LinkCardComponent } from '@anotoki/lib/ui/link-card';
import { PageHeaderComponent } from '@anotoki/lib/ui/page-header';
import { AuthService } from '../../../shared/auth/auth.service';
import { SYSTEM_PAGES } from './system-pages';

/**
 * /admin/system: what keeps the site running, for its ADMIN - the way to each
 * of the System pages (SYSTEM_PAGES, system-pages.ts), the admin frame's one link
 * for all of them, each a card that is one link as a whole (the kit's link
 * card, anotoki-lib 0.6.0). Feedback's card says how many messages nobody
 * opened yet (the family's FeedbackUnread, asked again as the page opens: no
 * mail is sent for a message). Anybody else (an EDITOR) is told whose the
 * pages are, as each of them says too; the server refuses them all the same.
 */
@Component({
  selector: 'app-system',
  imports: [RouterLink, BadgeComponent, ButtonComponent, EmptyStateComponent, IconComponent, LinkCardComponent, PageHeaderComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './system.component.html',
  styleUrl: './system.component.scss',
})
export class SystemComponent {
  protected readonly auth = inject(AuthService);
  protected readonly pages = SYSTEM_PAGES;
  private readonly _unread = inject(FeedbackUnread);
  /** The feedback messages nobody opened yet; 0 for none, or nothing known. */
  protected readonly unreadFeedback = computed(() => this._unread.count() ?? 0);

  constructor() {
    // The family's count asks nothing for anybody but the site's ADMIN.
    void this._unread.refresh();
  }
}
