import { Injectable, effect, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { TranslationService } from './i18n/translation.service';

/**
 * "Results · anotoki survey": a page's own title first, where a tab shows the
 * start of it.
 *
 * A route's `title` is a translation key on the pages people take surveys on,
 * and plain English in the admin area; either works here. The title follows
 * the language: switching it renames the tab without a navigation.
 *
 * A route without a title - a survey, its preview - writes its own through
 * Title once it knows the survey's name, so for such a route nothing is
 * written here after the very first time (a change of language must not put
 * the site's name over the survey's).
 *
 * It also tells the translation service where the page is - the admin area is
 * English - because that service cannot ask the Router itself (the Router
 * builds this strategy, and this strategy needs that service).
 */
@Injectable()
export class SurveyTitleStrategy extends TitleStrategy {
  private readonly _title = inject(Title);
  private readonly _i18n = inject(TranslationService);

  /** The current route's title as the route wrote it: a key, or English. Undefined: the route has none. */
  private readonly _page = signal<string | undefined>(undefined);
  private _written = false;

  constructor() {
    super();
    effect(() => {
      const page = this._page();
      // With no strings at all (the site is not set up, or out of reach) the name is said in English, as the boot pages do.
      const worded = this._i18n.ready();
      const site = worded ? this._i18n.t('brand.site') : 'anotoki survey';
      if (page === undefined) {
        if (!this._written) {
          this._written = true;
          this._title.setTitle(site);
        }
        return;
      }
      this._written = true;
      if (!worded && !this._i18n.inAdmin()) {
        // A participant route's title is a key, and there is nothing to word it
        // with: the site's name alone, never the key (a tab reading
        // "title.surveys" on a site that is not set up yet). The admin area's
        // titles are English as written, and stay.
        this._title.setTitle(site);
        return;
      }
      // With strings, a key that has none shows as itself: the owner wants to see which.
      this._title.setTitle(`${this._i18n.has(page) ? this._i18n.t(page) : page} · ${site}`);
    });
  }

  /**
   * After every navigation. Saying where the page is also lets the service ask
   * for its strings again when it has none from the server (noteAddress()).
   */
  override updateTitle(snapshot: RouterStateSnapshot): void {
    this._i18n.noteAddress(snapshot.url);
    this._page.set(this.buildTitle(snapshot));
  }
}
