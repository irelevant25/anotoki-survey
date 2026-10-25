import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, RouterOutlet, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { personOrVisitorGuard } from '@anotoki/lib/auth';
import { SiteStatus } from '@anotoki/lib/migrations';
import { SiteSettings, pageAccessGuard } from '@anotoki/lib/site-settings';
import { routes } from './app.routes';
import { ParticipantLayoutComponent } from './sites/main/participant-layout/participant-layout.component';
import { staffGuard } from './sites/main/main.routes';

@Component({ selector: 'app-test-frame', imports: [RouterOutlet], changeDetection: ChangeDetectionStrategy.OnPush, template: '<router-outlet />' })
class FrameStandInComponent {}

@Component({ selector: 'app-test-page', changeDetection: ChangeDetectionStrategy.OnPush, template: '' })
class PageStandInComponent {}

/**
 * The site's routes as they are - their paths, their order, their nesting - with a stand-in for every frame and page
 * and no guard, each knowing the route it stands for: what the router itself makes of an address is what is checked.
 */
function standIns(list: Routes): Routes {
  return list.map((route): Route => {
    if (route.redirectTo !== undefined) {
      return route;
    }
    const standIn: Route = { path: route.path, pathMatch: route.pathMatch, matcher: route.matcher, data: { route } };
    return route.children ? { ...standIn, component: FrameStandInComponent, children: standIns(route.children) } : { ...standIn, component: PageStandInComponent };
  });
}

/** The site's routes the router took for the address it is at, from the top. */
function taken(): Route[] {
  const chain: Route[] = [];
  for (let node = TestBed.inject(Router).routerState.snapshot.root.firstChild; node; node = node.firstChild) {
    chain.push(node.data['route'] as Route);
  }
  return chain;
}

/**
 * Where an address goes (app.routes.ts): the legal pages are anybody's, each a path of its own - and "/" is still the
 * survey's home page behind its guard. One parent with an empty path for the three took "/" for itself (the router
 * takes an address it has read whole for such a parent when none of its children match): the empty frame stood there
 * with no guard, and nobody was sent to sign in.
 */
describe('the site’s routes', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(standIns(routes))] });
  });

  it('"/" is the survey’s home page, in the frame whose guard sends anybody not signed in to the IAM first', async () => {
    await RouterTestingHarness.create('/');
    const [frame, page] = taken();
    expect(frame.component).toBe(ParticipantLayoutComponent);
    expect(frame.canActivateChild).toContain(personOrVisitorGuard);
    expect([page.path, page.title]).toEqual(['', 'title.surveys']);
  });

  it('a survey’s address too - and one that only begins like a legal page’s is a survey’s', async () => {
    const harness = await RouterTestingHarness.create();
    for (const address of ['/genshin-6-1', '/terms-of-the-event', '/privacy2', '/about-you', '/supporters']) {
      await harness.navigateByUrl(address);
      const [frame, page] = taken();
      expect([address, frame.component === ParticipantLayoutComponent, page.path]).toEqual([address, true, ':slug']);
    }
  });

  it('/terms, /privacy and /contact, /about and /support: the family’s pages, each its own path in the legal frame - no guard on the way', async () => {
    const harness = await RouterTestingHarness.create();
    for (const [address, title] of [
      ['/terms', 'title.terms'],
      ['/privacy', 'title.privacy'],
      ['/contact', 'title.contact'],
      ['/about', 'anotoki.about.title'],
      ['/support', 'anotoki.support.title'],
    ]) {
      await harness.navigateByUrl(address);
      const [frame, page] = taken();
      expect([frame.path, frame.component, frame.canActivate, frame.canActivateChild, frame.canMatch]).toEqual([address.slice(1), undefined, undefined, undefined, undefined]);
      expect(typeof frame.loadComponent).toBe('function');
      expect([page.path, page.title]).toEqual(['', title]);
    }
  });

  it('/staff: a route of its own, before the survey’s /{slug} would take it - the administrators’ way in while the site is closed', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/staff');
    const [route] = taken();
    expect([route.path, route.canActivate]).toEqual(['staff', [staffGuard]]);
  });

  it('Page access governs the participant’s pages - the list and a survey’s page - and not the editor’s preview, nor the not-found page', () => {
    const participant = routes.find((route) => route.component === ParticipantLayoutComponent)!;
    const guarded = participant.children!.filter((route) => route.canMatch?.includes(pageAccessGuard)).map((route) => route.path);
    expect(guarded).toEqual(['', ':slug']);
  });
});

/**
 * The participant's pages with the guard that matters here - Page access's, a canMatch (the site settings,
 * anotoki-lib 0.11.0) - and a stand-in for each page: a page a row keeps from the reader is as if it were not written.
 */
describe('Page access on the participant’s pages (pageAccessGuard)', () => {
  const hidden = new Set<string>();

  beforeEach(() => {
    hidden.clear();
    const participant = routes.find((route) => route.component === ParticipantLayoutComponent)!;
    const pages: Routes = participant.children!.map((route) => ({ path: route.path, canMatch: route.canMatch, component: PageStandInComponent, data: { route } }));
    TestBed.configureTestingModule({
      providers: [
        provideRouter([{ path: '', component: FrameStandInComponent, children: pages, data: { route: participant } }]),
        // What the site settings say of each page: the library's own rule decides (mayNavigate - the ADMIN never refused), stood in here.
        { provide: SiteSettings, useValue: { mayNavigate: (path: string) => !hidden.has(path) } },
      ],
    });
  });

  it('a survey kept from the reader falls through to the not-found page, at the address typed - never a redirect that says it is there', async () => {
    const harness = await RouterTestingHarness.create('/genshin-6-1');
    expect(taken()[1].path).toBe(':slug');
    hidden.add('/genshin-6-1');
    await harness.navigateByUrl('/elsewhere');
    await harness.navigateByUrl('/genshin-6-1');
    expect(taken()[1].path).toBe('**');
    expect(TestBed.inject(Router).url).toBe('/genshin-6-1');
  });

  it('so does the list of open surveys, and the rest stays as it is', async () => {
    hidden.add('/');
    const harness = await RouterTestingHarness.create('/');
    expect(taken()[1].path).toBe('**');
    await harness.navigateByUrl('/another');
    expect(taken()[1].path).toBe(':slug');
  });
});

/** /staff: stays where it is while the site cannot run - the family's page stands there, the closed sign with its Sign in - and goes on to the admin panel otherwise. */
describe('staffGuard: the administrators’ way in while the site is closed', () => {
  const blocked = { value: false };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: SiteStatus, useValue: { blocked: () => blocked.value } }] });
  });

  const guarded = () => TestBed.runInInjectionContext(() => staffGuard({} as never, {} as never));

  it('lets the address stay while the site cannot run: closed for maintenance, an update waiting, not set up', () => {
    blocked.value = true;
    expect(guarded()).toBe(true);
  });

  it('is the admin panel’s door while the site runs - for its ADMIN while it is closed too, who sees it as it is', () => {
    blocked.value = false;
    expect(TestBed.inject(Router).serializeUrl(guarded() as never)).toBe('/admin');
  });
});
