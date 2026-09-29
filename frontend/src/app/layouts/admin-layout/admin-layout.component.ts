import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterOutlet } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ButtonComponent } from '../../ui/button/button.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { TopBarComponent } from '../top-bar/top-bar.component';

/**
 * The frame of the admin area: the top bar over the page - for the people who
 * write the surveys (EDITOR) and run the site (ADMIN). Anybody else signed in
 * is told whose it is and where the surveys are; the API refuses them all the
 * same (and signing in is the route's guard's to ask for).
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
