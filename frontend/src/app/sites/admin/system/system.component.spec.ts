import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideAnotokiAdmin } from '@anotoki/lib/admin';
import { AuthService } from '../../../shared/auth/auth.service';
import { provideTestTranslations } from '../../../shared/testing/test-translations';
import { ADMIN_ROUTES } from '../admin.routes';
import { SYSTEM_PAGES, SYSTEM_PATH, SYSTEM_PATHS } from './system-pages';
import { SystemComponent } from './system.component';

describe('SystemComponent: the way to the ADMIN’s system pages', () => {
  const roles = signal<string[]>(['ADMIN']);
  const words = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;
  let fixture: ComponentFixture<SystemComponent>;

  async function draw(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        provideTestTranslations(),
        // How many feedback messages are new: the family's count, asked for the site's ADMIN alone.
        provideAnotokiAdmin(() => ({ isAdmin: () => roles().includes('ADMIN') })),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { isAdmin: () => roles().includes('ADMIN') } },
      ],
    });
    fixture = TestBed.createComponent(SystemComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => roles.set(['MEMBER', 'ADMIN']));

  it('links each of them for the site’s ADMIN - the people, feedback, the error log, the audit log, the backups, the migrations', async () => {
    const host = await draw();
    expect(words(host.querySelector('h1'))).toBe('System');
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('a.item'));
    expect(links.map((link) => [words(link.querySelector('.label')), link.getAttribute('href')])).toEqual([
      ['People', '/admin/people'],
      ['Feedback', '/admin/feedback'],
      ['Error log', '/admin/errors'],
      ['Audit log', '/admin/audit'],
      ['Backups', '/admin/backups'],
      ['Migrations', '/admin/migrations'],
    ]);
  });

  it('says on Feedback’s card how many messages nobody opened yet - asked again as the page opens - and nothing for none', async () => {
    const host = await draw();
    const requests = TestBed.inject(HttpTestingController);
    requests.expectOne('/api/admin/feedback/unread').flush({ unread: 4 });
    const feedback = Array.from(host.querySelectorAll<HTMLAnchorElement>('a.item')).find((link) => link.getAttribute('href') === '/admin/feedback')!;
    // The count is the answer's, a promise later.
    await vi.waitFor(async () => {
      await fixture.whenStable();
      expect(words(feedback.querySelector('anotoki-badge'))).toBe('4 new');
    });
    expect(host.querySelectorAll('a.item anotoki-badge')).toHaveLength(1);
    requests.verify();
  });

  it('tells an EDITOR whose the pages are, and links none of them - asking nothing of the server', async () => {
    roles.set(['MEMBER', 'EDITOR']);
    const host = await draw();
    TestBed.inject(HttpTestingController).verify();
    expect(host.querySelector('a.item')).toBeNull();
    expect(words(host.querySelector('anotoki-empty-state .anotoki-empty-state__heading'))).toBe("These pages are for the site's administrators");
    expect(host.querySelector('anotoki-empty-state a')?.getAttribute('href')).toBe('/admin');
  });

  it('is the top bar’s one link for every page it lists, and each of them is a lazy route of the admin panel', () => {
    expect(SYSTEM_PATH).toBe('/admin/system');
    expect(SYSTEM_PATHS).toEqual(SYSTEM_PAGES.map((page) => page.path));
    const children = ADMIN_ROUTES[0].children ?? [];
    for (const path of [SYSTEM_PATH, ...SYSTEM_PATHS]) {
      const route = children.find((child) => `/admin/${child.path}` === path);
      expect(route?.loadComponent, path).toBeTypeOf('function');
      expect(route?.component, path).toBeUndefined();
    }
  });
});
