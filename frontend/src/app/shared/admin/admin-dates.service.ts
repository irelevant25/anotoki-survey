import { Injectable, inject } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { formatDate, formatDateTime, formatDay, timeAgo } from '../util/dates';

/**
 * The admin panel's dates and times (shared/util/dates.ts: English) in the
 * order and on the clock the signed-in person's anotoki account has chosen,
 * when it has - every anotoki site writes them that way (IAM migration 015).
 *
 * A page takes these in place of the plain functions, under the same names
 * (`protected readonly formatDateTime = inject(AdminDates).formatDateTime`),
 * and its template calls them as before. Each reads the account's preferences
 * while the template is drawn, so a change of them - saved on another site,
 * brought by the next token - draws the page again.
 */
@Injectable({ providedIn: 'root' })
export class AdminDates {
  private readonly _auth = inject(AuthService);

  /** "29 Sept 2026", or in the order chosen. */
  readonly formatDate = (iso: string): string => formatDate(iso, this._auth.preferences());
  /** "29 Sept 2026, 14:30", or the date and the time as chosen, side by side. */
  readonly formatDateTime = (iso: string): string => formatDateTime(iso, this._auth.preferences());
  /** A calendar day in full, "20 October 2026", or in the order chosen. */
  readonly formatDay = (day: string): string => formatDay(day, this._auth.preferences());
  /** "3 hours ago" - and from two weeks on the date, in the order chosen. */
  readonly timeAgo = (iso: string): string => timeAgo(iso, Date.now(), this._auth.preferences());
}
