import { Injectable, computed, inject, signal } from '@angular/core';
import { type AdminLanguage } from '@anotoki/lib/translations';
import { ApiError, ApiService, toApiError } from '../api/api.service';
import { AuthService } from '../auth/auth.service';
import { changedTranslations, mergeTranslations, pruneTranslations, translationCodes, translationOf } from '../survey/localize';
import { copySurvey, newSurvey } from '../survey/survey-factory';
import { currentStatus, questionCount } from '../survey/survey-outline';
import { Survey, SurveyResponse, SurveySummary, SurveyTranslation } from '../survey/survey.model';

/** Where a survey's changes are: all on the server, about to go, going, refused, or in conflict with somebody else's. */
export type SaveState = 'saved' | 'waiting' | 'saving' | 'failed' | 'conflict';

export interface SaveStatus {
  state: SaveState;
  /** Why the last save did not go through, in the server's words. */
  message: string | null;
  /** In a conflict: the survey as somebody else saved it. */
  theirs: Survey | null;
}

const SAVED: SaveStatus = { state: 'saved', message: null, theirs: null };

/**
 * What of a survey was changed on this page and is not on the server yet:
 * the survey itself (its questions, its own texts, its settings, a language
 * removed), and the languages whose translated texts were written (one added
 * here among them).
 */
export interface UnsavedChanges {
  survey: boolean;
  languages: string[];
}

/** How long after the last change a save goes: typing a word is one save, not one a letter. */
export const SAVE_DELAY_MS = 700;
/** How long before a save that could not reach the server tries again. */
export const RETRY_DELAY_MS = 5000;
/**
 * What a save says when the server (or anything before it) answers 413: a
 * survey and all its translations are one save of at most 2 MB
 * (SURVEY_BODY_LIMIT in the backend). Sending the same again would be refused
 * the same, so it is not retried: the next change is the next try.
 */
export const SURVEY_TOO_LARGE = 'This survey with its translations is larger than the site keeps in one survey (2 MB).';

/**
 * The admin area's surveys and answers, kept here while the pages come and go:
 * the list (summaries), each survey that has been opened (whole), each
 * survey's answers once the results or the editor asked for them, and the
 * languages the site has (asked for with each survey loaded afresh: a survey
 * is written in one and translated into others).
 *
 * Every change the editor makes goes through updateSurvey(): it shows at once,
 * and is saved a moment later - as the survey was at that moment, made to the
 * revision the page last had from the server. What a change removes takes its
 * translated texts with it (pruneTranslations). A save never replaces what is
 * being edited: the answer only brings the new revision, so typing goes on
 * undisturbed. Somebody else's save in between is a conflict the editor must
 * settle (take theirs, keep mine - or, when only translated texts were
 * written here, keep those in their version), never a silent overwrite either
 * way. Whichever way it is settled, the translations are brought together
 * text by text (mergeTranslations): what this page never changed stays as the
 * other person saved it - an author's page left open does not undo a
 * translator's work, nor one translator another's. For that the store keeps
 * each survey as the server last had it from this page - and what is not
 * saved yet is never remembered beside it, only worked out from the two
 * (unsavedChanges()): the editor's page comes and goes, the documents stay.
 *
 * One thing at a time goes to the server for a survey - a save, or opening or
 * closing it (which is a new revision too); whatever is asked for meanwhile
 * goes straight after, made to the revision the one before brought back.
 */
@Injectable({ providedIn: 'root' })
export class AdminStore {
  private readonly _api = inject(ApiService);
  private readonly _auth = inject(AuthService);

  private readonly _summaries = signal<SurveySummary[] | null>(null);
  private readonly _summariesError = signal<ApiError | null>(null);
  private readonly _surveys = signal<ReadonlyMap<string, Survey>>(new Map());
  private readonly _failed = signal<ReadonlyMap<string, ApiError>>(new Map());
  private readonly _responses = signal<ReadonlyMap<string, SurveyResponse[]>>(new Map());
  private readonly _responsesFailed = signal<ReadonlyMap<string, ApiError>>(new Map());
  private readonly _saves = signal<ReadonlyMap<string, SaveStatus>>(new Map());
  private readonly _languages = signal<AdminLanguage[] | null>(null);

  /**
   * Each survey as the server last had it from this page: as it was loaded,
   * or as the last save that went through sent it. What differs from it here
   * is what this page changed - which is what is not saved yet
   * (unsavedChanges()), and what a conflict keeps of "mine". A signal like
   * the surveys themselves: what the page says of a conflict is worked out
   * from the two.
   */
  private readonly _server = signal<ReadonlyMap<string, Survey>>(new Map());
  private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _dirty = new Set<string>();
  /** What is on its way to the server for a survey: a save, or a change of status. */
  private readonly _inFlight = new Map<string, Promise<void>>();
  private readonly _loads = new Map<string, Promise<Survey | null>>();
  private readonly _responseLoads = new Map<string, Promise<void>>();
  private _summariesLoad: Promise<void> | null = null;
  private _languagesLoad: Promise<void> | null = null;
  /** Counts the times everything was let go: an answer to a request from before is not for what is here now. */
  private _generation = 0;
  /** Whose surveys these are: another person signing in (another tab) starts from nothing. */
  private _owner: string | null = null;

  /** Every survey, newest change first; null until the list has come. */
  readonly summaries = this._summaries.asReadonly();
  readonly summariesError = this._summariesError.asReadonly();
  /**
   * Every language the site has - the hidden ones too - in the order a chooser
   * shows them; null until they have come. A survey names its language and
   * its translations by code: the names, and whether people are offered a
   * language, are here.
   */
  readonly languages = this._languages.asReadonly();
  /** Some change is not on the server yet - leaving the page asks first. */
  readonly unsaved = computed(() => [...this._saves().values()].some((status) => status.state !== 'saved'));

  constructor() {
    this._owner = this._auth.person()?.id ?? null;
    this._auth.onAuthChange(() => {
      // Only somebody else signing in lets go of what is here. Signing out -
      // here, in another tab, or the IAM ending the session - keeps it all:
      // changes not saved yet stay, the browser still asks before leaving
      // them, and signing in again as the same person saves them.
      const owner = this._auth.person()?.id ?? null;
      if (owner !== null && owner !== this._owner) {
        const hadOwner = this._owner !== null;
        this._owner = owner;
        if (hadOwner) {
          this._clear();
        }
      }
    });
    globalThis.addEventListener?.('beforeunload', (event: BeforeUnloadEvent) => {
      if (this.unsaved()) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }

  // ── The list ───────────────────────────────────────────────────────────────

  /** The list, asked for again - what is here meanwhile stays shown. */
  loadSummaries(): Promise<void> {
    const generation = this._generation;
    this._summariesLoad ??= this._api
      .summaries()
      .then(
        (summaries) => {
          if (generation === this._generation) {
            this._summaries.set(summaries);
            this._summariesError.set(null);
          }
        },
        (error: unknown) => {
          if (generation === this._generation) {
            this._summariesError.set(toApiError(error));
          }
        },
      )
      .finally(() => (this._summariesLoad = null));
    return this._summariesLoad;
  }

  /** How many have answered: the answers themselves when they are here, else the list's count. */
  responseCount(id: string): number {
    return this._responses().get(id)?.length ?? this._summaries()?.find((summary) => summary.id === id)?.responses ?? 0;
  }

  // ── The languages ──────────────────────────────────────────────────────────

  /**
   * The languages: every survey that is loaded asks, and only the first time
   * (or one after a failure) goes to the server. `fresh` asks again - with
   * each survey loaded afresh (every entry to the editor or the results: a
   * language added, offered or hidden since, in another tab or by somebody
   * else, is then known here too), when a conflict brings a language this
   * list lacks, and for the page that has just added, hidden or deleted one.
   * One request at a time. What is here meanwhile stays; a failure leaves it
   * as it was, to be tried again with the next survey.
   */
  loadLanguages(fresh = false): Promise<void> {
    if (this._languages() !== null && !fresh) {
      return Promise.resolve();
    }
    if (!this._languagesLoad) {
      const generation = this._generation;
      const load: Promise<void> = this._call(this._api.languages())
        .then(
          (languages) => {
            if (generation === this._generation) {
              this._languages.set(languages);
            }
          },
          () => undefined,
        )
        .finally(() => {
          if (this._languagesLoad === load) {
            this._languagesLoad = null;
          }
        });
      this._languagesLoad = load;
    }
    return this._languagesLoad;
  }

  // ── One survey ─────────────────────────────────────────────────────────────

  survey(id: string): Survey | undefined {
    return this._surveys().get(id);
  }

  /** Why the survey could not be loaded - `not_found` for one that is not there. */
  loadError(id: string): ApiError | null {
    return this._failed().get(id) ?? null;
  }

  /**
   * The survey from the server: once, or again with `fresh` - but never over
   * changes of its own that have not been saved yet, and never over a newer
   * version than the one that comes (a save of this page's that finished while
   * the survey was on its way).
   */
  load(id: string, fresh = false): Promise<Survey | null> {
    // A survey asked for again may name a language the site has gained since: the list with it.
    void this.loadLanguages(fresh);
    const here = this._surveys().get(id);
    if (here && (!fresh || this._busy(id))) {
      return Promise.resolve(here);
    }
    let load = this._loads.get(id);
    if (!load) {
      const generation = this._generation;
      load = this._api
        .survey(id)
        .then(
          (survey) => {
            if (generation !== this._generation) {
              return null;
            }
            const now = this._surveys().get(id);
            if (now && (this._busy(id) || now.revision >= survey.revision)) {
              return now;
            }
            this._put(survey);
            this._setFailed(id, null);
            return survey;
          },
          (error: unknown) => {
            if (generation === this._generation) {
              this._setFailed(id, toApiError(error));
            }
            return null;
          },
        )
        .finally(() => {
          if (this._loads.get(id) === load) {
            this._loads.delete(id);
          }
        });
      this._loads.set(id, load);
    }
    return load;
  }

  saveStatus(id: string): SaveStatus {
    return this._saves().get(id) ?? SAVED;
  }

  /**
   * What of the survey was changed here and is not on the server yet - read
   * from the documents every time (the survey as it is here against the
   * survey as the server last had it from this page), never remembered: the
   * editor's page may be left and entered again with changes still waiting,
   * and whatever it remembered would be gone while they are not.
   *
   * `survey`: anything of the survey itself differs - or a language the
   * server has is gone here. `languages`: the translations written into (one
   * added here too). A text typed and taken back is no change.
   */
  unsavedChanges(id: string): UnsavedChanges {
    const mine = this._surveys().get(id);
    const base = this._server().get(id);
    if (!mine) {
      return { survey: false, languages: [] };
    }
    if (!base) {
      return { survey: true, languages: [] };
    }
    return {
      survey: !sameSurveyItself(base, mine) || translationCodes(base).some((code) => translationOf(mine, code) === undefined),
      languages: changedTranslations(base, mine),
    };
  }

  /**
   * A change to the survey, shown at once and saved a moment later. Whatever
   * the change removed - a step, a question, an option, a picture - its texts
   * in every translation go with it.
   */
  updateSurvey(id: string, change: (survey: Survey) => Survey): void {
    const current = this._surveys().get(id);
    if (!current) {
      return;
    }
    this._surveys.update((surveys) => new Map(surveys).set(id, { ...pruneTranslations(change(current)), updatedAt: new Date().toISOString() }));
    this._dirty.add(id);
    // In a conflict the changes wait until the editor settles it.
    if (this.saveStatus(id).state !== 'conflict') {
      this._setSave(id, { state: 'waiting', message: null, theirs: null });
      this._schedule(id, SAVE_DELAY_MS);
    }
  }

  /** Saves what is waiting now; true when nothing is left unsaved. */
  async flush(id: string): Promise<boolean> {
    this._unschedule(id);
    await this._save(id);
    return this.saveStatus(id).state === 'saved';
  }

  /** Every survey's waiting changes saved now; true when nothing anywhere is left unsaved. */
  async flushAll(): Promise<boolean> {
    await Promise.all([...this._saves().keys()].map((id) => this.flush(id)));
    return !this.unsaved();
  }

  /** A conflict settled their way: their version replaces the changes made here since the last save. */
  takeTheirs(id: string): void {
    const theirs = this.saveStatus(id).theirs;
    if (theirs) {
      this._unschedule(id);
      this._dirty.delete(id);
      this._put(theirs);
      this._setSave(id, SAVED);
    }
  }

  /**
   * In a conflict: whether keepMine() keeps the translated texts of their
   * version that were not changed here. It does whenever the two versions are
   * written in the same language. When they are not, the language one is
   * written in may be a translation of the other - there are no two
   * translations of the same texts to bring together - and what is here is
   * saved whole. False when there is no conflict.
   */
  keepsTheirTranslations(id: string): boolean {
    const theirs = this.saveStatus(id).theirs;
    const mine = this._surveys().get(id);
    return !!theirs && !!mine && this._server().has(id) && theirs.language === mine.language;
  }

  /**
   * In a conflict: whether the server would refuse what is here saved over
   * their version. It does when the two are written in different languages
   * and both hold translations - the three conditions of surveySave() in
   * backend/api/surveys.php: the language a survey is written in changes
   * only while it has no translations. keepMine() then does nothing, and the
   * editor does not offer it: removing the translations here (the change
   * waits, like every change made in a conflict) makes it a save the server
   * takes. False when there is no conflict.
   */
  mineWouldBeRefused(id: string): boolean {
    const theirs = this.saveStatus(id).theirs;
    const mine = this._surveys().get(id);
    return !!theirs && !!mine && theirs.language !== mine.language && translationCodes(theirs).length > 0 && translationCodes(mine).length > 0;
  }

  /**
   * In a conflict keepMine() settles by bringing the translations together:
   * the languages their version has that were removed here since the server
   * last had the survey from this page. They stay removed when mine is saved
   * - with whatever the other person wrote into them meanwhile, which the
   * editor says before it asks. Empty when there is no conflict, or mine
   * would be saved whole.
   */
  removedHereLanguages(id: string): string[] {
    const theirs = this.saveStatus(id).theirs;
    const mine = this._surveys().get(id);
    const base = this._server().get(id);
    if (!theirs || !mine || !base || !this.keepsTheirTranslations(id)) {
      return [];
    }
    return translationCodes(theirs).filter((code) => translationOf(mine, code) === undefined && translationOf(base, code) !== undefined);
  }

  /**
   * In a conflict: the languages this page has that their version removed
   * since the server last had the survey from this page. Keeping the texts
   * of one (keepMyTranslations()) puts the whole translation back as it is
   * here. Empty when there is no conflict.
   */
  removedThereLanguages(id: string): string[] {
    const theirs = this.saveStatus(id).theirs;
    const mine = this._surveys().get(id);
    const base = this._server().get(id);
    if (!theirs || !mine || !base) {
      return [];
    }
    return translationCodes(mine).filter((code) => translationOf(base, code) !== undefined && translationOf(theirs, code) === undefined);
  }

  /**
   * A conflict settled this way: what is here is saved over their version -
   * the questions, the survey's own texts and its settings. The translations
   * are brought together text by text (mergeTranslations, saved with mine):
   * mine where this page changed something since the server last had the
   * survey from it, theirs everywhere else - so a page that never touched a
   * translation does not undo what a translator saved meanwhile. Except
   * where their translation is of something my questions no longer say: a
   * step, question, option or picture their version removed or reworded
   * keeps its translated text as it is here, wherever there is one here -
   * theirs would leave a question of mine untranslated, or put it beside the
   * translation of another. A language removed here stays removed
   * (removedHereLanguages()).
   *
   * Only when the two versions are written in different languages is what is
   * here saved whole (keepsTheirTranslations() says which it will be) - and
   * not at all while both hold translations: the server would refuse it
   * (mineWouldBeRefused()), so nothing is sent and the conflict stays, with
   * their version still there to take.
   */
  keepMine(id: string): void {
    const theirs = this.saveStatus(id).theirs;
    const mine = this._surveys().get(id);
    if (theirs && mine && !this.mineWouldBeRefused(id)) {
      const base = this._server().get(id);
      const merging = base !== undefined && this.keepsTheirTranslations(id);
      const kept = merging ? pruneTranslations({ ...mine, translations: mergeTranslations(base, mine, theirs, 'mine') }) : mine;
      this._surveys.update((surveys) => new Map(surveys).set(id, { ...kept, revision: theirs.revision }));
      // The server has their version now: what differs from it is what goes.
      this._setServer(id, theirs);
      this._dirty.add(id);
      this._setSave(id, { state: 'waiting', message: null, theirs: null });
      void this._save(id);
    }
  }

  /**
   * A conflict met while translating, settled by language: the survey as
   * somebody else saved it, with the texts translated here into `codes` put
   * into it - saved to their revision. Text by text (mergeTranslations, saved
   * with theirs): a text of those languages changed here since the server last had the survey
   * from this page is mine - over theirs, when both changed the same one -
   * and every other text is theirs, so another translator's work in the same
   * language stays. A language their version does not have (any more) comes
   * back as it is here. Everything else is theirs; translated texts for what
   * their version no longer has are dropped (as after every change, and again
   * by the server).
   *
   * Answers the languages that were kept. One that cannot be - the survey
   * here has no translation into it, or their version is written in that very
   * language - is left out; with none to keep nothing happens, and the
   * conflict stays for the editor to settle.
   */
  keepMyTranslations(id: string, codes: readonly string[]): string[] {
    const theirs = this.saveStatus(id).theirs;
    const mine = this._surveys().get(id);
    if (!theirs || !mine) {
      return [];
    }
    const kept = codes.filter((code, index) => codes.indexOf(code) === index && translationOf(mine, code) !== undefined && code !== theirs.language);
    if (kept.length === 0) {
      return [];
    }
    const base = this._server().get(id);
    const merged = base ? mergeTranslations(base, mine, theirs, 'theirs') : {};
    // The language as the merge left it; whole as it is here when the merge let it go (they removed it) or had nothing to go by.
    const keeping = new Map(kept.map((code): [string, SurveyTranslation] => [code, Object.hasOwn(merged, code) ? merged[code] : mine.translations[code]]));
    // Built from entries, never by assigning: a code is a key like any other. Their order, then the languages only here.
    const translations = Object.fromEntries([
      ...Object.entries(theirs.translations ?? {}).map(([code, translation]): [string, SurveyTranslation] => [code, keeping.get(code) ?? translation]),
      ...[...keeping].filter(([code]) => !translationOf(theirs, code)),
    ]);
    this._unschedule(id);
    this._surveys.update((surveys) => new Map(surveys).set(id, { ...pruneTranslations({ ...theirs, translations }), updatedAt: new Date().toISOString() }));
    // The server has their version now: what differs from it is what goes.
    this._setServer(id, theirs);
    this._touchSummary(this._surveys().get(id) ?? theirs);
    this._dirty.add(id);
    this._setSave(id, { state: 'waiting', message: null, theirs: null });
    void this._save(id);
    return kept;
  }

  // ── Whole surveys ──────────────────────────────────────────────────────────

  /** A new draft, kept by the server before anybody edits it. */
  async create(): Promise<Survey> {
    const created = await this._call(this._api.createSurvey(newSurvey(this._slugs())));
    this._put(created);
    this._summaries.update((summaries) => (summaries ? [summaryOf(created, 0), ...summaries] : summaries));
    return created;
  }

  /** A new draft asking everything the survey asks, without its answers - beside the original in the list. */
  async copy(id: string): Promise<Survey> {
    await this.flush(id);
    const original = this._surveys().get(id) ?? (await this.load(id));
    if (!original) {
      throw this.loadError(id) ?? new ApiError(404, 'not_found', 'There is no such survey.');
    }
    const created = await this._call(this._api.createSurvey(copySurvey(original, this._slugs())));
    this._put(created);
    this._summaries.update((summaries) => {
      if (!summaries) {
        return summaries;
      }
      const at = summaries.findIndex((summary) => summary.id === id);
      const copy = [...summaries];
      copy.splice(at + 1, 0, summaryOf(created, 0));
      return copy;
    });
    return created;
  }

  /** Deletes the survey and every answer it was given (administrators only - the server checks). */
  async delete(id: string): Promise<void> {
    await this._call(this._api.deleteSurvey(id));
    this._unschedule(id);
    this._dirty.delete(id);
    this._server.update((server) => without(server, id));
    this._surveys.update((surveys) => without(surveys, id));
    this._responses.update((responses) => without(responses, id));
    this._saves.update((saves) => without(saves, id));
    this._summaries.update((summaries) => summaries?.filter((summary) => summary.id !== id) ?? null);
  }

  /**
   * Opens, closes or reopens it - after the changes waiting here have reached
   * the server, which checks the survey it has. Reopening a survey whose last
   * day has passed drops the day, or it would close again at once.
   *
   * It is a new revision on the server; saves asked for meanwhile wait for it,
   * and are made to the revision it brings back.
   */
  async setStatus(id: string, status: 'open' | 'closed'): Promise<void> {
    if (!(await this.flush(id))) {
      throw new ApiError(409, 'unsaved', this.saveStatus(id).message ?? 'The latest changes are not saved yet.');
    }
    const survey = this._surveys().get(id);
    const closesOn = status === 'open' && survey && currentStatus({ status: 'open', closesOn: survey.closesOn }) !== 'open' ? null : undefined;
    const generation = this._generation;

    const work = (async () => {
      const saved = await this._call(this._api.setStatus(id, status, closesOn));
      if (generation !== this._generation) {
        return;
      }
      const opened = { status: saved.status, closesOn: saved.closesOn, openedAt: saved.openedAt, closedAt: saved.closedAt, revision: saved.revision, updatedAt: saved.updatedAt };
      this._surveys.update((surveys) => {
        const here = surveys.get(id);
        return new Map(surveys).set(id, here ? { ...here, ...opened } : saved);
      });
      // What the server has is what it had, opened or closed.
      const server = this._server().get(id);
      this._setServer(id, server ? { ...server, ...opened } : saved);
      this._touchSummary(this._surveys().get(id) ?? saved);
    })();
    const done = work.then(
      () => undefined,
      () => undefined,
    );
    this._inFlight.set(id, done);
    try {
      await work;
    } finally {
      if (this._inFlight.get(id) === done) {
        this._inFlight.delete(id);
      }
    }
  }

  // ── The answers ────────────────────────────────────────────────────────────

  /** Every filled survey of a survey, newest first; undefined until they have come. */
  responses(id: string): SurveyResponse[] | undefined {
    return this._responses().get(id);
  }

  responsesError(id: string): ApiError | null {
    return this._responsesFailed().get(id) ?? null;
  }

  /** The answers from the server (again, with `fresh`). */
  loadResponses(id: string, fresh = false): Promise<void> {
    if (this._responses().has(id) && !fresh) {
      return Promise.resolve();
    }
    let load = this._responseLoads.get(id);
    if (!load) {
      const generation = this._generation;
      load = this._api
        .responses(id)
        .then(
          (responses) => {
            if (generation !== this._generation) {
              return;
            }
            this._responses.update((map) => new Map(map).set(id, responses));
            this._responsesFailed.update((map) => without(map, id));
            this._summaries.update((summaries) => summaries?.map((summary) => (summary.id === id ? { ...summary, responses: responses.length } : summary)) ?? null);
          },
          (error: unknown) => {
            if (generation === this._generation) {
              this._responsesFailed.update((map) => new Map(map).set(id, toApiError(error)));
            }
          },
        )
        .finally(() => {
          if (this._responseLoads.get(id) === load) {
            this._responseLoads.delete(id);
          }
        });
      this._responseLoads.set(id, load);
    }
    return load;
  }

  /** Deletes one person's answers (administrators only): they may take the survey again. */
  async deleteResponse(surveyId: string, responseId: string): Promise<void> {
    await this._call(this._api.deleteResponse(responseId));
    this._responses.update((map) => {
      const list = map.get(surveyId);
      return list
        ? new Map(map).set(
            surveyId,
            list.filter((response) => response.id !== responseId),
          )
        : map;
    });
    this._summaries.update((summaries) => summaries?.map((summary) => (summary.id === surveyId ? { ...summary, responses: Math.max(0, summary.responses - 1) } : summary)) ?? null);
  }

  // ── Saving ─────────────────────────────────────────────────────────────────

  private _schedule(id: string, delay: number): void {
    this._unschedule(id);
    this._timers.set(
      id,
      setTimeout(() => {
        this._timers.delete(id);
        void this._save(id);
      }, delay),
    );
  }

  private _unschedule(id: string): void {
    clearTimeout(this._timers.get(id));
    this._timers.delete(id);
  }

  /** One thing on its way at a time for a survey; what changes meanwhile goes in the next save. */
  private _save(id: string): Promise<void> {
    const running = this._inFlight.get(id);
    if (running) {
      // Asked for while one is on its way: the rest goes straight after it.
      return running.then(() => {
        if (!this._dirty.has(id) || this.saveStatus(id).state === 'conflict') {
          return undefined;
        }
        this._unschedule(id);
        return this._save(id);
      });
    }
    const survey = this._surveys().get(id);
    if (!survey || !this._dirty.has(id) || this.saveStatus(id).state === 'conflict') {
      return Promise.resolve();
    }
    this._dirty.delete(id);
    this._setSave(id, { state: 'saving', message: null, theirs: null });
    const generation = this._generation;

    const save = this._api
      .saveSurvey(survey, survey.revision)
      .then(
        (saved) => {
          // Let go of meanwhile, or deleted: nothing here to bring in line.
          if (generation !== this._generation || !this._surveys().has(id)) {
            return;
          }
          // The server has this version now - the document that was sent, so
          // that what it cleaned on the way in (a trimmed line) never reads
          // as something changed here; what was changed meanwhile goes in the
          // next save, made to the revision it has.
          this._setServer(id, { ...survey, revision: saved.revision });
          this._surveys.update((surveys) => {
            const here = surveys.get(id);
            return here ? new Map(surveys).set(id, { ...here, revision: saved.revision }) : surveys;
          });
          this._touchSummary({ ...survey, revision: saved.revision, updatedAt: saved.updatedAt });
          if (this._dirty.has(id)) {
            this._setSave(id, { state: 'waiting', message: null, theirs: null });
            this._schedule(id, SAVE_DELAY_MS);
          } else {
            this._setSave(id, SAVED);
          }
        },
        (failure: unknown) => {
          if (generation !== this._generation || !this._surveys().has(id)) {
            return;
          }
          const error = toApiError(failure);
          this._dirty.add(id);
          if (error.code === 'conflict') {
            const theirs = (error.body['survey'] as Survey | undefined) ?? null;
            this._setSave(id, { state: 'conflict', message: error.message, theirs });
            // Their version may be written in, or translated into, a language the site gained after the list came.
            if (theirs && this._languagesLack(theirs)) {
              void this.loadLanguages(true);
            }
          } else if (error.status === 0 || error.status >= 500) {
            // Out of reach: it tries again by itself.
            this._setSave(id, { state: 'failed', message: error.message, theirs: null });
            this._schedule(id, RETRY_DELAY_MS);
          } else {
            // Refused for what it holds (an address another survey has) or for
            // its size: never sent again as it is - the next change tries again.
            this._setSave(id, { state: 'failed', message: refusalMessage(error), theirs: null });
          }
        },
      )
      .finally(() => {
        if (this._inFlight.get(id) === save) {
          this._inFlight.delete(id);
        }
      });
    this._inFlight.set(id, save);
    return save;
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  /** Changes of this page's not on the server yet, or on their way there. */
  private _busy(id: string): boolean {
    return this._dirty.has(id) || this._inFlight.has(id) || this.saveStatus(id).state !== 'saved';
  }

  /** The list of languages here does not hold one the survey is written in or translated into. */
  private _languagesLack(survey: Survey): boolean {
    const known = new Set((this._languages() ?? []).map((language) => language.code));
    return [survey.language, ...translationCodes(survey)].some((code) => !known.has(code));
  }

  private _setServer(id: string, survey: Survey): void {
    this._server.update((server) => new Map(server).set(id, survey));
  }

  /** A survey as the server has it: shown, and remembered as what the server last had from this page. */
  private _put(survey: Survey): void {
    this._setServer(survey.id, survey);
    this._surveys.update((surveys) => new Map(surveys).set(survey.id, survey));
    this._touchSummary(survey);
  }

  /** The list, brought in line with a survey that changed here. */
  private _touchSummary(survey: Survey): void {
    this._summaries.update((summaries) => summaries?.map((summary) => (summary.id === survey.id ? summaryOf(survey, summary.responses) : summary)) ?? null);
  }

  private _setFailed(id: string, error: ApiError | null): void {
    this._failed.update((map) => (error ? new Map(map).set(id, error) : without(map, id)));
  }

  private _setSave(id: string, status: SaveStatus): void {
    this._saves.update((map) => (status.state === 'saved' ? without(map, id) : new Map(map).set(id, status)));
  }

  /** The addresses every survey has, for a new one's to differ from. */
  private _slugs(): string[] {
    return [...(this._summaries() ?? []).map((summary) => summary.slug), ...[...this._surveys().values()].map((survey) => survey.slug)];
  }

  private async _call<T>(request: Promise<T>): Promise<T> {
    try {
      return await request;
    } catch (error) {
      throw toApiError(error);
    }
  }

  /** Everything let go - another person signed in. Answers still on their way are ignored when they come. */
  private _clear(): void {
    this._generation++;
    for (const id of [...this._timers.keys()]) {
      this._unschedule(id);
    }
    this._dirty.clear();
    this._server.set(new Map());
    this._inFlight.clear();
    this._loads.clear();
    this._responseLoads.clear();
    this._summariesLoad = null;
    this._languagesLoad = null;
    this._languages.set(null);
    this._summaries.set(null);
    this._summariesError.set(null);
    this._surveys.set(new Map());
    this._failed.set(new Map());
    this._responses.set(new Map());
    this._responsesFailed.set(new Map());
    this._saves.set(new Map());
  }
}

/** Why a save was refused, for the editor: the server's words, but for the two the page words itself. */
function refusalMessage(error: ApiError): string {
  if (error.status === 401) {
    return 'You are signed out, so the changes cannot be saved. Sign in again in another tab - they stay here meanwhile.';
  }
  // By its status: a 413 may come from the web server in front of the API, with no words of the API's.
  return error.status === 413 ? SURVEY_TOO_LARGE : error.message;
}

function summaryOf(survey: Survey, responses: number): SurveySummary {
  return {
    id: survey.id,
    slug: survey.slug,
    title: survey.title,
    status: survey.status,
    closesOn: survey.closesOn,
    createdAt: survey.createdAt,
    updatedAt: survey.updatedAt,
    openedAt: survey.openedAt,
    closedAt: survey.closedAt,
    revision: survey.revision,
    steps: survey.steps.length,
    questions: questionCount(survey),
    responses,
  };
}

/** What of a survey is not "the survey itself": its translations are compared language by language, and the other two change with every save. */
const NOT_THE_SURVEY_ITSELF: ReadonlySet<string> = new Set(['translations', 'revision', 'updatedAt']);

/** Two versions of a survey say the same in everything but their translations (and the revision, and when they were changed). */
function sameSurveyItself(one: Survey, other: Survey): boolean {
  const itself = (survey: Survey) => Object.fromEntries(Object.entries(survey).filter(([key]) => !NOT_THE_SURVEY_ITSELF.has(key)));
  return sameJson(itself(one), itself(other));
}

/**
 * Two values say the same as JSON: lists in their order, objects whatever
 * the order of their keys (one version came from the server, the other was
 * put together here), a key with nothing under it as good as none.
 */
function sameJson(one: unknown, other: unknown): boolean {
  if (one === other) {
    return true;
  }
  if (typeof one !== 'object' || typeof other !== 'object' || one === null || other === null) {
    return false;
  }
  if (Array.isArray(one) || Array.isArray(other)) {
    return Array.isArray(one) && Array.isArray(other) && one.length === other.length && one.every((item, index) => sameJson(item, other[index]));
  }
  const entries = (value: object) => Object.entries(value).filter(([, held]) => held !== undefined);
  const theirs = new Map(entries(other));
  const mine = entries(one);
  return mine.length === theirs.size && mine.every(([key, held]) => theirs.has(key) && sameJson(held, theirs.get(key)));
}

function without<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  if (!map.has(key)) {
    return map;
  }
  const copy = new Map(map);
  copy.delete(key);
  return copy;
}
