import { Injectable, Injector, inject } from '@angular/core';
import { TranslationService } from '@anotoki/lib/translations';
import type { LocalizationDrafts } from '@anotoki/lib/translations/admin';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { AdminStore } from '../admin/admin-store.service';
import { AuthService } from './auth.service';

/**
 * The site's one Sign out: the public site's top bar takes it, and so does the admin panel's frame
 * (<anotoki-admin-frame>) - whichever button is pressed, the same question and the same way out.
 */
@Injectable({ providedIn: 'root' })
export class SignOut {
  private readonly _auth = inject(AuthService);
  private readonly _i18n = inject(TranslationService);
  private readonly _store = inject(AdminStore);
  private readonly _confirm = inject(ConfirmService);
  private readonly _injector = inject(Injector);

  /**
   * Signs out everywhere (the IAM ends its session) - after the changes still
   * waiting are saved. What would be lost is said first, in one question:
   * changes to a survey that cannot be saved (refused, or in conflict) -
   * signed out, they could not be saved any more - and what is typed on the
   * admin area's Translations and Languages pages and not saved, which only
   * its Save buttons save. A session that ends by itself keeps those drafts
   * for the person's return; a sign-out asked for here, and answered "sign
   * out anyway", gives them up - the next person at this browser starts clean.
   *
   * `beforeAsking` runs just before the question, when there is one: the top
   * bar closes its menu then, so that the question is not drawn under it. A
   * promise, so the button that asked waits ("Saving…") while the changes are
   * saved.
   */
  async afterSaves(beforeAsking?: () => void): Promise<void> {
    const surveysSaved = await this._store.flushAll();
    const drafts = await this._localizationDrafts();
    const draftsWaiting = (drafts?.count() ?? 0) > 0;
    if (!surveysSaved || draftsWaiting) {
      beforeAsking?.();
      // Finished sentences when asked, in the language on the page; a question is not worded again.
      // Each message is a whole sentence (or two): with both to say, one after the other.
      const messages = [...(surveysSaved ? [] : [this._i18n.t('topbar.signOutUnsaved.message')]), ...(draftsWaiting ? [this._i18n.t('topbar.signOutUnsaved.strings')] : [])];
      const sure = await this._confirm.ask({
        title: this._i18n.t('topbar.signOutUnsaved.title'),
        message: messages.join(' '),
        confirmLabel: this._i18n.t('topbar.signOutUnsaved.confirm'),
        cancelLabel: this._i18n.t('topbar.signOutUnsaved.stay'),
        tone: 'danger',
      });
      if (!sure) {
        return;
      }
      drafts?.clear();
    }
    this._auth.signOut();
  }

  /**
   * What is typed on the admin panel's Translations and Languages pages and not
   * saved: the anotoki library's drafts (LocalizationDrafts, kept in this tab
   * as `anotoki-survey:localization-drafts`). They come with the pages'
   * entry point (@anotoki/lib/translations/admin), which the first load never
   * carries - so they are asked for here, and only of somebody who may have
   * typed some (EDITOR, ADMIN): in memory already when those pages were open in
   * this page load, read from the tab otherwise. When the entry point cannot be
   * had (offline), nothing is asked: the drafts stay in the tab, as a session
   * that ends keeps them, and the sign-out goes on.
   */
  private async _localizationDrafts(): Promise<LocalizationDrafts | null> {
    if (!this._auth.isStaff()) {
      return null;
    }
    try {
      const pages = await import('@anotoki/lib/translations/admin');
      return this._injector.get(pages.LocalizationDrafts);
    } catch {
      return null;
    }
  }
}
