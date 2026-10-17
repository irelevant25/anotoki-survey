import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Route, Router, RouterOutlet, Routes, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { personOrVisitorGuard } from '@anotoki/lib/auth';
import { routes } from './app.routes';
import { ParticipantLayoutComponent } from './layouts/participant-layout/participant-layout.component';

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
    for (const address of ['/genshin-6-1', '/terms-of-the-event', '/privacy2']) {
      await harness.navigateByUrl(address);
      const [frame, page] = taken();
      expect([address, frame.component === ParticipantLayoutComponent, page.path]).toEqual([address, true, ':slug']);
    }
  });

  it('/terms, /privacy and /contact: the legal pages, each its own path in the legal frame - no guard on the way', async () => {
    const harness = await RouterTestingHarness.create();
    for (const [address, title] of [
      ['/terms', 'title.terms'],
      ['/privacy', 'title.privacy'],
      ['/contact', 'title.contact'],
    ]) {
      await harness.navigateByUrl(address);
      const [frame, page] = taken();
      expect([frame.path, frame.component, frame.canActivate, frame.canActivateChild, frame.canMatch]).toEqual([address.slice(1), undefined, undefined, undefined, undefined]);
      expect(typeof frame.loadComponent).toBe('function');
      expect([page.path, page.title]).toEqual(['', title]);
    }
  });
});
