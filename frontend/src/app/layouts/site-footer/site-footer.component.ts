import { ChangeDetectionStrategy, Component } from '@angular/core';
import { LegalLinksComponent } from '@anotoki/lib/legal';

/**
 * The foot of the pages people read: the family's Terms · Privacy · Contact
 * (`<anotoki-legal-links>`, @anotoki/lib/legal - the legal pages' own paths,
 * the page's language, the database's words for the three; its configuration
 * core/legal/legal.config.ts). Under the survey's pages
 * (layouts/participant-layout) - the "not signed in" card's too - and under
 * the legal pages (layouts/legal-layout). Not in the admin panel, which is
 * English and its own frame.
 */
@Component({
  selector: 'app-site-footer',
  imports: [LegalLinksComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './site-footer.component.html',
  styleUrl: './site-footer.component.scss',
})
export class SiteFooterComponent {}
