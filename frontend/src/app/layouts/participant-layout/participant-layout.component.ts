import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { signInOrSayWhy } from '../../core/auth/sign-in-failure';
import { VisitorKey } from '../../core/auth/visitor-key';
import { TranslatePipe } from '../../core/i18n/translate.pipe';
import { TranslationService } from '../../core/i18n/translation.service';
import { ButtonComponent } from '../../ui/button/button.component';
import { EmptyStateComponent } from '../../ui/empty-state/empty-state.component';
import { IconComponent } from '../../ui/icon/icon.component';
import { ToastService } from '../../ui/toast/toast.service';
import { TopBarComponent } from '../top-bar/top-bar.component';

/**
 * The frame of what people see: the top bar and the page below it - for
 * somebody signed in, or, while the site welcomes visitors (the IAM's
 * "Sign-in required" is off), for anybody. The editor's preview is for
 * somebody signed in whatever the switch.
 *
 * Whenever nobody may see the page here, it is taken away with no navigation,
 * and a card stands in its place: a session that ended with the page open
 * (the IAM's idle limit, a sign-out in another tab) while sign-in is
 * required, or a sign-in that came back without one (the guard lets that
 * page load through rather than send the browser round again; the toast says
 * what went wrong), or one that could not start (the browser refuses the
 * site's storage). Nothing of a survey shows then; the card's Sign in comes
 * back to this address, and the answers begun are kept (take-survey's drafts).
 *
 * It also says, in a toast, what the move after a sign-in did with what this
 * browser answered as a visitor (VisitorKey.moved), and that a visitor's
 * earlier visit has ended (VisitorKey.lost) - once each, finished sentences
 * when raised.
 */
@Component({
  selector: 'app-participant-layout',
  imports: [RouterOutlet, ButtonComponent, EmptyStateComponent, IconComponent, TopBarComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './participant-layout.component.html',
  styleUrl: './participant-layout.component.scss',
})
export class ParticipantLayoutComponent {
  protected readonly auth = inject(AuthService);
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
  /** The editor's preview: never a visitor's (its own signInGuard; and here, for a page load the guard let through after a failed sign-in). */
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

  /** To the IAM - its pages in the language the person reads here - and back to this page; a toast if it cannot start. */
  protected signIn(): void {
    void signInOrSayWhy(this.auth, this._i18n, this._toast);
  }
}
