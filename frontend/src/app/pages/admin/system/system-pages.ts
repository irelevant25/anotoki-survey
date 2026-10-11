import { type SurveyIconName } from '../../../core/kit';

/** One of the System pages: its name, where it is, and what it is for. */
export interface SystemPage {
  label: string;
  path: string;
  icon: SurveyIconName;
  text: string;
}

/** The System page itself: the top bar's one link for all of them (an ADMIN's). */
export const SYSTEM_PATH = '/admin/system';

/**
 * The ADMIN's System pages, in the order of the list: the anotoki family's
 * (admin.routes.ts) - the people, the logs, the backups and the updates. A
 * file of its own, so the top bar (in the first load) knows their paths
 * without the System page, which is loaded with its route.
 */
export const SYSTEM_PAGES: readonly SystemPage[] = [
  {
    label: 'People',
    path: '/admin/people',
    icon: 'users',
    text: 'Everybody who has signed in, how many surveys each answered and wrote - and the accounts the IAM deleted, scrubbed here too.',
  },
  { label: 'Error log', path: '/admin/errors', icon: 'alert', text: 'What failed on the server, grouped, for the last 30 days.' },
  { label: 'Audit log', path: '/admin/audit', icon: 'history', text: 'Who did what in the admin panel: the surveys, the answers, the words, the people, the backups and the updates.' },
  { label: 'Backups', path: '/admin/backups', icon: 'database', text: 'The whole database, the pictures too: every day, before every update, and whenever you make one.' },
  { label: 'Migrations', path: '/admin/migrations', icon: 'layers', text: 'The database’s updates: what is applied, and what waits.' },
];

/** Where the System pages are: the bar's System link stays lit on each of them. */
export const SYSTEM_PATHS: readonly string[] = SYSTEM_PAGES.map((page) => page.path);
