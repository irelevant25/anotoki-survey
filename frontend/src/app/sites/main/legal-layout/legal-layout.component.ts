import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { SiteFooterComponent } from '@anotoki/lib/footer';
import { ANOTOKI_LEGAL_CONFIG } from '@anotoki/lib/legal';
import { AnnouncementComponent, PageNoticeComponent } from '@anotoki/lib/site-settings';
import { TranslatePipe } from '@anotoki/lib/translations';
import { Changelog } from '../../../shared/changelog/changelog.service';
import { surveyLegalPagesConfig } from '../../../shared/legal/legal-facts';
import { TopBarComponent } from '../common/top-bar/top-bar.component';

/**
 * The legal pages' frame - Terms, Privacy and Contact, the anotoki family's
 * pages (@anotoki/lib/legal/pages, lazy routes in app.routes.ts), and About
 * and Support (@anotoki/lib/legal/about, /support), the same on every anotoki
 * site: the frame the survey's own pages have (the skip link, the site
 * settings' announcement and the administrators' notice, the top bar, the
 * column - one stylesheet, styles/_participant-frame.scss - and the anotoki
 * family's footer, <anotoki-site-footer>: the version and What's new,
 * Feedback, anybody's here, and About · Support · Terms · Privacy · Contact) -
 * and the survey's facts, which only the legal pages read, given to them here
 * (shared/legal/legal-facts.ts), out of the first load.
 *
 * Anybody may read them, signed in or not, whether the IAM requires signing in
 * here or not: what a site keeps is said before anybody signs in to it. So no
 * guard stands in front of them and nothing here asks for a sign-in - and
 * nothing of a survey is on them, nor asked of the API. While the site cannot
 * run, the family's page stands instead of them, as instead of every page.
 */
@Component({
  selector: 'app-legal-layout',
  imports: [RouterOutlet, AnnouncementComponent, PageNoticeComponent, SiteFooterComponent, TopBarComponent, TranslatePipe],
  providers: [{ provide: ANOTOKI_LEGAL_CONFIG, useFactory: surveyLegalPagesConfig }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legal-layout.component.html',
  styleUrl: './legal-layout.component.scss',
})
export class LegalLayoutComponent {
  /** The footer's version and What's new: the list boot() asked for - neither while there is none. */
  protected readonly changelog = inject(Changelog);
}
