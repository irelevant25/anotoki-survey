import { TestBed } from '@angular/core/testing';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { ToastHostComponent } from './toast-host.component';
import { ToastService } from './toast.service';

describe('ToastHostComponent: its own words', () => {
  const region = (host: HTMLElement) => host.querySelector('[role="status"]');

  afterEach(() => vi.restoreAllMocks());

  it('names the region and the button that takes a toast away in the language on the page', async () => {
    TestBed.configureTestingModule({
      providers: [provideTestTranslations({ 'toast.region': 'Oznámenia', 'toast.dismiss': 'Zavrieť' }, { language: 'sk', english: { 'toast.region': 'Notifications', 'toast.dismiss': 'Dismiss' } })],
    });
    const fixture = TestBed.createComponent(ToastHostComponent);
    const host: HTMLElement = fixture.nativeElement;
    await fixture.whenStable();
    expect(region(host)?.getAttribute('aria-label')).toBe('Oznámenia');

    // A toast is a finished sentence: shown as it was raised.
    TestBed.inject(ToastService).show('Jazyk sa nepodarilo načítať.', 'danger', 0);
    await fixture.whenStable();
    expect(host.querySelector('.toast-message')?.textContent).toBe('Jazyk sa nepodarilo načítať.');
    expect(host.querySelector('.toast-close')?.getAttribute('aria-label')).toBe('Zavrieť');
  });

  it('with no strings at all (the site cannot run) the region is named in English - not with its key, and with no complaint', async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslations({})] });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const fixture = TestBed.createComponent(ToastHostComponent);
    await fixture.whenStable();
    expect(region(fixture.nativeElement)?.getAttribute('aria-label')).toBe('Notifications');
    expect(warn).not.toHaveBeenCalled();
  });
});
