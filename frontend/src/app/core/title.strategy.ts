import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';

/**
 * "Results · anotoki survey": a page's own title first, where a tab shows the
 * start of it. The survey pages set their own - the survey's name - through
 * Title once they know it.
 */
@Injectable()
export class SurveyTitleStrategy extends TitleStrategy {
  private readonly _title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const title = this.buildTitle(snapshot);
    this._title.setTitle(title ? `${title} · anotoki survey` : 'anotoki survey');
  }
}
