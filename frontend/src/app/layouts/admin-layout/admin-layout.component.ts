import { ChangeDetectionStrategy, Component, effect, inject, untracked } from '@angular/core';
import { Router, RouterLink, RouterOutlet } from '@angular/router';
import { FeedbackUnread } from '@anotoki/lib/admin';
import { SiteStatus } from '@anotoki/lib/migrations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { signInOrShowWhy } from '../../core/auth/auth.config';
import { AuthService } from '../../core/auth/auth.service';
import { TopBarComponent } from '../top-bar/top-bar.component';

/**
 * The frame of the admin area: the top bar over the page - for the people who
 * write the surveys (EDITOR) and run the site (ADMIN). It has three states:
 *
 * - staff: the page;
 * - nobody signed in, with a Sign in button of its own (on a phone the top
 *   bar's is inside its menu). Nobody arrives here signed out - the route's
 *   guard sends them to the sign-in, and a sign-in that came back without one
 *   (or could not start) to the screen that says why - so this is a session
 *   that ended with an admin page open: the IAM's idle limit, a sign-out in
 *   another tab or on another anotoki site. "You are signed out", and what
 *   became of what was typed (the drafts of the Translations and Languages
 *   pages are kept for the tab, a survey's unsaved changes only while this
 *   page stays open - AdminStore's rule); the page is taken away with no
 *   navigation;
 * - somebody signed in with no role here: whose the area is, and where the
 *   surveys are. The API refuses them all the same.
 *
 * In the last two the route under the layout is still the active one, with no
 * page drawn: a guard on it is asked with no page (unsavedChangesGuard).
 *
 * For an ADMIN, how many feedback messages nobody opened yet - the bar's System
 * link and the System page's Feedback say it (the family's FeedbackUnread; the
 * Feedback page keeps it in step): asked as the panel opens, and again when an
 * ADMIN signs in here - never while the site cannot run (an update waiting:
 * the Migrations page is the one page that works then). No mail is sent for a
 * message: this is how the ADMIN hears of one.
 */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, ButtonComponent, EmptyStateComponent, IconComponent, TopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  protected readonly auth = inject(AuthService);
  private readonly _router = inject(Router);

  constructor() {
    const unread = inject(FeedbackUnread);
    const status = inject(SiteStatus);
    effect(() => {
      if (this.auth.isAdmin() && status.state() === 'ready') {
        // Only who is here and where the site stands are followed - never what the count reads itself.
        untracked(() => void unread.refresh());
      }
    });
  }

  /** To the IAM and back to this page - its pages in the language the person reads here, not the admin area's English; the screen that says why if it cannot start. */
  protected signIn(): void {
    void signInOrShowWhy(this.auth, this._router);
  }
}
