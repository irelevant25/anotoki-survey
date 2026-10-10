import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonComponent, EmptyStateComponent } from '@anotoki/lib/ui';
import { TranslatePipe } from '../../core/i18n/translate.pipe';

/** Any address the site does not know. */
@Component({
  selector: 'app-not-found',
  imports: [RouterLink, ButtonComponent, EmptyStateComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './not-found.component.html',
  styleUrl: './not-found.component.scss',
})
export class NotFoundComponent {}
