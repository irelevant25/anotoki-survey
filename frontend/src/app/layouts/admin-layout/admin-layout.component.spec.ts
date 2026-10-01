import { ChangeDetectionStrategy, Component, input, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { TopBarComponent } from '../top-bar/top-bar.component';
import { AdminLayoutComponent } from './admin-layout.component';

/** The top bar has its own spec; here it is only a place at the top. */
@Component({ selector: 'app-top-bar', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class TopBarStubComponent {
  readonly area = input<'survey' | 'admin'>('survey');
}

@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '<p class="page">The page of the admin area</p>' })
class PageComponent {}

@Component({ selector: 'app-test-site', imports: [RouterOutlet], changeDetection: ChangeDetectionStrategy.OnPush, template: '<router-outlet />' })
class SiteComponent {}

describe('AdminLayoutComponent', () => {
  // As AuthService has them: no roles for anybody who is not signed in.
  const signedIn = signal(true);
  const roles = signal<string[]>(['EDITOR']);
  const auth = {
    signedIn: () => signedIn(),
    isStaff: () => signedIn() && (roles().includes('ADMIN') || roles().includes('EDITOR')),
  };

  let fixture: ComponentFixture<AdminLayoutComponent>;
  let host: HTMLElement;

  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const text = (selector: string) => clean(host.querySelector(selector)?.textContent);

  async function layout(who: { signedIn: boolean; roles: string[] }): Promise<void> {
    signedIn.set(who.signedIn);
    roles.set(who.roles);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'admin', component: AdminLayoutComponent, children: [{ path: 'translations', component: PageComponent }] },
          { path: '', pathMatch: 'full', component: PageComponent },
        ]),
        { provide: AuthService, useValue: auth },
      ],
    });
    TestBed.overrideComponent(AdminLayoutComponent, { remove: { imports: [TopBarComponent] }, add: { imports: [TopBarStubComponent] } });
    fixture = TestBed.createComponent(AdminLayoutComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  it('draws the page for staff - an editor, an administrator - and no card', async () => {
    await layout({ signedIn: true, roles: ['EDITOR'] });

    expect(host.querySelector('main router-outlet')).not.toBeNull();
    expect(host.querySelector('app-empty-state')).toBeNull();

    roles.set(['ADMIN']);
    await fixture.whenStable();
    expect(host.querySelector('main router-outlet')).not.toBeNull();
    expect(host.querySelector('app-empty-state')).toBeNull();
  });

  it('tells somebody signed in with no role here whose the area is, and where the surveys are', async () => {
    await layout({ signedIn: true, roles: [] });

    expect(host.querySelector('router-outlet')).toBeNull();
    expect(text('.empty-heading')).toBe('This part is for the people who write the surveys');
    expect(text('.empty-text')).toBe("Your anotoki account has no editor role here. The site's administrator can give it to you in the anotoki account's admin console.");
    const link = host.querySelector<HTMLAnchorElement>('app-empty-state a')!;
    expect(clean(link.textContent)).toBe('See the open surveys');
    expect(link.getAttribute('href')).toBe('/');
    expect(host.textContent).not.toContain('You are signed out');
  });

  it('tells somebody whose session ended that they are signed out - not that they have no role - and what became of what they typed', async () => {
    await layout({ signedIn: false, roles: [] });

    expect(host.querySelector('router-outlet')).toBeNull();
    expect(text('.empty-heading')).toBe('You are signed out');
    expect(text('.empty-text')).toBe(
      'Your session has ended. Sign in again with the button at the top: what you typed on the Translations and Languages pages is kept in this tab, and will be in its boxes again. ' +
        'Changes to a survey that were not saved yet stay only while this page is open - sign in again in another tab to save them.',
    );
    expect(host.textContent).not.toContain('no editor role');
    expect(host.textContent).not.toContain('This part is for the people who write the surveys');
    // The way back is the top bar's "Sign in": the card has no button or link of its own.
    expect(host.querySelector('app-empty-state a, app-empty-state button')).toBeNull();
    expect(host.querySelector('app-top-bar')).not.toBeNull();
  });

  it('says so the moment the session ends over an open page, and draws the page again for the editor who comes back', async () => {
    await layout({ signedIn: true, roles: ['EDITOR'] });
    // The roles go with the sign-in, as the token's do: an editor signed out is no editor.
    signedIn.set(false);
    await fixture.whenStable();

    expect(host.querySelector('router-outlet')).toBeNull();
    expect(text('.empty-heading')).toBe('You are signed out');

    signedIn.set(true);
    await fixture.whenStable();
    expect(host.querySelector('main router-outlet')).not.toBeNull();
    expect(host.querySelector('app-empty-state')).toBeNull();
  });

  it('takes the page away with no navigation, and the address stays for the way back', async () => {
    await layout({ signedIn: true, roles: ['EDITOR'] });
    fixture.destroy();

    // The layout where it lives: drawn by the router, its page in its outlet.
    const site = TestBed.createComponent(SiteComponent);
    const router = TestBed.inject(Router);
    host = site.nativeElement;
    await router.navigateByUrl('/admin/translations');
    await site.whenStable();
    expect(text('app-admin-layout main .page')).toBe('The page of the admin area');

    signedIn.set(false);
    await site.whenStable();

    expect(host.querySelector('.page')).toBeNull();
    expect(text('app-admin-layout .empty-heading')).toBe('You are signed out');
    expect(router.url).toBe('/admin/translations');
  });
});
