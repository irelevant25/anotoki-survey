import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent } from '../../ui/button/button.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';

/** Any address the site does not know. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, ButtonComponent, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
})
export class NotFoundComponent {}
