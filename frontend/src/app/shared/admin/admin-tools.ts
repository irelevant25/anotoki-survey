import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { Router } from '@angular/router';
import { provideAnotokiAdmin } from '@anotoki/lib/admin';
import { type PeopleDeleteQuestion, type PeoplePerson, type PeopleVisitors, provideAnotokiPeople } from '@anotoki/lib/people';
import { signInOrShowWhy } from '../auth/auth.config';
import { AuthService } from '../auth/auth.service';
import { MIGRATIONS_PATH } from '../migrations';
import { AdminDates } from './admin-dates.service';

/** The admin panel's People page: the anotoki family's (<anotoki-people-page>). */
export const PEOPLE_PATH = '/admin/people';

/**
 * The admin tools this site takes from the anotoki family's library
 * (anotoki-lib 0.5.0; feedback since 0.6.2): the error log, the audit log,
 * feedback and the backups (@anotoki/lib/admin and its pages), and the People
 * page (@anotoki/lib/people) - each page an entry point of its own on a lazy
 * route of the admin panel (admin.routes.ts), for the site's ADMIN alone, as
 * the server's routes are: anybody else is told whose the page is, and nothing
 * is asked of the server. No file explorer (the pictures live in the
 * database, and are in every backup).
 *
 * - Feedback: what people sent through the form (shared/feedback.ts), the
 *   library's kinds and no places of the site; how many nobody opened yet is
 *   the family's FeedbackUnread - beside the System link in the panel's frame and on the
 *   System page's card, asked as the admin panel opens (its frame, sites/admin/app.component.ts) and as
 *   the System page does: no mail is sent for a message.
 * - Who is ADMIN is the token's say (AuthService, the IAM's roles here).
 * - A backup is made, downloaded, deleted or restored only after a sign-in of
 *   the last ten minutes (the server reads the token's auth_time): its
 *   refusal offers "Sign in again", the IAM asking for the password even with
 *   a session there - and back to the Backups page.
 * - The dates in the anotoki account's order and on its clock (AdminDates).
 * - While a tool's table waits for an update, the pages offer the Migrations
 *   page.
 * - The People page in this site's words: whom it keeps (everybody who signed
 *   in - their name from the anotoki account, no address), how many surveys
 *   each answered and wrote (the server's columns), the visitors in one line,
 *   and Delete - every answer of theirs, and the reply address and browser of
 *   the feedback they sent (the library's delete does both), after the page's
 *   question alone (the owner's decision: no proof of a recent sign-in; the
 *   server audits it). Nobody is linked from the logs: the People page has no
 *   page of its own for a person.
 */
export function provideSiteAdmin(): EnvironmentProviders {
  return makeEnvironmentProviders([
    provideAnotokiAdmin(() => {
      const auth = inject(AuthService);
      const router = inject(Router);
      const dates = inject(AdminDates);
      return {
        isAdmin: () => auth.isAdmin(),
        signInAgain: () => signInOrShowWhy(auth, router, 'login'),
        migrationsRoute: MIGRATIONS_PATH,
        siteName: 'the survey site',
        formatDate: (iso: string) => dates.formatDateTime(iso),
      };
    }),
    provideAnotokiPeople(() => {
      const auth = inject(AuthService);
      const dates = inject(AdminDates);
      const me = (): string | null => auth.user()?.sub ?? null;
      return {
        isAdmin: () => auth.isAdmin(),
        me,
        lead: 'Everybody who has signed in here, the most recently seen first: how many surveys each answered and wrote. The name is their anotoki account’s; their record here holds no address.',
        formatDate: (iso: string) => dates.formatDateTime(iso),
        delete: {
          label: 'Delete their answers',
          allowed: (person) => answeredBy(person) > 0,
          question: (person) => deleteQuestion(person, person.sub === me()),
        },
        visitorsLine,
        migrationsRoute: MIGRATIONS_PATH,
      };
    }),
  ]);
}

/** How many surveys a person answered here: the server's `answered` column. */
function answeredBy(person: PeoplePerson): number {
  const count = Number(person['answered'] ?? 0);
  return Number.isFinite(count) ? count : 0;
}

/** The question before a person's answers are deleted: what goes, what stays. */
export function deleteQuestion(person: PeoplePerson, isMe: boolean): PeopleDeleteQuestion {
  const name = person.name || `person ${person.sub}`;
  const answered = answeredBy(person);
  return {
    title: `Delete ${name}’s answers?`,
    message:
      `Every answer they sent here goes - ${answered} ${answered === 1 ? 'survey' : 'surveys'} - and cannot be brought back; the results no longer count them. ` +
      'Feedback they sent stays, without its reply address and browser. ' +
      'The surveys they wrote stay, and so does their anotoki account. The backups made before now still hold the answers until they are deleted.' +
      (isMe ? ' This is you.' : ''),
    confirm: 'Delete their answers',
  };
}

/**
 * The visitors line: how many answered without signing in (each listed in the
 * results as "Visitor N"), and how many of them are still active - their
 * browser's key not ended, so signing in there moves their answers into their
 * account.
 */
export function visitorsLine(visitors: PeopleVisitors): string {
  const count = Number(visitors.count) || 0;
  if (count === 0) {
    return 'No visitors: every answer here is a signed-in person’s.';
  }
  const active = Number(visitors['active']) || 0;
  return `${count} ${count === 1 ? 'visitor' : 'visitors'} answered without signing in, ${active} of them still active: signing in from the same browser moves a visitor’s answers into their account.`;
}
