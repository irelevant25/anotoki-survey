import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminStore } from '../../../../core/admin/admin-store.service';
import { LOCALIZATION_DRAFTS_KEY, LocalizationDrafts } from '../../../../core/admin/localization-drafts.service';
import { ApiError, ApiService } from '../../../../core/api/api.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { AdminLanguage } from '../../../../core/i18n/translation.model';
import { TranslationService } from '../../../../core/i18n/translation.service';
import { Person } from '../../../../core/survey/survey.model';
import { ConfirmService } from '../../../../ui/confirm/confirm.service';
import { ToastService } from '../../../../ui/toast/toast.service';
import { LanguagesComponent } from './languages.component';

const ENGLISH: AdminLanguage = { code: 'en', name: 'English', nativeName: 'English', enabled: true, sortOrder: 1, seeded: true };
const SLOVAK: AdminLanguage = { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', enabled: true, sortOrder: 2, seeded: true };
const CZECH: AdminLanguage = { code: 'cs', name: 'Czech', nativeName: 'Čeština', enabled: false, sortOrder: 3, seeded: false };

const OWNER: Person = { id: '7', name: 'owner', email: 'owner@example.test' };

/** A promise the test settles by hand: the server's answer, when the test says. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('LanguagesComponent', () => {
  let fixture: ComponentFixture<LanguagesComponent>;
  let host: HTMLElement;
  let api: {
    languages: ReturnType<typeof vi.fn>;
    createLanguage: ReturnType<typeof vi.fn>;
    updateLanguage: ReturnType<typeof vi.fn>;
    deleteLanguage: ReturnType<typeof vi.fn>;
  };
  let refreshed: ReturnType<typeof vi.fn>;
  let reloaded: ReturnType<typeof vi.fn>;
  const isAdmin = signal(true);

  const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();
  const all = (selector: string, within: ParentNode = host) => Array.from(within.querySelectorAll(selector)).map((element) => clean(element.textContent));
  /** The pieces of each row's head - its children - with a space between, as the eye sees them. */
  const heads = () => Array.from(host.querySelectorAll('.head')).map((element) => all(':scope > *', element).join(' '));
  const rows = () => Array.from(host.querySelectorAll<HTMLElement>('.language'));
  const row = (code: string) => rows().find((candidate) => clean(candidate.querySelector('app-badge')?.textContent) === code)!;
  const fields = (within: ParentNode) => Array.from(within.querySelectorAll<HTMLInputElement>('input.field-input'));
  const toggle = (code: string) => row(code).querySelector<HTMLInputElement>('input[role="switch"]')!;
  const button = (label: string, within: ParentNode = host) => Array.from(within.querySelectorAll<HTMLButtonElement>('button')).find((candidate) => clean(candidate.textContent) === label);
  const error = (within: ParentNode) => clean(within.querySelector('.field-error')?.textContent);
  const toasts = () =>
    TestBed.inject(ToastService)
      .toasts()
      .map((toast) => toast.message);

  /** Lets the promises of a click run out, then the page draw. */
  async function settle(): Promise<void> {
    await new Promise((done) => setTimeout(done));
    await fixture.whenStable();
  }

  async function type(element: HTMLInputElement, value: string): Promise<void> {
    element.value = value;
    element.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  }

  async function flip(code: string): Promise<void> {
    toggle(code).click();
    await settle();
  }

  async function answer(yes: boolean): Promise<string> {
    const confirm = TestBed.inject(ConfirmService);
    const title = confirm.pending()?.title ?? '';
    confirm.settle(yes);
    await settle();
    return title;
  }

  async function page(answerWith: AdminLanguage[] | ApiError = [ENGLISH, SLOVAK, CZECH]): Promise<void> {
    api = {
      languages: answerWith instanceof ApiError ? vi.fn().mockRejectedValue(answerWith) : vi.fn().mockResolvedValue(answerWith),
      createLanguage: vi.fn(),
      updateLanguage: vi.fn(),
      deleteLanguage: vi.fn(),
    };
    refreshed = vi.fn().mockResolvedValue(undefined);
    reloaded = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { isAdmin, person: signal<Person | null>(OWNER), onAuthChange: () => () => undefined } },
        { provide: AdminStore, useValue: { loadLanguages: reloaded } },
        { provide: TranslationService, useValue: { reload: refreshed } },
      ],
    });
    await draw();
  }

  /** The page drawn - the first time, or again after it was taken away. */
  async function draw(): Promise<void> {
    fixture = TestBed.createComponent(LanguagesComponent);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }

  beforeEach(() => {
    isAdmin.set(true);
    sessionStorage.clear();
  });

  afterEach(() => {
    host.remove();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('lists every language - the hidden ones too - with its code, its two names and its place in the order', async () => {
    // Whatever order they come in: by their place, as the chooser shows them.
    await page([CZECH, SLOVAK, ENGLISH]);

    expect(clean(host.querySelector('h1')?.textContent)).toBe('Languages');
    expect(heads()).toEqual(['en English English Fallback', 'sk Slovak Slovenčina Released with the site', 'cs Czech Čeština']);
    expect(rows().map((language) => fields(language).map((field) => field.value))).toEqual([
      ['English', 'English', '1'],
      ['Slovak', 'Slovenčina', '2'],
      ['Czech', 'Čeština', '3'],
    ]);
    expect(all('.list .switch .label')).toEqual(['Offered', 'Offered', 'Hidden']);
    expect(row('cs').querySelector('.native')!.getAttribute('lang')).toBe('cs');
  });

  it('marks English as the fallback, and its switch cannot be flipped', async () => {
    await page();

    expect(toggle('en').checked).toBe(true);
    expect(toggle('en').disabled).toBe(true);
    expect(clean(row('en').querySelector('.switch .hint')?.textContent)).toBe('Always offered: every other language falls back to it.');
    expect(toggle('sk').disabled).toBe(false);
  });

  it('offers Delete only to an administrator, and only for a language the site is not released in', async () => {
    await page();
    expect(rows().map((language) => !!button('Delete', language))).toEqual([false, false, true]);

    isAdmin.set(false);
    await settle();
    expect(rows().map((language) => !!button('Delete', language))).toEqual([false, false, false]);
  });

  it('renames a language and moves it, sending only what changed', async () => {
    await page();
    const save = button('Save', row('cs'))!;
    expect(save.disabled).toBe(true);

    await type(fields(row('cs'))[1], 'Česky');
    await type(fields(row('cs'))[2], '0');
    expect(save.disabled).toBe(false);

    api.updateLanguage.mockResolvedValue({ ...CZECH, nativeName: 'Česky', sortOrder: 0 });
    save.click();
    await settle();

    expect(api.updateLanguage).toHaveBeenCalledWith('cs', { nativeName: 'Česky', sortOrder: 0 });
    // It comes first now.
    expect(heads()[0]).toBe('cs Czech Česky');
    expect(button('Save', row('cs'))!.disabled).toBe(true);
    expect(toasts()).toEqual(['Czech is saved.']);
    // The editor's list of languages and the chooser's are read again.
    expect(reloaded).toHaveBeenCalledWith(true);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('puts a row back as it is saved with Undo', async () => {
    await page();
    await type(fields(row('sk'))[0], 'Slovakian');
    expect(button('Save', row('sk'))!.disabled).toBe(false);

    button('Undo', row('sk'))!.click();
    await settle();

    expect(fields(row('sk'))[0].value).toBe('Slovak');
    expect(button('Save', row('sk'))!.disabled).toBe(true);
    expect(button('Undo', row('sk'))).toBeUndefined();
    expect(api.updateLanguage).not.toHaveBeenCalled();
  });

  it('does not send an order that is not a whole number from 0 to 1000', async () => {
    await page();
    await type(fields(row('sk'))[2], '1001');
    button('Save', row('sk'))!.click();
    await settle();

    expect(api.updateLanguage).not.toHaveBeenCalled();
    expect(error(row('sk'))).toBe('The order is a whole number from 0 to 1000.');
  });

  it("shows the server's sentence in the row when it refuses a change, and keeps what was typed", async () => {
    await page();
    await type(fields(row('sk'))[0], 'Slovakian');
    api.updateLanguage.mockRejectedValue(new ApiError(422, 'invalid_language', 'The name in English must be 1 to 50 characters long.'));
    button('Save', row('sk'))!.click();
    await settle();

    expect(error(row('sk'))).toBe('The name in English must be 1 to 50 characters long.');
    expect(fields(row('sk'))[0].value).toBe('Slovakian');
    expect(reloaded).not.toHaveBeenCalled();
    expect(refreshed).not.toHaveBeenCalled();
  });

  it('keeps what is typed in a row while it is being saved: a change to what the answer saved', async () => {
    await page();
    await type(fields(row('cs'))[0], 'Czech language');
    const saving = later<AdminLanguage>();
    api.updateLanguage.mockReturnValue(saving.promise);
    button('Save', row('cs'))!.click();
    await settle();
    expect(api.updateLanguage).toHaveBeenCalledWith('cs', { name: 'Czech language' });
    // One row at a time goes to the server.
    await type(fields(row('sk'))[0], 'Slovakian');
    expect(button('Save', row('sk'))!.disabled).toBe(true);

    // Before the answer: the other name, in the same row.
    await type(fields(row('cs'))[1], 'Česky');
    saving.resolve({ ...CZECH, name: 'Czech language' });
    await settle();

    expect(heads()[2]).toBe('cs Czech language Čeština');
    expect(fields(row('cs')).map((field) => field.value)).toEqual(['Czech language', 'Česky', '3']);
    expect(button('Save', row('cs'))!.disabled).toBe(false);
    expect(button('Undo', row('cs'))).toBeDefined();
    expect(button('Save', row('sk'))!.disabled).toBe(false);

    // And that is what the next Save sends - nothing of what is saved already.
    api.updateLanguage.mockResolvedValue({ ...CZECH, name: 'Czech language', nativeName: 'Česky' });
    button('Save', row('cs'))!.click();
    await settle();
    expect(api.updateLanguage).toHaveBeenLastCalledWith('cs', { nativeName: 'Česky' });
    expect(button('Save', row('cs'))!.disabled).toBe(true);
  });

  it('keeps even the old name typed back while the row is being saved - and lets it go when the save fails', async () => {
    await page();
    await type(fields(row('cs'))[0], 'Czech language');
    const saving = later<AdminLanguage>();
    api.updateLanguage.mockReturnValue(saving.promise);
    button('Save', row('cs'))!.click();
    await settle();

    await type(fields(row('cs'))[0], 'Czech');
    saving.resolve({ ...CZECH, name: 'Czech language' });
    await settle();

    // Saved as "Czech language"; the field says "Czech", which is a change again.
    expect(heads()[2]).toBe('cs Czech language Čeština');
    expect(fields(row('cs'))[0].value).toBe('Czech');
    expect(button('Save', row('cs'))!.disabled).toBe(false);

    // The same once more, and the save fails: the field says what is saved, so nothing is left to save.
    const failing = later<AdminLanguage>();
    api.updateLanguage.mockReturnValue(failing.promise);
    button('Save', row('cs'))!.click();
    await settle();
    await type(fields(row('cs'))[0], 'Czech language');
    failing.reject(new ApiError(0, 'offline', 'The site could not be reached. Check the connection and try again.'));
    await settle();

    expect(error(row('cs'))).toBe('The site could not be reached. Check the connection and try again.');
    expect(fields(row('cs'))[0].value).toBe('Czech language');
    expect(button('Save', row('cs'))!.disabled).toBe(true);
  });

  it('hides and offers a language the moment its switch is flipped', async () => {
    await page();
    api.updateLanguage.mockResolvedValue({ ...SLOVAK, enabled: false });
    await flip('sk');

    expect(api.updateLanguage).toHaveBeenCalledWith('sk', { enabled: false });
    expect(toggle('sk').checked).toBe(false);
    expect(clean(row('sk').querySelector('.switch .label')?.textContent)).toBe('Hidden');
    expect(row('sk').classList.contains('is-hidden')).toBe(true);
    expect(toasts()).toEqual(['Slovak is hidden: nobody is offered it.']);

    api.updateLanguage.mockResolvedValue({ ...CZECH, enabled: true });
    await flip('cs');
    expect(api.updateLanguage).toHaveBeenLastCalledWith('cs', { enabled: true });
    expect(clean(row('cs').querySelector('.switch .label')?.textContent)).toBe('Offered');
    expect(refreshed).toHaveBeenCalledTimes(2);
  });

  it('puts the switch back, and says why, when the server refuses', async () => {
    await page();
    // As a request answers: later, with the page drawn meanwhile - hidden, and saving.
    const refusal = new ApiError(409, 'fallback_language', 'English cannot be switched off: every other language falls back to it.');
    api.updateLanguage.mockImplementation(() => new Promise((_, reject) => setTimeout(() => reject(refusal), 20)));
    await flip('sk');
    expect(toggle('sk').checked).toBe(false);
    expect(toggle('sk').getAttribute('aria-busy')).toBe('true');
    // Nothing else can be flipped while it is on its way.
    expect(toggle('cs').disabled).toBe(true);

    await new Promise((done) => setTimeout(done, 30));
    await settle();

    expect(toggle('sk').checked).toBe(true);
    expect(clean(row('sk').querySelector('.switch .label')?.textContent)).toBe('Offered');
    expect(error(row('sk'))).toBe('English cannot be switched off: every other language falls back to it.');
  });

  it('deletes a language after asking', async () => {
    await page();
    api.deleteLanguage.mockResolvedValue(undefined);
    button('Delete', row('cs'))!.click();
    await settle();
    expect(api.deleteLanguage).not.toHaveBeenCalled();
    expect(await answer(true)).toBe('Delete Czech (cs)?');

    expect(api.deleteLanguage).toHaveBeenCalledWith('cs');
    expect(heads()).toHaveLength(2);
    expect(toasts()).toEqual(['Czech is deleted.']);
    expect(reloaded).toHaveBeenCalledWith(true);
    expect(refreshed).toHaveBeenCalledTimes(1);
  });

  it('keeps the language when the answer is no', async () => {
    await page();
    button('Delete', row('cs'))!.click();
    await settle();
    await answer(false);

    expect(api.deleteLanguage).not.toHaveBeenCalled();
    expect(heads()).toHaveLength(3);
  });

  it("shows the server's sentence when a language in use cannot be deleted", async () => {
    await page();
    const sentence = '2 surveys are written in this language or translated into it. Switch it off instead, or remove it from the surveys first.';
    api.deleteLanguage.mockRejectedValue(new ApiError(409, 'language_in_use', sentence, { surveys: 2 }));
    button('Delete', row('cs'))!.click();
    await settle();
    await answer(true);

    expect(error(row('cs'))).toBe(sentence);
    expect(heads()).toHaveLength(3);
    expect(refreshed).not.toHaveBeenCalled();
  });

  describe('adding a language', () => {
    const form = () => host.querySelector<HTMLFormElement>('form.add')!;
    const add = () => button('Add the language', form())!;

    const offer = () => form().querySelector<HTMLInputElement>('input[role="switch"]')!;

    it('adds it hidden unless told otherwise - to the list, in its place - and empties the form', async () => {
      await page([ENGLISH, SLOVAK]);
      expect(add().disabled).toBe(true);
      // Whether readers are offered it at once: a switch, off, with the reason beside it.
      expect(clean(form().querySelector('.switch .label')?.textContent)).toBe('Offer it to readers right away');
      expect(clean(form().querySelector('.switch .hint')?.textContent)).toBe('A new language starts hidden - write its strings, then offer it.');
      expect(offer().checked).toBe(false);

      const [code, name, nativeName] = fields(form());
      await type(code, ' DE ');
      await type(name, 'German');
      await type(nativeName, 'Deutsch');
      expect(add().disabled).toBe(false);

      api.createLanguage.mockResolvedValue({ code: 'de', name: 'German', nativeName: 'Deutsch', enabled: false, sortOrder: 3, seeded: false });
      form().dispatchEvent(new Event('submit', { cancelable: true }));
      await settle();

      // `enabled` goes with it, said outright - not left to what the server takes for granted.
      expect(api.createLanguage).toHaveBeenCalledWith({ code: 'de', name: 'German', nativeName: 'Deutsch', enabled: false });
      expect(heads()).toEqual(['en English English Fallback', 'sk Slovak Slovenčina Released with the site', 'de German Deutsch']);
      // The new row says it is hidden.
      expect(clean(row('de').querySelector('.switch .label')?.textContent)).toBe('Hidden');
      expect(toggle('de').checked).toBe(false);
      expect(row('de').classList.contains('is-hidden')).toBe(true);
      expect(fields(form()).map((field) => field.value)).toEqual(['', '', '']);
      expect(toasts()).toEqual(['German is added, hidden. Write its strings, then offer it.']);
      expect(reloaded).toHaveBeenCalledWith(true);
      expect(refreshed).toHaveBeenCalledTimes(1);
    });

    it('offers it at once when the switch says so - and the switch is off again for the next one', async () => {
      await page([ENGLISH, SLOVAK]);
      const [code, name, nativeName] = fields(form());
      await type(code, 'de');
      await type(name, 'German');
      await type(nativeName, 'Deutsch');
      offer().click();
      await settle();
      expect(offer().checked).toBe(true);

      api.createLanguage.mockResolvedValue({ code: 'de', name: 'German', nativeName: 'Deutsch', enabled: true, sortOrder: 3, seeded: false });
      add().click();
      await settle();

      expect(api.createLanguage).toHaveBeenCalledWith({ code: 'de', name: 'German', nativeName: 'Deutsch', enabled: true });
      expect(clean(row('de').querySelector('.switch .label')?.textContent)).toBe('Offered');
      expect(row('de').classList.contains('is-hidden')).toBe(false);
      expect(toasts()).toEqual(['German is added, and offered to everybody. It reads in English until its strings are written.']);
      expect(offer().checked).toBe(false);
    });

    it('keeps the switch as it was set when the server refuses, for the next try', async () => {
      await page();
      const [code, name, nativeName] = fields(form());
      await type(code, 'sk');
      await type(name, 'Slovak');
      await type(nativeName, 'Slovensky');
      offer().click();
      await settle();
      api.createLanguage.mockRejectedValue(new ApiError(409, 'language_exists', 'There is a language "sk" already.'));
      add().click();
      await settle();

      expect(offer().checked).toBe(true);
    });

    it('says what a code is while one that is none is typed, and does not send it', async () => {
      await page();
      const [code, name, nativeName] = fields(form());
      await type(code, 'german');
      await type(name, 'German');
      await type(nativeName, 'Deutsch');

      expect(error(form())).toBe('A language\'s code is two small letters, or two and two with a dash between: "sk", "pt-br".');
      expect(add().disabled).toBe(true);
    });

    it("shows the server's sentence when the language is there already", async () => {
      await page();
      const [code, name, nativeName] = fields(form());
      await type(code, 'sk');
      await type(name, 'Slovak');
      await type(nativeName, 'Slovensky');
      api.createLanguage.mockRejectedValue(new ApiError(409, 'language_exists', 'There is a language "sk" already.'));
      add().click();
      await settle();

      expect(clean(host.querySelector('.add-error')?.textContent)).toBe('There is a language "sk" already.');
      expect(fields(form())[0].value).toBe('sk');
      expect(heads()).toHaveLength(3);
    });
  });

  it('asks before it is left with a row changed and not saved - and "Leave" gives the changes up', async () => {
    await page();
    const component = fixture.componentInstance;
    expect(component.canLeave()).toBe(true);

    await type(fields(row('sk'))[0], 'Slovakian');
    const stay = component.canLeave() as Promise<boolean>;
    await settle();
    expect(TestBed.inject(ConfirmService).pending()?.message).toBe('1 language has changes that are not saved yet, and leaving loses them.');
    expect(await answer(false)).toBe('Leave without saving?');
    expect(await stay).toBe(false);
    // Staying keeps what was typed.
    expect(fields(row('sk'))[0].value).toBe('Slovakian');

    const leave = component.canLeave() as Promise<boolean>;
    await settle();
    await answer(true);
    expect(await leave).toBe(true);
    // Given up, as the question said: not in the row the next time, and not kept for the tab.
    expect(TestBed.inject(LocalizationDrafts).languages()).toEqual({});
    expect(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)).toBeNull();
    expect(component.canLeave()).toBe(true);
  });

  describe('what is typed in a row and not saved', () => {
    const drafts = () => TestBed.inject(LocalizationDrafts);

    it('is in its fields again when the page comes back - taken away with no question, as when the session ends', async () => {
      await page();
      await type(fields(row('sk'))[0], 'Slovakian');
      await type(fields(row('cs'))[2], '0');

      // The admin area stops drawing its page: no navigation, no guard, no question.
      fixture.destroy();
      host.remove();
      expect(drafts().count()).toBe(2);

      await draw();
      expect(api.languages).toHaveBeenCalledTimes(2);
      expect(fields(row('sk')).map((field) => field.value)).toEqual(['Slovakian', 'Slovenčina', '2']);
      expect(fields(row('cs')).map((field) => field.value)).toEqual(['Czech', 'Čeština', '0']);
      expect(button('Save', row('sk'))!.disabled).toBe(false);
      expect(button('Undo', row('cs'))).toBeDefined();
      expect(button('Save', row('en'))!.disabled).toBe(true);
    });

    it('is kept for the tab too, for the way to the sign-in and back', async () => {
      await page();
      await type(fields(row('sk'))[0], 'Slovakian');

      expect(JSON.parse(sessionStorage.getItem(LOCALIZATION_DRAFTS_KEY)!)).toEqual({ owner: '7', strings: {}, languages: { sk: { name: 'Slovakian', nativeName: 'Slovenčina', sortOrder: '2' } } });
    });

    it('comes back only as far as it is still a change: not for a language that is gone, and not what is saved by now', async () => {
      sessionStorage.setItem(
        LOCALIZATION_DRAFTS_KEY,
        JSON.stringify({
          owner: '7',
          strings: {},
          languages: {
            sk: { name: 'Slovakian', nativeName: 'Slovenčina', sortOrder: '2' },
            // Deleted by somebody else meanwhile.
            de: { name: 'German', nativeName: 'Deutsch!', sortOrder: '4' },
            // Saved by somebody else meanwhile, the very same.
            cs: { name: 'Czech', nativeName: 'Česky', sortOrder: '3' },
          },
        }),
      );
      await page([ENGLISH, SLOVAK, { ...CZECH, nativeName: 'Česky' }]);

      expect(drafts().languages()).toEqual({ sk: { name: 'Slovakian', nativeName: 'Slovenčina', sortOrder: '2' } });
      expect(fields(row('sk'))[0].value).toBe('Slovakian');
      expect(rows().map((language) => button('Save', language)!.disabled)).toEqual([true, false, true]);
    });

    it('has the browser ask before the tab is closed or loaded again', async () => {
      await page();
      const closing = () => {
        const event = new Event('beforeunload', { cancelable: true });
        window.dispatchEvent(event);
        return event.defaultPrevented;
      };
      expect(closing()).toBe(false);

      await type(fields(row('sk'))[0], 'Slovakian');
      expect(closing()).toBe(true);
    });
  });

  it('says so when the languages cannot be loaded, and tries again', async () => {
    await page(new ApiError(0, 'offline', 'The site could not be reached. Check the connection and try again.'));

    expect(clean(host.querySelector('app-alert')?.textContent)).toContain('The languages could not be loaded');
    expect(rows()).toHaveLength(0);

    api.languages.mockResolvedValue([ENGLISH, SLOVAK]);
    button('Try again')!.click();
    await settle();
    expect(rows()).toHaveLength(2);
  });

  it('links to the translations and back to the surveys', async () => {
    await page();

    expect(Array.from(host.querySelectorAll('app-page-header a')).map((link) => [clean(link.textContent), link.getAttribute('href')])).toEqual([
      ['All surveys', '/admin'],
      ['Translations', '/admin/translations'],
    ]);
  });
});
