import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { provideTestTranslations } from '../../../core/testing/test-translations';
import { ADMIN_ROUTES } from '../admin.routes';
import { SYSTEM_PAGES, SYSTEM_PATH, SYSTEM_PATHS } from './system-pages';
import { SystemComponent } from './system.component';

describe('SystemComponent: the way to the ADMIN’s system pages', () => {
  const roles = signal<string[]>(['ADMIN']);
  const words = (element: Element | null | undefined) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  async function draw(): Promise<HTMLElement> {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), provideTestTranslations(), { provide: AuthService, useValue: { isAdmin: () => roles().includes('ADMIN') } }],
    });
    const fixture = TestBed.createComponent(SystemComponent);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => roles.set(['MEMBER', 'ADMIN']));

  it('links each of them for the site’s ADMIN - the people, the error log, the audit log, the backups, the migrations', async () => {
    const host = await draw();
    expect(words(host.querySelector('h1'))).toBe('System');
    const links = Array.from(host.querySelectorAll<HTMLAnchorElement>('a.item'));
    expect(links.map((link) => [words(link.querySelector('.label')), link.getAttribute('href')])).toEqual([
      ['People', '/admin/people'],
      ['Error log', '/admin/errors'],
      ['Audit log', '/admin/audit'],
      ['Backups', '/admin/backups'],
      ['Migrations', '/admin/migrations'],
    ]);
  });

  it('tells an EDITOR whose the pages are, and links none of them', async () => {
    roles.set(['MEMBER', 'EDITOR']);
    const host = await draw();
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
