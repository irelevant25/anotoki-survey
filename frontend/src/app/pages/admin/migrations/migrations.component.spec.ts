import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ApiError, ApiService, MigrationsStatus } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { provideTestTranslations } from '../../../core/testing/test-translations';
import { ConfirmService } from '../../../ui/confirm/confirm.service';
import { MigrationsComponent } from './migrations.component';

const BEHIND: MigrationsStatus = {
  applied: [
    { name: '001_initial_schema.sql', applied_at: '2026-09-28T10:00:00Z' },
    { name: '002_languages_and_translations.sql', applied_at: '2026-09-30T18:12:00Z' },
  ],
  pending: [{ name: '003_site_strings.sql' }, { name: '004_response_language.sql' }],
};
const CURRENT: MigrationsStatus = {
  applied: [...BEHIND.applied, { name: '003_site_strings.sql', applied_at: '2026-10-05T09:30:00Z' }, { name: '004_response_language.sql', applied_at: '2026-10-05T09:30:00Z' }],
  pending: [],
};
const ERROR =
  'statement 2 of 3: SQLSTATE[42701]: Duplicate column: 7 ERROR:  column "language" of relation "responses" already exists\n\n  ALTER TABLE responses\n      ADD COLUMN language VARCHAR(10)';

describe('MigrationsComponent: what the database has and lacks, and applying it - the IAM’s page, an ADMIN’s alone', () => {
  let fixture: ComponentFixture<MigrationsComponent>;
  let host: HTMLElement;
  const roles = signal<string[]>(['ADMIN']);
  const api = { migrations: vi.fn(), applyMigrations: vi.fn() };
  const auth = { isAdmin: () => roles().includes('ADMIN'), databaseUpdated: vi.fn() };

  const words = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  const text = (selector: string) => words(host.querySelector(selector));
  /** Each row's file and what is beside it. */
  const rows = (selector: string) => Array.from(host.querySelectorAll(`${selector} li`)).map((row) => Array.from(row.children).map(words).join(' | '));
  const button = () => host.querySelector<HTMLButtonElement>('#migrations-apply')!;
  const settle = async () => {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  };

  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(MigrationsComponent);
    host = fixture.nativeElement;
    await settle();
  }

  /** "Apply pending", and the answer to the question it asks. */
  async function apply(yes = true): Promise<string | undefined> {
    const confirm = TestBed.inject(ConfirmService);
    button().click();
    await settle();
    const asked = confirm.pending()?.title;
    confirm.settle(yes);
    await settle();
    await settle();
    return asked;
  }

  beforeEach(async () => {
    roles.set(['ADMIN']);
    api.migrations.mockReset().mockResolvedValue(BEHIND);
    api.applyMigrations.mockReset();
    auth.databaseUpdated.mockReset();
    TestBed.configureTestingModule({
      providers: [provideTestTranslations({}), provideRouter([]), { provide: ApiService, useValue: api }, { provide: AuthService, useValue: auth }],
    });
    vi.spyOn(TestBed.inject(TranslationService), 'reload').mockResolvedValue();
  });

  afterEach(() => vi.restoreAllMocks());

  it('shows Pending in the order they will run and Applied with when - in English', async () => {
    await draw();
    expect(text('h1')).toBe('Migrations');
    expect(text('.lead')).toBe('The database schema is what these files build. Back the database up before applying anything.');
    expect(rows('#migrations-pending')).toEqual(['003_site_strings.sql | pending', '004_response_language.sql | pending']);
    expect(text('#migrations-pending .card-subtitle')).toBe('In the order they will run.');
    expect(rows('#migrations-applied').map((row) => row.split(' | ')[0])).toEqual(['001_initial_schema.sql', '002_languages_and_translations.sql']);
    expect(rows('#migrations-applied').every((row) => /\| .*2026/.test(row))).toBe(true);
    expect(text('#migrations-applied .card-subtitle')).toBe('2 files');
    expect(text('#migrations-apply')).toBe('Apply pending');
    expect(button().disabled).toBe(false);
  });

  it('asks first - a no applies nothing', async () => {
    await draw();
    expect(await apply(false)).toBe('Apply 2 pending migrations?');
    expect(api.applyMigrations).not.toHaveBeenCalled();
    expect(host.querySelector('#migrations-result')).toBeNull();
  });

  it('applied: "Up to date", the lists read again, the strings read again - and the site runs again', async () => {
    await draw();
    api.applyMigrations.mockResolvedValue({ applied: ['003_site_strings.sql', '004_response_language.sql'], failed: null, error: null });
    api.migrations.mockResolvedValue(CURRENT);
    await apply();

    expect(text('#migrations-result .alert-heading')).toBe('Up to date');
    expect(text('#migrations-result .alert-text')).toBe('Applied: 003_site_strings.sql, 004_response_language.sql.');
    expect(host.querySelector('#migrations-result')?.getAttribute('role')).toBe('alert');
    expect(text('#migrations-pending')).toContain('Nothing pending');
    expect(button().disabled).toBe(true);
    expect(TestBed.inject(TranslationService).reload).toHaveBeenCalledTimes(1);
    expect(auth.databaseUpdated).toHaveBeenCalledTimes(1);
  });

  it('a file that failed: where it stopped, what ran first, that it was rolled back whole, and the database’s whole error', async () => {
    await draw();
    api.applyMigrations.mockResolvedValue({ applied: ['003_site_strings.sql'], failed: '004_response_language.sql', error: ERROR });
    api.migrations.mockResolvedValue({ applied: [...BEHIND.applied, { name: '003_site_strings.sql', applied_at: '2026-10-05T09:30:00Z' }], pending: [{ name: '004_response_language.sql' }] });
    await apply();

    expect(host.querySelector('#migrations-result')?.getAttribute('data-tone')).toBe('danger');
    expect(text('#migrations-result .alert-heading')).toBe('Stopped at 004_response_language.sql');
    expect(text('#migrations-result .alert-text p')).toBe('Applied first: 003_site_strings.sql. The failed file was rolled back as a whole.');
    // Its own lines, as PostgreSQL wrote them: text, never markup.
    expect(host.querySelector('#migrations-result pre code')?.textContent).toBe(ERROR);
    expect(rows('#migrations-pending')).toEqual(['004_response_language.sql | pending']);
    // 003 came: its strings are read again; the database is still behind.
    expect(TestBed.inject(TranslationService).reload).toHaveBeenCalledTimes(1);
    expect(auth.databaseUpdated).not.toHaveBeenCalled();
  });

  it('the first file failed: "Nothing was applied", and nothing is read again', async () => {
    await draw();
    api.applyMigrations.mockResolvedValue({ applied: [], failed: '003_site_strings.sql', error: 'statement 1 of 9: SQLSTATE[23505]: Unique violation' });
    await apply();
    expect(text('#migrations-result .alert-text p')).toBe('Nothing was applied. The failed file was rolled back as a whole.');
    expect(TestBed.inject(TranslationService).reload).not.toHaveBeenCalled();
  });

  it('another update running: said, and nothing was applied', async () => {
    await draw();
    api.applyMigrations.mockRejectedValue(
      new ApiError(409, 'busy', 'Another database update is running (another Apply, setup.php or php migration.php). Nothing was applied. Wait a moment, then look again.'),
    );
    await apply();
    expect(host.querySelector('#migrations-result')).toBeNull();
    expect(text('#migrations-refused .alert-heading')).toBe('Nothing was applied');
    expect(text('#migrations-refused .alert-text')).toBe('Another database update is running (another Apply, setup.php or php migration.php). Nothing was applied. Wait a moment, then look again.');
    expect(auth.databaseUpdated).not.toHaveBeenCalled();
  });

  it('nothing pending: Apply cannot be pressed', async () => {
    api.migrations.mockResolvedValue(CURRENT);
    await draw();
    expect(button().disabled).toBe(true);
    expect(text('#migrations-pending')).toContain('The database is up to date with the files.');
  });

  it('the lists could not be read: said, with Try again', async () => {
    api.migrations.mockRejectedValue(new ApiError(0, 'offline', 'The site could not be reached. Check the connection and try again.'));
    await draw();
    expect(text('app-alert .alert-heading')).toBe('The migrations could not be read');
    api.migrations.mockResolvedValue(BEHIND);
    host.querySelector<HTMLButtonElement>('app-alert button')!.click();
    await settle();
    expect(rows('#migrations-pending')).toHaveLength(2);
  });

  it('an EDITOR is told whose page it is - and nothing is asked of the server', async () => {
    roles.set(['EDITOR']);
    await draw();
    expect(text('app-empty-state .empty-heading')).toBe('Migrations are for administrators');
    expect(host.querySelector('#migrations-apply')).toBeNull();
    expect(api.migrations).not.toHaveBeenCalled();
  });
});
