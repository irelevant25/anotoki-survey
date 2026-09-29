import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopBarComponent } from '../top-bar/top-bar.component';

/**
 * The frame of what people see: the top bar - the mark, and who is signed in
 * - and the survey below it. Nothing else to read but the survey; the way into
 * the admin area shows only to the people who write surveys.
 */
@Component({
  selector: 'app-participant-layout',
  imports: [RouterOutlet, TopBarComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './participant-layout.component.html',
  styleUrl: './participant-layout.component.scss',
})
export class ParticipantLayoutComponent {}
