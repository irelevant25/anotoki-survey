import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ButtonComponent } from '@anotoki/lib/ui/button';
import { type ChipItem, ChipListComponent } from '@anotoki/lib/ui/chips';
import { EmptyStateComponent } from '@anotoki/lib/ui/empty-state';
import { IconComponent } from '@anotoki/lib/ui/icon';
import { SpinnerComponent } from '@anotoki/lib/ui/spinner';
import { ConfirmService } from '@anotoki/lib/ui/dialog';
import { DrawerComponent } from '@anotoki/lib/ui/drawer';
import { TabItem, TabsComponent } from '@anotoki/lib/ui/tabs';
import { ToastService } from '@anotoki/lib/ui/toast';
import { AdminDates } from '../../../core/admin/admin-dates.service';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { toApiError } from '../../../core/api/api.service';
import { AuthService } from '../../../core/auth/auth.service';
import { AGE_ID, GENDER_ID, ageLabel, genderLabel } from '../../../core/survey/about-you';
import { isChoice } from '../../../core/survey/answer-rules';
import { responsesCsv } from '../../../core/survey/csv';
import { plainText } from '../../../core/survey/plain-text';
import { ResultFilter, aboutYouSummary, choiceSummary, describeFilter, durationSeconds, filterResponses, matchesFilter, medianDuration, writtenAnswers } from '../../../core/survey/results';
import { numberedQuestions } from '../../../core/survey/survey-outline';
import { SurveyResponse } from '../../../core/survey/survey.model';
import { formatDuration, todayIsoDay } from '../../../core/util/dates';
import { ResponseViewComponent } from '../response-view/response-view.component';
import { SurveyHeaderComponent } from '../survey-header/survey-header.component';
import { BarListComponent } from './bar-list/bar-list.component';
import { ChoiceResultComponent } from './choice-result/choice-result.component';
import { PeopleListComponent, PersonRow, hueOf } from './people-list/people-list.component';
import { TextResultComponent } from './text-result/text-result.component';

/** "question:option" in the address, as a filter. Question ids hold no colon; neither do option ids. */
function parsePair(value: string | undefined | null): ResultFilter | null {
  const at = value ? value.indexOf(':') : -1;
  return value && at > 0 && at < value.length - 1 ? { questionId: value.slice(0, at), optionId: value.slice(at + 1) } : null;
}

function samePair(a: ResultFilter, b: ResultFilter): boolean {
  return a.questionId === b.questionId && a.optionId === b.optionId;
}

/** A filter as the address writes it: "question:option". */
function pairText(filter: ResultFilter): string {
  return `${filter.questionId}:${filter.optionId}`;
}

/** The longest a question is said on a filter's chip; a longer one is cut at a word, with an ellipsis. */
const CHIP_QUESTION_MAX = 48;

function shortQuestion(question: string): string {
  if (question.length <= CHIP_QUESTION_MAX) {
    return question;
  }
  const cut = question.slice(0, CHIP_QUESTION_MAX);
  const space = cut.lastIndexOf(' ');
  return `${(space > CHIP_QUESTION_MAX / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

const NONE: ReadonlySet<string> = new Set();

/**
 * The results of a survey, and the people behind them.
 *
 * Every answer's bar opens the people who chose it; every person opens their
 * whole filled survey; and any answer can narrow the whole page to the people
 * who gave it ("only the daily visitors: what did they like?") - filters that
 * add up, each shown with a way to drop it.
 *
 * All of it lives in the address - `?filter=`, `?chose=`, `?wrote=`,
 * `?response=`, `?tab=` - so the browser's Back button steps back out of it,
 * and every view can be linked to.
 */
@Component({
  selector: 'app-survey-results',
  imports: [
    RouterLink,
    BarListComponent,
    ButtonComponent,
    ChipListComponent,
    ChoiceResultComponent,
    DrawerComponent,
    EmptyStateComponent,
    IconComponent,
    PeopleListComponent,
    ResponseViewComponent,
    SpinnerComponent,
    SurveyHeaderComponent,
    TabsComponent,
    TextResultComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './survey-results.component.html',
  styleUrl: './survey-results.component.scss',
})
export class SurveyResultsComponent {
  readonly surveyId = input.required<string>();
  /** `people` for the list of everybody; the summary otherwise. */
  readonly tab = input<string | undefined>(undefined);
  /** Filters, "question:option" joined by commas. */
  readonly filter = input<string | undefined>(undefined);
  /** The drawer: the people who chose "question:option". */
  readonly chose = input<string | undefined>(undefined);
  /** The drawer: everybody's answer to a text question. */
  readonly wrote = input<string | undefined>(undefined);
  /** The drawer: one person's filled survey. */
  readonly response = input<string | undefined>(undefined);

  private readonly _store = inject(AdminStore);
  private readonly _router = inject(Router);
  private readonly _route = inject(ActivatedRoute);
  private readonly _confirm = inject(ConfirmService);
  private readonly _toast = inject(ToastService);
  protected readonly auth = inject(AuthService);

  protected readonly genderId = GENDER_ID;
  protected readonly ageId = AGE_ID;
  protected readonly none = NONE;
  protected readonly timeAgo = inject(AdminDates).timeAgo;
  protected readonly formatDateTime = inject(AdminDates).formatDateTime;
  protected readonly formatDuration = formatDuration;
  protected readonly durationSeconds = durationSeconds;
  protected readonly genderLabel = genderLabel;
  protected readonly ageLabel = ageLabel;
  protected readonly hueOf = hueOf;

  protected readonly survey = computed(() => this._store.survey(this.surveyId()));
  protected readonly loadError = computed(() => (this.survey() ? null : this._store.loadError(this.surveyId())));
  protected readonly responsesLoaded = computed(() => this._store.responses(this.surveyId()) !== undefined);
  protected readonly responsesError = computed(() => (this.responsesLoaded() ? null : this._store.responsesError(this.surveyId())));
  /** Every response, newest first. */
  protected readonly all = computed(() => [...(this._store.responses(this.surveyId()) ?? [])].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)));

  constructor() {
    // The answers as they are now: they keep coming in while a survey is open.
    effect(() => {
      const id = this.surveyId();
      untracked(() => this.reload(id));
    });
  }

  protected reload(id = this.surveyId()): void {
    void this._store.load(id, true);
    void this._store.loadSummaries();
    void this._store.loadResponses(id, true);
  }

  protected readonly filters = computed(() => {
    const survey = this.survey();
    const pairs = (this.filter() ?? '').split(',').map(parsePair);
    return survey ? pairs.filter((pair): pair is ResultFilter => pair !== null && describeFilter(survey, pair) !== null) : [];
  });
  protected readonly chips = computed(() => {
    const survey = this.survey();
    return survey ? this.filters().map((filter) => ({ filter, ...(describeFilter(survey, filter) as { question: string; answer: string }) })) : [];
  });
  /**
   * The filters as the kit's removable chips (`<anotoki-chip-list>`): the question - cut short where it is long,
   * as the chip it replaced did - and the answer chosen; each remove button named with them ("Remove: 2. How
   * often do you play?: Daily"), and the focus going on to the next chip once one goes.
   */
  protected readonly chipItems = computed<ChipItem[]>(() => this.chips().map((chip) => ({ value: pairText(chip.filter), label: `${shortQuestion(chip.question)}: ${chip.answer}` })));
  /** The filtered options, by question id - marked on their bars. */
  protected readonly filteredKeys = computed(() => {
    const map = new Map<string, Set<string>>();
    for (const filter of this.filters()) {
      map.set(filter.questionId, (map.get(filter.questionId) ?? new Set()).add(filter.optionId));
    }
    return map;
  });

  /** The responses the page is about: all of them, or those matching every filter. */
  protected readonly responses = computed(() => filterResponses(this.all(), this.filters()));

  protected readonly facts = computed(() => {
    const responses = this.responses();
    return {
      shown: responses.length,
      total: this.all().length,
      median: medianDuration(responses),
      latest: responses[0]?.submittedAt ?? null,
      earliest: responses[responses.length - 1]?.submittedAt ?? null,
    };
  });

  protected readonly aboutYou = computed(() => (this.survey()?.askAboutYou ? aboutYouSummary(this.responses()) : null));

  protected readonly sections = computed(() => {
    const survey = this.survey();
    if (!survey) {
      return [];
    }
    const responses = this.responses();
    const numbers = new Map(numberedQuestions(survey).map((item) => [item.question.id, item.number]));
    const first = survey.askAboutYou ? 2 : 1;
    return survey.steps.map((step, index) => ({
      step,
      number: index + first,
      items: step.questions.map((question) => ({
        question,
        number: numbers.get(question.id) ?? 0,
        choice: isChoice(question) ? choiceSummary(question, responses) : null,
        texts: isChoice(question) ? null : writtenAnswers(question, responses),
      })),
    }));
  });

  protected readonly activeTab = computed(() => (this.tab() === 'people' ? 'people' : 'summary'));
  protected readonly tabs = computed<TabItem[]>(() => [
    { id: 'summary', label: 'Summary' },
    { id: 'people', label: 'People', count: this.responses().length },
  ]);

  protected readonly search = signal('');
  protected readonly people = computed(() => {
    const query = this.search().trim().toLowerCase();
    return query ? this.responses().filter((response) => response.person.name.toLowerCase().includes(query)) : this.responses();
  });

  // ── The drawer ─────────────────────────────────────────────────────────────

  /** The people behind an answer, or everybody's words for a text question. */
  protected readonly listView = computed(() => {
    const survey = this.survey();
    if (!survey) {
      return null;
    }
    const responses = this.responses();
    const chose = parsePair(this.chose());
    if (chose) {
      const described = describeFilter(survey, chose);
      if (!described) {
        return null;
      }
      const question = survey.steps.flatMap((step) => step.questions).find((item) => item.id === chose.questionId);
      const option = question?.options.find((item) => item.id === chose.optionId);
      const rows: PersonRow[] = responses
        .filter((response) => matchesFilter(response, chose))
        .map((response) => ({ response, note: option?.other ? response.answers[chose.questionId]?.other || null : null }));
      // Who answered, counted as the question's card counts them: an answer
      // whose options have all been removed since is no answer any more.
      const answered = question ? choiceSummary(question, responses).answered : responses.filter((response) => response.aboutYou !== null).length;
      return {
        filter: chose as ResultFilter | null,
        title: `Chose “${described.answer}”`,
        subtitle: `${described.question} · ${rows.length} of the ${answered} who answered it`,
        rows,
        back: `All ${rows.length} who chose it`,
      };
    }
    const wrote = this.wrote();
    const found = wrote ? numberedQuestions(survey).find((item) => item.question.id === wrote) : undefined;
    if (found) {
      const byId = new Map(responses.map((response) => [response.id, response]));
      const rows: PersonRow[] = writtenAnswers(found.question, responses).map((answer) => ({ response: byId.get(answer.responseId) as SurveyResponse, note: answer.text }));
      return {
        filter: null as ResultFilter | null,
        title: `Answers to question ${found.number}`,
        subtitle: `${plainText(found.question.text)} · ${rows.length} wrote something`,
        rows,
        back: `All ${rows.length} answers`,
      };
    }
    return null;
  });

  /** One person's survey - within the list it was opened from, or within everybody on the page. */
  protected readonly responseView = computed(() => {
    const id = this.response();
    if (!id) {
      return null;
    }
    const list = this.listView();
    const context = list ? list.rows.map((row) => row.response) : this.responses();
    const response = this.all().find((item) => item.id === id) ?? null;
    const index = context.findIndex((item) => item.id === id);
    return {
      response,
      index,
      count: context.length,
      previous: index > 0 ? context[index - 1].id : null,
      next: index >= 0 && index < context.length - 1 ? context[index + 1].id : null,
      back: list?.back ?? null,
      highlight: parsePair(this.chose()),
    };
  });

  protected readonly drawerHeading = computed(() => {
    const view = this.responseView();
    if (view) {
      return view.response?.person.name ?? 'Not here any more';
    }
    return this.listView()?.title ?? '';
  });

  protected readonly drawerSubheading = computed(() => {
    const view = this.responseView();
    if (view) {
      if (!view.response) {
        return null;
      }
      // A visitor: say what they are, as the lists do. Nobody has an address here (the IAM keeps them).
      return view.response.person.visitor ? 'Not signed in' : null;
    }
    return this.listView()?.subtitle ?? null;
  });

  protected readonly drawerOpen = computed(() => !!this.response() || this.listView() !== null);

  // ── Going places ───────────────────────────────────────────────────────────

  protected setTab(tab: string): void {
    this._go({ tab: tab === 'people' ? 'people' : null });
  }

  protected openChose(questionId: string, optionId: string): void {
    this._go({ chose: `${questionId}:${optionId}`, wrote: null, response: null });
  }

  protected openWrote(questionId: string): void {
    this._go({ wrote: questionId, chose: null, response: null });
  }

  /** A person from the open list: the list stays behind them, for Back. */
  protected openResponse(id: string): void {
    this._go({ response: id });
  }

  /** A person from the page itself: no list behind them. */
  protected openResponseAlone(id: string): void {
    this._go({ response: id, chose: null, wrote: null });
  }

  protected backToList(): void {
    this._go({ response: null });
  }

  protected closeDrawer(): void {
    this._go({ chose: null, wrote: null, response: null });
  }

  /** Narrows the page to the people who gave this answer, on top of any filters there are. */
  protected narrow(questionId: string, optionId: string): void {
    const filter = { questionId, optionId };
    const filters = this.filters().some((item) => samePair(item, filter)) ? this.filters() : [...this.filters(), filter];
    this._go({ filter: this._serialize(filters), chose: null, wrote: null, response: null });
  }

  protected removeFilter(filter: ResultFilter): void {
    this._go({ filter: this._serialize(this.filters().filter((item) => !samePair(item, filter))) });
  }

  /**
   * A chip's remove button: that filter goes. The chip list moves the focus on to the next chip; the last one
   * takes the whole row of filters with it, so the focus goes to the results' tab first - never to the page's start.
   */
  protected removeFilterChip(value: string): void {
    const filter = this.filters().find((item) => pairText(item) === value);
    if (!filter) {
      return;
    }
    if (this.filters().length === 1) {
      this._focusResultsTab();
    }
    this.removeFilter(filter);
  }

  protected clearFilters(): void {
    // "Show everybody" goes with the row it is in: the focus to the results' tab, as for the last chip.
    this._focusResultsTab();
    this._go({ filter: null });
  }

  /** The focus on the tab that is chosen - Summary or People - which stays where the filters' row goes. */
  private _focusResultsTab(): void {
    document.getElementById(`results-tab-${this.activeTab()}`)?.focus();
  }

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected downloadCsv(): void {
    const survey = this.survey();
    if (!survey) {
      return;
    }
    const responses = this.responses();
    const blob = new Blob([responsesCsv(survey, responses)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${survey.slug}-answers-${todayIsoDay()}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    this._toast.success(this.filters().length ? `The ${responses.length} answers that match the filters are downloaded.` : `All ${responses.length} answers are downloaded.`);
  }

  protected async deleteResponse(response: SurveyResponse): Promise<void> {
    const sure = await this._confirm.ask({
      title: `Delete ${response.person.name}'s answers?`,
      message: `They disappear from the results, and ${response.person.name} can take the survey again. This cannot be undone.`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!sure) {
      return;
    }
    try {
      await this._store.deleteResponse(this.surveyId(), response.id);
      this._toast.success(`${response.person.name}'s answers are deleted.`);
      this._go({ response: null });
    } catch (error) {
      this._toast.error(`The answers could not be deleted: ${toApiError(error).message}`);
    }
  }

  private _go(params: Record<string, string | null>): void {
    // Only the address changes, not the page: the reader stays where they
    // were, which the router's scrolling (to the top, after a navigation)
    // would undo - the drawer would close onto a page scrolled back up.
    void this._router.navigate([], { relativeTo: this._route, queryParams: params, queryParamsHandling: 'merge', scroll: 'manual' });
  }

  private _serialize(filters: ResultFilter[]): string | null {
    return filters.length ? filters.map((filter) => `${filter.questionId}:${filter.optionId}`).join(',') : null;
  }
}
