import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button/button.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { TopBarComponent } from '../top-bar/top-bar.component';

/**
 * The frame of the admin area: the top bar over the page - for the people who
 * write the surveys (EDITOR) and run the site (ADMIN). It has three states:
 *
 * - staff: the page;
 * - nobody signed in: "You are signed out". Nobody arrives here signed out
 *   (the route's guard sends them to the sign-in), so this is always a session
 *   that ended with an admin page open - the IAM's idle limit, a sign-out in
 *   another tab or on another anotoki site. The page is taken away with no
 *   navigation; the card says what became of what was typed (the drafts of the
 *   Translations and Languages pages are kept for the tab, a survey's unsaved
 *   changes only while this page stays open - AdminStore's rule) and that the
 *   way back is the top bar's "Sign in". It has no button of its own;
 * - somebody signed in with no role here: whose the area is, and where the
 *   surveys are. The API refuses them all the same.
 *
 * In the last two the route under the layout is still the active one, with no
 * page drawn: a guard on it is asked with no page (unsavedChangesGuard).
 */
@Component({
  selector: 'app-admin-layout',
  imports: [RouterOutlet, RouterLink, ButtonComponent, EmptyStateComponent, TopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-layout.component.html',
  styleUrl: './admin-layout.component.scss',
})
export class AdminLayoutComponent {
  protected readonly auth = inject(AuthService);
}
