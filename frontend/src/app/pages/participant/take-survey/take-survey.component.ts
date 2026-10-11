import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, booleanAttribute, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { RouterLink } from '@angular/router';
import { TranslatePipe, TranslatePluralPipe, TranslationService } from '@anotoki/lib/translations';
import { AlertComponent } from '@anotoki/lib/ui/alert';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { ToastService } from '@anotoki/lib/ui/toast';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { ApiError, ApiService, ParticipantSurvey, toApiError } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { VisitorKey } from '../../../core/auth/visitor-key';
import { LocalDatePipe } from '../../../core/i18n/local-date.pipe';
import { AGE_ID, GENDER_ID, isAgeKey, isGenderKey } from '../../../core/survey/about-you';
import { aboutYouQuestions } from '../../../core/survey/about-you-questions';
import { AnswerProblem, answerProblem, cleanAnswer } from '../../../core/survey/answer-rules';
import { Draft, adoptVisitorDraft, clearDraft, readDraft, writeDraft } from '../../../core/survey/drafts';
import { LocalizedSurvey, localizedSurvey } from '../../../core/survey/localize';
import { newId } from '../../../core/survey/survey-factory';
import { currentStatus, estimatedMinutes, numberedQuestions, questionCount } from '../../../core/survey/survey-outline';
import { AboutYou, Answer, Question, SurveyResponse } from '../../../core/survey/survey.model';
import { QuestionBlockComponent } from '../question-block/question-block.component';
import { otherLanguage } from '../shown-language';
import { SurveyHeroComponent } from '../survey-hero/survey-hero.component';
import { VisitorNoticeComponent } from '../visitor-notice/visitor-notice.component';
import { sendFailure, sendFailureText } from './send-failure';

/** One page of the survey: "About you" (when asked), then each of the survey's steps. */
interface Page {
  key: string;
  title: string;
  /**
   * The language the step's title and its questions' texts are in, when it is
   * not the page's: the survey's, for the survey's own steps. Null for "About
   * you", which the site words itself.
   */
  lang: string | null;
  questions: { question: Question; number: number | null }[];
}

/** What the person meets at this address, before any of the survey. */
type State = 'loading' | 'failed' | 'missing' | 'not-open' | 'closed' | 'answered' | 'sent' | 'take';

/**
 * A survey, taken: the welcome, the steps one at a time, and the thanks - and
 * for everybody who cannot take it, why not.
 *
 * Nothing leaves the browser until the last step's "Send": the answers so far
 * are a draft kept on this device after every change, so a closed tab or a
 * dropped connection loses nothing, and coming back offers to carry on.
 * "Next" checks the step in front of the person; "Send" checks every step
 * again, since an answer given earlier may no longer fit a survey the editor
 * has changed since - and the server checks it all once more, in the same
 * words (backend/api/survey_rules.php).
 *
 * Somebody taking surveys without signing in (while the site welcomes
 * visitors) takes it the same way, as this browser's visitor: the draft is
 * kept under the visitor's slot, "answered" is the visitor's, and the first
 * answers sent make the visitor (the interceptor keeps the key). A sign-in
 * makes the drafts the person's (adoptVisitorDraft()) and moves the answers
 * (core/auth/visitor-key.ts); the page then asks again.
 *
 * At /preview/{id} it is the editor's preview: any survey, open or not, and
 * nothing saved - not the draft, not the answers. It is read again whenever
 * its tab comes back into view, so it follows an editor in another tab.
 *
 * Every word of the page's own is a translation key, worded in the template
 * or in a computed - so the page follows the language when it is switched, in
 * the middle of a survey too: the answers are by id and stay. What is kept in
 * state is never a sentence: a problem is a kind and its numbers, worded by
 * the question block. Only a toast is a finished sentence when it is raised.
 * The preview's own bar and buttons are an editor's tool and stay English.
 *
 * A survey's own texts are the survey's, and it may hold them in more than
 * one language (core/survey/localize.ts). People read it in their language
 * when the survey has every text in it, and otherwise whole in the language
 * it was written in - never half and half. Then the welcome says which
 * language that is, and everything that draws a text of the survey carries
 * that language (`lang`), while the site's own words around it do not -
 * except the hint inside an own-words field and the labels that quote a
 * survey text inside a site sentence: an attribute has one language, and
 * `lang` on the field would also name the language of what the person types.
 * The language on the page when the answers are sent goes with them.
 *
 * The preview is for a translator too: it takes the language from its address
 * (`?language=`) and shows it text by text, the original where the
 * translation has nothing yet - only the survey's texts follow it, the site's
 * words stay in the language of the page. An address that names no language
 * shows the survey as it is written, whatever language the page is in: the
 * editor left from the main language's tab, and that is what they are
 * looking at. The preview marks the survey's texts as one language - the
 * translation's - so an original shown in a gap carries the translation's
 * `lang` too; a language per text is not kept.
 */
@Component({
  selector: 'app-take-survey',
  imports: [
    RouterLink,
    AlertComponent,
    ButtonComponent,
    IconComponent,
    QuestionBlockComponent,
    SpinnerComponent,
    SurveyHeroComponent,
    VisitorNoticeComponent,
    LocalDatePipe,
    TranslatePipe,
    TranslatePluralPipe,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './take-survey.component.html',
  styleUrl: './take-survey.component.scss',
})
export class TakeSurveyComponent {
  /** The survey's address, at /{slug}. */
  readonly slug = input<string | undefined>(undefined);
  /** The survey's id, at /preview/{surveyId}. */
  readonly surveyId = input<string | undefined>(undefined);
  /** Route data: this is the editor's preview. */
  readonly preview = input(false, { transform: booleanAttribute });
  /**
   * `?language=` at /preview/{surveyId}: the language to preview the survey's
   * texts in. Its own parameter, not `lang` - that one is the whole tab's, and
   * a translation may be in a language the site does not offer. (The router
   * hands every address its query, so it is read for a preview only.)
   */
  readonly language = input<string | undefined>(undefined);

  private readonly _api = inject(ApiService);
  private readonly _admin = inject(AdminStore);
  private readonly _auth = inject(AuthService);
  private readonly _visitor = inject(VisitorKey);
  private readonly _i18n = inject(TranslationService);
  private readonly _title = inject(Title);
  private readonly _toast = inject(ToastService);
  private readonly _injector = inject(Injector);
  private readonly _host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The survey at /{slug} as the server sent it, with when this person answered it. */
  private readonly _loaded = signal<ParticipantSurvey | null>(null);
  private readonly _loadError = signal<ApiError | null>(null);

  /** The survey as it is kept: the editor's own in a preview, otherwise what the server sent. */
  private readonly _document = computed(() => (this.preview() ? this._admin.survey(this.surveyId() ?? '') : this._loaded()?.survey));
  /**
   * The survey as it is shown, and the language its texts are really in. For
   * people: their language when nothing is missing from that translation,
   * else the language it is written in. For a preview: the translation its
   * address names, text by text - and with no language named, the survey as
   * it is written: never the language the editor happens to read the site in.
   */
  private readonly _shown = computed<LocalizedSurvey | null>(() => {
    const survey = this._document();
    if (!survey) {
      return null;
    }
    return this.preview() ? localizedSurvey(survey, this.language() ?? survey.language, 'partial') : localizedSurvey(survey, this._i18n.language(), 'complete');
  });
  /** What the page draws: the same survey - ids, questions, limits - with its texts in the language shown. */
  protected readonly survey = computed(() => this._shown()?.survey);
  /** The language the survey's texts are in, when it is not the page's: said on the welcome, and what `lang` on those texts is. */
  protected readonly otherLanguage = computed(() => otherLanguage(this._i18n, this._shown()?.language));
  /** That language's code for `lang` - nothing when the texts are in the page's own. */
  protected readonly surveyLang = computed(() => this.otherLanguage()?.code ?? null);
  protected readonly person = this._auth.person;
  /** Who takes the survey: the person signed in, or this browser's visitor. */
  protected readonly taker = this._auth.taker;
  /** Who, by id alone: a refreshed token is the same person, and asks for nothing again. */
  private readonly _takerId = computed(() => this.taker()?.id ?? null);
  /** A visitor takes the survey here (never in a preview): the notice, and the line that says so. */
  protected readonly visiting = computed(() => !this.preview() && this.taker()?.visitor === true);
  /** When this person - or this browser's visitor - sent their answers, if they have. */
  protected readonly answeredAt = computed(() => (this.preview() ? null : (this._loaded()?.answeredAt ?? null)));

  protected readonly phase = signal<'welcome' | 'steps'>('welcome');
  protected readonly pageIndex = signal(0);
  protected readonly answers = signal<Record<string, Answer>>({});
  protected readonly startedAt = signal<string | null>(null);
  /** Set when the person pressed Next on a step that still misses something: the problems show from then on. */
  protected readonly tried = signal(false);
  protected readonly sent = signal<SurveyResponse | null>(null);
  protected readonly sending = signal(false);
  protected readonly draft = signal<Draft | null>(null);

  protected readonly pages = computed<Page[]>(() => {
    const survey = this.survey();
    if (!survey) {
      return [];
    }
    const numbers = new Map(numberedQuestions(survey).map((item) => [item.question.id, item.number]));
    const pages: Page[] = [];
    if (survey.askAboutYou) {
      // Worded here, inside the computed: t() reads the language, so a switch
      // words the step again. Its ids and its options' ids do not change, so
      // what was answered stays answered.
      const word = (key: string): string => this._i18n.t(key);
      pages.push({ key: 'about-you', title: word('aboutYou.title'), lang: null, questions: aboutYouQuestions(word).map((question) => ({ question, number: null })) });
    }
    const lang = this.surveyLang();
    for (const step of survey.steps) {
      pages.push({ key: step.id, title: step.title, lang, questions: step.questions.map((question) => ({ question, number: numbers.get(question.id) ?? null })) });
    }
    return pages;
  });

  protected readonly page = computed(() => {
    const pages = this.pages();
    return pages[Math.min(this.pageIndex(), pages.length - 1)] ?? null;
  });
  protected readonly isLast = computed(() => this.pageIndex() >= this.pages().length - 1);

  /** What the current step still misses, by question id: kinds, which the question block words. */
  protected readonly problems = computed(() => {
    const answers = this.answers();
    const problems = new Map<string, AnswerProblem>();
    for (const { question } of this.page()?.questions ?? []) {
      const problem = answerProblem(question, answers[question.id]);
      if (problem) {
        problems.set(question.id, problem);
      }
    }
    return problems;
  });

  protected readonly state = computed<State>(() => {
    const survey = this.survey();
    if (!survey) {
      const error = this.preview() ? this._admin.loadError(this.surveyId() ?? '') : this._loadError();
      if (error) {
        return error.status === 404 || error.status === 403 ? 'missing' : 'failed';
      }
      return 'loading';
    }
    if (this.sent()) {
      return 'sent';
    }
    if (this.preview()) {
      return 'take';
    }
    if (survey.status === 'draft') {
      return 'not-open';
    }
    // Nobody else is here: the layout draws a page only for somebody signed in, or a visitor while the site welcomes them.
    if (this.answeredAt()) {
      return 'answered';
    }
    return currentStatus(survey) === 'closed' ? 'closed' : 'take';
  });

  protected readonly facts = computed(() => {
    const survey = this.survey();
    return survey
      ? { questions: questionCount(survey), steps: this.pages().length, minutes: estimatedMinutes(survey), closesOn: survey.status === 'open' ? survey.closesOn : null, language: this.otherLanguage() }
      : null;
  });

  /** The step a draft got to, counted from 1 - within the steps the survey has now. */
  protected readonly draftStep = computed(() => Math.min((this.draft()?.stepIndex ?? 0) + 1, this.pages().length));

  /** Which survey, as whom: when it changes the page starts over - but not when the editor changes the survey under a preview. */
  private readonly _who = computed(() => `${this.survey()?.id ?? ''}|${this._takerId() ?? ''}|${this.preview()}`);

  /** "Signed in as " and " · everyone can take this survey once.": the sentence before and after the name, which is set in bold - and drawn only when the string has a place for it. */
  protected readonly signedInAs = computed(() => this._i18n.around('take.signedInAs', 'name'));
  /** "Language: " and what follows the name: the welcome's note before and after the language, whose name is in a language of its own. */
  protected readonly inLanguage = computed(() => this._i18n.around('home.inLanguage', 'language'));

  /**
   * What the preview's "Back to the editor" links add to the editor's
   * address: the translation this preview shows, as `?language=`, so the
   * editor opens that tab again. Nothing when the preview shows the survey as
   * it is written - no language named, or one the survey has no translation in.
   */
  protected readonly editorQuery = computed(() => {
    const shown = this._shown();
    const written = this._document()?.language;
    return this.preview() && shown && shown.language !== written ? { language: shown.language } : null;
  });

  constructor() {
    // The tab's title: this page is the only writer at its addresses (the
    // routes have no title). It reads the language, so a switch renames the
    // tab - with the survey's title as the page shows it.
    effect(() => {
      const survey = this.survey();
      if (survey) {
        // "Preview: " is the editor's and stays English.
        this._title.setTitle(`${this.preview() ? 'Preview: ' : ''}${survey.title}`);
        return;
      }
      const site = this._i18n.t('brand.site');
      this._title.setTitle(this.state() === 'loading' ? site : `${this._i18n.t('title.notFound')} · ${site}`);
    });

    // The survey, and whether this person has answered it: again for another
    // address, another person, a visitor key that came or went, and a move of
    // what this browser answered as a visitor into the account.
    effect(() => {
      const slug = this.slug();
      const id = this.surveyId();
      const preview = this.preview();
      this._takerId();
      if (!preview) {
        this._visitor.key();
        this._visitor.moves();
      }
      untracked(() => void this._load(slug, id, preview));
    });

    // A preview follows the editor: read again whenever its tab comes back into view.
    const onVisible = () => {
      if (this.preview() && document.visibilityState === 'visible' && this.surveyId()) {
        void this._admin.load(this.surveyId() as string, true);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('visibilitychange', onVisible));

    effect(() => {
      this._who();
      untracked(() => this._startOver(this._readDraft()));
    });

    // The draft follows every change while the person is on the steps.
    effect(() => {
      const answers = this.answers();
      const stepIndex = this.pageIndex();
      if (this.phase() !== 'steps' || this.preview() || this.sent()) {
        return;
      }
      const survey = untracked(this.survey);
      const taker = untracked(this.taker);
      if (survey && taker) {
        writeDraft(survey.id, taker.id, { stepIndex, answers, startedAt: untracked(this.startedAt) ?? new Date().toISOString(), savedAt: new Date().toISOString() });
      }
    });
  }

  protected retry(): void {
    void this._load(this.slug(), this.surveyId(), this.preview());
  }

  protected start(): void {
    // A person back on the welcome after some steps keeps the time they began.
    this.startedAt.set(this.startedAt() ?? this.draft()?.startedAt ?? new Date().toISOString());
    this.phase.set('steps');
    this.pageIndex.set(0);
    this._showStep();
  }

  /** Back where the person stopped, with what they had answered. */
  protected carryOn(): void {
    const draft = this.draft();
    if (!draft) {
      this.start();
      return;
    }
    this.answers.set(draft.answers);
    this.startedAt.set(draft.startedAt);
    this.pageIndex.set(Math.min(Math.max(0, draft.stepIndex), this.pages().length - 1));
    this.phase.set('steps');
    this._showStep();
  }

  protected startAgain(): void {
    const survey = this.survey();
    const taker = this.taker();
    if (survey && taker) {
      clearDraft(survey.id, taker.id);
    }
    this._startOver(null);
    this.start();
  }

  protected setAnswer(questionId: string, answer: Answer): void {
    this.answers.update((answers) => ({ ...answers, [questionId]: answer }));
  }

  protected next(event?: Event): void {
    event?.preventDefault();
    if (this.sending()) {
      return;
    }
    if (this.problems().size) {
      this.tried.set(true);
      this._showFirstProblem();
      return;
    }
    if (this.isLast()) {
      void this._send();
      return;
    }
    this.tried.set(false);
    this.pageIndex.update((index) => index + 1);
    this._showStep();
  }

  protected back(): void {
    this.tried.set(false);
    if (this.pageIndex() === 0) {
      // The welcome offers to carry on from the draft as it is now, not as it
      // was when the page was opened - that one would bring older answers back.
      this.draft.set(this._readDraft());
      this.phase.set('welcome');
      this._focusAfterRender('.start button, app-alert button');
      return;
    }
    this.pageIndex.update((index) => index - 1);
    this._showStep();
  }

  protected restartPreview(): void {
    this._startOver(null);
  }

  private async _load(slug: string | undefined, surveyId: string | undefined, preview: boolean): Promise<void> {
    if (preview) {
      if (surveyId) {
        await this._admin.load(surveyId, true);
      }
      return;
    }
    this._loadError.set(null);
    if (!slug) {
      return;
    }
    // Another survey's address: nothing of the last one stays on the page while this one comes.
    if (this._loaded()?.survey.slug !== slug) {
      this._loaded.set(null);
    }
    try {
      const loaded = await this._api.surveyBySlug(slug);
      if (this.slug() === slug) {
        this._loaded.set(loaded);
      }
    } catch (error) {
      // Asked again for the survey already on the page (somebody signed in,
      // or the answers were refused) and the server did not answer: the page
      // keeps what it has, and the person their answers - sending says why.
      if (this.slug() === slug && this._loaded()?.survey.slug !== slug) {
        this._loadError.set(toApiError(error));
      }
    }
  }

  private async _send(): Promise<void> {
    const shown = this._shown();
    const person = this.person();
    const taker = this.taker();
    if (!shown) {
      return;
    }
    // The survey as the person reads it at this moment, and the language its
    // texts are in: that language goes with the answers.
    const { survey, language } = shown;

    // Every step again: find the first one with anything missing and go there.
    const pages = this.pages();
    const answers = this.answers();
    const broken = pages.findIndex((page) => page.questions.some(({ question }) => answerProblem(question, answers[question.id])));
    if (broken >= 0) {
      this._showProblemOn(broken);
      return;
    }

    const kept: Record<string, Answer> = {};
    for (const step of survey.steps) {
      for (const question of step.questions) {
        const answer = cleanAnswer(question, answers[question.id]);
        if (answer) {
          kept[question.id] = answer;
        }
      }
    }
    const gender = answers[GENDER_ID]?.optionIds[0] ?? '';
    const age = answers[AGE_ID]?.optionIds[0] ?? '';
    const aboutYou: AboutYou | null = survey.askAboutYou && isGenderKey(gender) && isAgeKey(age) ? { gender, age } : null;
    const now = new Date().toISOString();
    const response: SurveyResponse = {
      id: newId(),
      surveyId: survey.id,
      person: person ?? { id: 'preview', name: 'Preview', email: '' },
      aboutYou,
      answers: kept,
      language,
      startedAt: this.startedAt() ?? now,
      submittedAt: now,
    };

    if (this.preview()) {
      this.sent.set(response);
      this._showTop();
      return;
    }
    if (!taker) {
      return;
    }

    this.sending.set(true);
    try {
      const saved = await this._api.submit(survey.slug, { aboutYou, answers: kept, language, startedAt: response.startedAt });
      clearDraft(survey.id, taker.id);
      this.sent.set({ ...response, id: saved.id, submittedAt: saved.submittedAt });
      this._loaded.update((loaded) => (loaded ? { ...loaded, answeredAt: saved.submittedAt } : loaded));
      this._showTop();
    } catch (failure) {
      const error = toApiError(failure);
      const reason = sendFailure(error, taker.visitor);
      // The page's own words, in the reader's language - never the server's
      // sentence. A toast is a finished sentence when it is raised.
      const text = sendFailureText(this._i18n, error, (questionId) => pages.flatMap((page) => page.questions).find((item) => item.question.id === questionId)?.number ?? null, taker.visitor);
      if (reason === 'siteClosed') {
        // The site closed under the person (an update began): the family's page has taken this one's place and says
        // so calmly - a toast here would be an error drawn over it. The answers stay in the draft, offered again after.
        return;
      }
      if (reason === 'already') {
        clearDraft(survey.id, taker.id);
        this._toast.info(text);
        void this._load(this.slug(), undefined, false);
      } else if (reason === 'closed') {
        this._toast.error(text);
        void this._load(this.slug(), undefined, false);
      } else if (reason === 'answer' && typeof error.body['questionId'] === 'string') {
        // The survey changed under the person: back to the step the server
        // named, and the survey is read again - then the exact problem shows
        // under the question, from this page's own answerProblem().
        const at = pages.findIndex((page) => page.questions.some(({ question }) => question.id === error.body['questionId']));
        this._toast.error(text);
        this._showProblemOn(at >= 0 ? at : this.pageIndex());
        void this._load(this.slug(), undefined, false);
      } else if (reason === 'gone') {
        // Moved to another address, or deleted, while the person was in it:
        // sending again can never work, so the page becomes "There is no
        // survey here", with its way to the open surveys. The draft is not
        // cleared - it is kept by the survey's id, so it is offered again at
        // the address the survey has now.
        this._toast.error(text);
        this._loaded.set(null);
        this._loadError.set(error);
      } else {
        this._toast.error(text);
      }
    } finally {
      this.sending.set(false);
    }
  }

  /**
   * The draft of the survey on the page, for whoever takes it - nothing in a
   * preview. A person's takes in first a draft this browser's visitor left of
   * it (a sign-in on this page, or in another tab: before the page reads it,
   * whatever order the effects run in) - the person's own wins.
   */
  private _readDraft(): Draft | null {
    const survey = this.survey();
    const taker = this.taker();
    if (!survey || !taker || this.preview()) {
      return null;
    }
    if (!taker.visitor) {
      adoptVisitorDraft(survey.id, taker.id);
    }
    return readDraft(survey.id, taker.id);
  }

  private _startOver(draft: Draft | null): void {
    this.phase.set('welcome');
    this.pageIndex.set(0);
    this.answers.set({});
    this.startedAt.set(null);
    this.tried.set(false);
    this.sent.set(null);
    this.draft.set(draft);
  }

  /** The step at `index` with its problems shown, and the first of them in view. */
  private _showProblemOn(index: number): void {
    this.phase.set('steps');
    this.pageIndex.set(index);
    this.tried.set(true);
    this._showFirstProblem();
  }

  /** After a step change: the top of the card in view, and focus on the step's heading so a screen reader starts there. */
  private _showStep(): void {
    afterNextRender(
      () => {
        const heading = this._host.nativeElement.querySelector<HTMLElement>('.step-heading');
        this._scrollToCard();
        heading?.focus({ preventScroll: true });
      },
      { injector: this._injector },
    );
  }

  private _showTop(): void {
    afterNextRender(
      () => {
        this._scrollToCard();
        this._host.nativeElement.querySelector<HTMLElement>('.done-heading')?.focus({ preventScroll: true });
      },
      { injector: this._injector },
    );
  }

  /**
   * The first question still missing something, scrolled to, with focus where
   * the fix is: the empty "Other" field, else the chosen option (focus on an
   * unchosen radio would let Space or an arrow change the answer), else the
   * first field.
   */
  private _showFirstProblem(): void {
    afterNextRender(
      () => {
        const question = this._host.nativeElement.querySelector<HTMLElement>('.question.has-error');
        question?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const target =
          question?.querySelector<HTMLElement>('.other .field-invalid .field-input') ??
          question?.querySelector<HTMLElement>('input:checked') ??
          question?.querySelector<HTMLElement>('input:not([disabled]), textarea');
        target?.focus({ preventScroll: true });
      },
      { injector: this._injector },
    );
  }

  /** Focus on the first element the selector finds, once the view has been drawn. */
  private _focusAfterRender(selector: string): void {
    afterNextRender(() => this._host.nativeElement.querySelector<HTMLElement>(selector)?.focus(), { injector: this._injector });
  }

  private _scrollToCard(): void {
    const card = this._host.nativeElement.querySelector<HTMLElement>('.card');
    if (card && card.getBoundingClientRect().top < 0) {
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }
}
