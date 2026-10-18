import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ANOTOKI_ADMIN_CONFIG } from '@anotoki/lib/admin';
import { ANOTOKI_PEOPLE_CONFIG, type PeoplePerson } from '@anotoki/lib/people';
import { AuthService } from '../auth/auth.service';
import { MIGRATIONS_PATH } from '../migrations';
import { deleteQuestion, provideSiteAdmin, visitorsLine } from './admin-tools';

function person(sub: string, name: string | null, answered: number): PeoplePerson {
  return { sub, name, first_seen_at: null, last_seen_at: null, anonymized_at: null, iam_url: `https://iam.example.test/admin/users/${sub}`, answered, written: 0 };
}

describe('provideSiteAdmin(): the anotoki family’s admin tools and People page, wired to this site', () => {
  const roles = signal<string[]>(['ADMIN']);
  const auth = {
    isAdmin: () => roles().includes('ADMIN'),
    user: () => ({ sub: '7' }),
    preferences: () => ({ theme: 'auto', date_format: 'ymd_dash', time_format: '24' }),
    signIn: vi.fn(async (_returnTo?: string, _prompt?: 'login') => true),
    signInFailure: () => null,
  };

  beforeEach(() => {
    roles.set(['ADMIN']);
    auth.signIn.mockClear();
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideSiteAdmin(), { provide: AuthService, useValue: auth }] });
  });

  it('opens the error log, the audit log and the backups to the site’s ADMIN alone, judged from the token', () => {
    const config = TestBed.inject(ANOTOKI_ADMIN_CONFIG);
    expect(config.isAdmin()).toBe(true);
    roles.set(['MEMBER', 'EDITOR']);
    expect(config.isAdmin()).toBe(false);
    // No path of its own: the tools are under /api/admin, as the server mounts them (routes/admin.php).
    expect([config.apiBase, config.paths]).toEqual([undefined, undefined]);
    expect(config.migrationsRoute).toBe(MIGRATIONS_PATH);
    // Nobody is linked: the People page has no page of its own for a person.
    expect(config.personLink).toBeUndefined();
  });

  it('asks the IAM for the password again for the backups’ proof - a sign-in of the last ten minutes', async () => {
    await TestBed.inject(ANOTOKI_ADMIN_CONFIG).signInAgain!();
    expect(auth.signIn).toHaveBeenCalledWith(undefined, 'login');
  });

  it('writes the dates in the anotoki account’s order and on its clock', () => {
    expect(TestBed.inject(ANOTOKI_ADMIN_CONFIG).formatDate!('2026-10-01T10:00:00Z')).toMatch(/^2026-10-01 /);
    expect(TestBed.inject(ANOTOKI_PEOPLE_CONFIG).formatDate!('2026-10-01T10:00:00Z')).toMatch(/^2026-10-01 /);
  });

  it('the People page: the site’s ADMIN, their own row marked, Delete only where there are answers to delete', () => {
    const people = TestBed.inject(ANOTOKI_PEOPLE_CONFIG);
    expect(people.isAdmin!()).toBe(true);
    expect(people.me!()).toBe('7');
    expect(people.apiBase).toBeUndefined();
    expect(people.migrationsRoute).toBe(MIGRATIONS_PATH);
    expect(people.delete?.label).toBe('Delete their answers');
    expect(people.delete?.allowed!(person('3', 'zuzka', 2))).toBe(true);
    expect(people.delete?.allowed!(person('4', 'pat', 0))).toBe(false);
    expect(people.delete?.question!(person('7', 'owner', 1), []).message).toContain('This is you.');
    expect(people.delete?.question!(person('3', 'zuzka', 1), []).message).not.toContain('This is you.');
  });
});

describe('deleteQuestion(): what the People page asks before a person’s answers go', () => {
  it('says what goes - their answers, counted, and their feedback’s reply address and browser - and what stays: the feedback’s words, the surveys they wrote, the account, the backups made before', () => {
    const asked = deleteQuestion(person('3', 'zuzka', 2), false);
    expect(asked.title).toBe('Delete zuzka’s answers?');
    expect(asked.message).toBe(
      'Every answer they sent here goes - 2 surveys - and cannot be brought back; the results no longer count them. ' +
        'Feedback they sent stays, without its reply address and browser. ' +
        'The surveys they wrote stay, and so does their anotoki account. The backups made before now still hold the answers until they are deleted.',
    );
    expect(asked.confirm).toBe('Delete their answers');
    expect(deleteQuestion(person('3', 'zuzka', 1), false).message).toContain(' - 1 survey - ');
  });

  it('names somebody with no name by their IAM id', () => {
    expect(deleteQuestion(person('12', null, 1), false).title).toBe('Delete person 12’s answers?');
  });
});

describe('visitorsLine(): the visitors in one line', () => {
  it('says none', () => {
    expect(visitorsLine({ count: 0, active: 0 })).toBe('No visitors: every answer here is a signed-in person’s.');
  });

  it('counts them, and those whose browser can still bring their answers into an account', () => {
    expect(visitorsLine({ count: 5, active: 2 })).toBe(
      '5 visitors answered without signing in, 2 of them still active: signing in from the same browser moves a visitor’s answers into their account.',
    );
    expect(visitorsLine({ count: 1, active: 0 })).toBe('1 visitor answered without signing in, 0 of them still active: signing in from the same browser moves a visitor’s answers into their account.');
  });
});
