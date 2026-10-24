import { ChangeDetectionStrategy, Component, inject, input, output } from '@angular/core';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { AdminDates } from '../../../../shared/admin/admin-dates.service';
import { ageLabel, genderLabel } from '../../../../shared/survey/about-you';
import { SurveyResponse } from '../../../../shared/survey/survey.model';

/** A person in a list, with what they wrote there when it matters ("Other", a text answer). */
export interface PersonRow {
  response: SurveyResponse;
  note: string | null;
}

/** A hue from a name: the same person always gets the same colour of initial. */
export function hueOf(name: string): number {
  let hash = 0;
  for (const char of name) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash % 360;
}

/**
 * People, each a button to their whole survey: the initial, the name and
 * address, gender and age, when they answered - and a quote when the list is
 * about what they wrote.
 */
@Component({
  selector: 'app-people-list',
  imports: [IconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './people-list.component.html',
  styleUrl: './people-list.component.scss',
})
export class PeopleListComponent {
  readonly rows = input.required<PersonRow[]>();

  readonly open = output<string>();

  protected readonly hueOf = hueOf;
  protected readonly timeAgo = inject(AdminDates).timeAgo;
  protected readonly genderLabel = genderLabel;
  protected readonly ageLabel = ageLabel;
}
