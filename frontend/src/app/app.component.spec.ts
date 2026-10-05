import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthService, BootStatus } from './core/auth/auth.service';
import { BOOTED } from './core/boot';
import { provideTestTranslations } from './core/testing/test-translations';

@Component({ selector: 'app-test-page', template: '' })
class TestPageComponent {}

describe('AppComponent: what is drawn while the site starts', () => {
  const status = signal<BootStatus>('loading');
  const signedIn = signal(false);
  const signInFailure = signal<{ code: string; message: string } | null>(null);
  const needsUpdate = signal(false);
  const onlyMigrations = signal(false);
  const auth = {
    status,
    user: signal(null),
    signedIn,
    signInFailure,
    needsUpdate,
    onlyMigrations,
    notSetUpDetail: signal<string | null>(null),
    onAuthChange: () => () => undefined,
    init: async () => undefined,
  };
  let fixture: ComponentFixture<AppComponent>;
  let host: HTMLElement;

  const site = () => host.querySelector('router-outlet');
  const loadError = () => host.querySelector('app-load-error');
  const notSetUp = () => host.querySelector('app-not-set-up');

  async function start(at: BootStatus, booted: boolean): Promise<void> {
    status.set(at);
    TestBed.inject(BOOTED).set(booted);
    fixture = TestBed.createComponent(AppComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  }

  async function now(at: BootStatus, booted: boolean): Promise<void> {
    status.set(at);
    TestBed.inject(BOOTED).set(booted);
    await fixture.whenStable();
  }

  beforeEach(() => {
    signedIn.set(false);
    signInFailure.set(null);
    needsUpdate.set(false);
    onlyMigrations.set(false);
    TestBed.configureTestingModule({
      // No strings at all: what is drawn instead of the site words itself.
      providers: [
        provideTestTranslations({}),
        provideRouter([
          { path: '', component: TestPageComponent },
          { path: 'admin/migrations', component: TestPageComponent },
          { path: 'admin', component: TestPageComponent },
        ]),
        { provide: AuthService, useValue: auth },
      ],
    });
  });

  async function at(url: string): Promise<void> {
    await TestBed.inject(Router).navigateByUrl(url);
    await fixture.whenStable();
  }

  describe('while the database waits for a migration (the sign-in said update: true)', () => {
    beforeEach(() => needsUpdate.set(true));

    it('draws "not set up yet" for somebody signed in, wherever they are - the Migrations page included, unless they are an ADMIN', async () => {
      signedIn.set(true);
      await start('ready', true);
      await at('/');
      expect(notSetUp()).not.toBeNull();
      expect(site()).toBeNull();
      await at('/admin/migrations');
      expect(notSetUp()).not.toBeNull();
      expect(site()).toBeNull();
    });

    it('draws the site for an ADMIN on the Migrations page alone - and runs where it stands once the update is applied', async () => {
      signedIn.set(true);
      onlyMigrations.set(true);
      await start('ready', true);
      await at('/');
      expect(notSetUp()).not.toBeNull();
      await at('/admin');
      expect(notSetUp()).not.toBeNull();
      expect(site()).toBeNull();
      await at('/admin/migrations?from=card');
      expect(site()).not.toBeNull();
      expect(notSetUp()).toBeNull();
      await at('/');
      expect(notSetUp()).not.toBeNull();

      await at('/admin/migrations');
      const outlet = site();
      // Applied (AuthService.databaseUpdated()): the same page stays, and every other page opens again.
      needsUpdate.set(false);
      onlyMigrations.set(false);
      await fixture.whenStable();
      expect(site()).toBe(outlet);
      await at('/');
      expect(site()).not.toBeNull();
      expect(notSetUp()).toBeNull();
    });

    it('draws nothing new for somebody not signed in - the sign-in guard is taking them to the IAM - but the card after a sign-in that came back without one', async () => {
      await start('ready', true);
      await at('/');
      expect(site()).toBeNull();
      expect(notSetUp()).toBeNull();

      signInFailure.set({ code: 'access_denied', message: 'refused' });
      await fixture.whenStable();
      expect(notSetUp()).not.toBeNull();
    });
  });

  it('draws the site once the sign-in is ready and the start has run to its end', async () => {
    await start('ready', true);
    expect(site()).not.toBeNull();
    expect(loadError()).toBeNull();
    expect(notSetUp()).toBeNull();
  });

  it('does not draw the site while the strings are still on their way - it would show keys', async () => {
    await start('ready', false);
    expect(site()).toBeNull();
    // What is drawn over any page is there all the same: the live region must be in the page before its first message.
    expect(host.querySelector('app-toast-host [role="status"]')).not.toBeNull();

    await now('ready', true);
    expect(site()).not.toBeNull();
  });

  it('draws the card saying why instead of the site: not set up, or out of reach', async () => {
    await start('not-set-up', true);
    expect(notSetUp()).not.toBeNull();
    expect(site()).toBeNull();

    await now('error', true);
    expect(loadError()).not.toBeNull();
    expect(notSetUp()).toBeNull();
    expect(site()).toBeNull();
  });

  it('keeps the load error card while "Try again" starts the site again, and only then draws the site', async () => {
    await start('error', true);
    const card = loadError();
    expect(card).not.toBeNull();

    // boot() again: not booted, the sign-in loading...
    await now('loading', false);
    expect(loadError()).toBe(card);
    expect(site()).toBeNull();
    // ...the sign-in ready before the strings are there...
    await now('ready', false);
    expect(loadError()).toBe(card);
    expect(site()).toBeNull();
    // ...and the end of the start.
    await now('ready', true);
    expect(loadError()).toBeNull();
    expect(site()).not.toBeNull();
  });

  it('keeps the card when trying again fails again', async () => {
    await start('error', true);
    const card = loadError();
    await now('loading', false);
    await now('error', true);
    expect(loadError()).toBe(card);
    expect(site()).toBeNull();
  });
});
