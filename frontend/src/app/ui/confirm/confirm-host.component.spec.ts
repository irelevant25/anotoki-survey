import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '../../core/i18n/translation.service';
import { provideTestTranslations } from '../../core/testing/test-translations';
import { ConfirmHostComponent } from './confirm-host.component';
import { ConfirmService } from './confirm.service';

const ENGLISH = { 'common.cancel': 'Cancel', 'common.confirm': 'Confirm', 'common.close': 'Close' };
const SLOVAK = { 'common.cancel': 'Zrušiť', 'common.confirm': 'Potvrdiť', 'common.close': 'Zavrieť' };

describe('ConfirmHostComponent: its own words', () => {
  let fixture: ComponentFixture<ConfirmHostComponent>;
  let host: HTMLElement;

  const footer = () => Array.from(host.querySelectorAll('[dialogFooter] button')).map((button) => button.textContent?.trim());
  const close = () => host.querySelector('button.close')?.getAttribute('aria-label');

  beforeAll(() => {
    // jsdom has the element and not its modal: enough of one for a dialog that opens itself.
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
      this.open = true;
    };
    HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
      this.open = false;
    };
  });

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    fixture = TestBed.createComponent(ConfirmHostComponent);
    host = fixture.nativeElement;
    await fixture.whenStable();
  });

  it('words the two answers nobody gave, and the dialog’s close button, in the language on the page', async () => {
    void TestBed.inject(ConfirmService).ask({ title: 'Naozaj?' });
    await fixture.whenStable();
    expect(host.querySelector('h2')?.textContent?.trim()).toBe('Naozaj?');
    expect(footer()).toEqual(['Zrušiť', 'Potvrdiť']);
    expect(close()).toBe('Zavrieť');
  });

  it('leaves the answers somebody gave as they are', async () => {
    void TestBed.inject(ConfirmService).ask({ title: 'Odhlásiť sa?', confirmLabel: 'Aj tak sa odhlásiť', cancelLabel: 'Zostať' });
    await fixture.whenStable();
    expect(footer()).toEqual(['Zostať', 'Aj tak sa odhlásiť']);
  });

  it('is English in the admin area', async () => {
    TestBed.inject(TranslationService).noteAddress('/admin/surveys');
    void TestBed.inject(ConfirmService).ask({ title: 'Delete this survey?' });
    await fixture.whenStable();
    expect(footer()).toEqual(['Cancel', 'Confirm']);
    expect(close()).toBe('Close');
  });
});
