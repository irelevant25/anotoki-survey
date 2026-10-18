import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { SiteFooterComponent } from '@anotoki/lib/footer';
import { TranslatePipe, TranslationService } from '@anotoki/lib/translations';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { ToastService } from '@anotoki/lib/ui/toast';
import { signInOrShowWhy } from '../../core/auth/auth.config';
import { AuthService } from '../../core/auth/auth.service';
import { VisitorKey } from '../../core/auth/visitor-key';
import { Changelog } from '../../core/changelog/changelog.service';
import { TopBarComponent } from '../top-bar/top-bar.component';

/**
 * The frame of what people see: the top bar and the page below it - for
 * somebody signed in, or, while the site welcomes visitors (the IAM's
 * "Sign-in required" is off), for anybody. The editor's preview is for
 * somebody signed in whatever the switch. Under it, for anybody, the anotoki
 * family's footer (<anotoki-site-footer>, @anotoki/lib/footer): the survey's
 * version and What's new (core/changelog/), Feedback - the family's form,
 * which anybody may send here (core/feedback.ts) - and Terms · Privacy ·
 * Contact, for the legal pages are open to all (layouts/legal-layout).
 *
 * Whenever nobody may see the page here, it is taken away with no navigation,
 * and a card stands in its place: a session that ended with the page open
 * (the IAM's idle limit, a sign-out in another tab) while sign-in is
 * required. Nothing of a survey shows then; the card's Sign in comes back to
 * this address, and the answers begun are kept (take-survey's drafts). A
 * sign-in that came back without one, or could not start (the browser refuses
 * the site's storage), is said on the anotoki family's screen instead of the
 * page (the guards, signInOrShowWhy()).
 *
 * It also says, in a toast, what the move after a sign-in did with what this
 * browser answered as a visitor (VisitorKey.moved), and that a visitor's
 * earlier visit has ended (VisitorKey.lost) - once each, finished sentences
 * when raised.
 */
@Component({
  selector: 'app-participant-layout',
  imports: [RouterOutlet, ButtonComponent, EmptyStateComponent, IconComponent, SiteFooterComponent, TopBarComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './participant-layout.component.html',
  styleUrl: './participant-layout.component.scss',
})
export class ParticipantLayoutComponent {
  protected readonly auth = inject(AuthService);
  /** The footer's version and What's new: the list boot() asked for - neither while there is none. */
  protected readonly changelog = inject(Changelog);
  private readonly _visitor = inject(VisitorKey);
  private readonly _i18n = inject(TranslationService);
  private readonly _toast = inject(ToastService);
  private readonly _router = inject(Router);

  /** The address's path, after every navigation. */
  private readonly _path = toSignal(
    this._router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      map((event) => event.urlAfterRedirects),
    ),
    { initialValue: this._router.url },
  );
  /** The editor's preview: never a visitor's (its own personGuard; and here, for a session that ended with the preview open). */
  private readonly _onPreview = computed(() => this._path().startsWith('/preview/'));
  /** Whether the page is drawn: somebody signed in, or a visitor anywhere but the preview. */
  protected readonly showPage = computed(() => this.auth.signedIn() || (this.auth.visitorsWelcome() && !this._onPreview()));

  constructor() {
    effect(() => {
      const moved = this._visitor.moved();
      if (!moved) {
        return;
      }
      untracked(() => {
        const sentences = [];
        if (moved.moved > 0) {
          sentences.push(this._i18n.plural('visitor.moved', moved.moved));
        }
        if (moved.kept > 0) {
          sentences.push(this._i18n.plural('visitor.kept', moved.kept));
        }
        this._toast.success(sentences.join(' '));
        this._visitor.moved.set(null);
      });
    });

    effect(() => {
      if (!this._visitor.lost()) {
        return;
      }
      untracked(() => {
        this._toast.info(this._i18n.t('visitor.lost'));
        this._visitor.lost.set(false);
      });
    });
  }

  /** To the IAM - its pages in the language the person reads here - and back to this page; the screen that says why if it cannot start. */
  protected signIn(): void {
    void signInOrShowWhy(this.auth, this._router);
  }
}
