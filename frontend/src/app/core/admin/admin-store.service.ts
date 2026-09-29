import { Injectable, computed, inject, signal } from '@angular/core';
import { ApiError, ApiService, toApiError } from '../api/api.service';
import { AuthService } from '../auth/auth.service';
import { copySurvey, newSurvey } from '../survey/survey-factory';
import { currentStatus, questionCount } from '../survey/survey-outline';
import { Survey, SurveyResponse, SurveySummary } from '../survey/survey.model';

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

/** How long after the last change a save goes: typing a word is one save, not one a letter. */
export const SAVE_DELAY_MS = 700;
/** How long before a save that could not reach the server tries again. */
export const RETRY_DELAY_MS = 5000;

/**
 * The admin area's surveys and answers, kept here while the pages come and go:
 * the list (summaries), each survey that has been opened (whole), and each
 * survey's answers once the results or the editor asked for them.
 *
 * Every change the editor makes goes through updateSurvey(): it shows at once,
 * and is saved a moment later - as the survey was at that moment, made to the
 * revision the page last had from the server. A save never replaces what is
 * being edited: the answer only brings the new revision, so typing goes on
 * undisturbed. Somebody else's save in between is a conflict the editor must
 * settle (take theirs, or keep mine), never a silent overwrite either way.
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

  private readonly _timers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly _dirty = new Set<string>();
  /** What is on its way to the server for a survey: a save, or a change of status. */
  private readonly _inFlight = new Map<string, Promise<void>>();
  private readonly _loads = new Map<string, Promise<Survey | null>>();
  private readonly _responseLoads = new Map<string, Promise<void>>();
  private _summariesLoad: Promise<void> | null = null;
  /** Counts the times everything was let go: an answer to a request from before is not for what is here now. */
  private _generation = 0;
  /** Whose surveys these are: another person signing in (another tab) starts from nothing. */
  private _owner: string | null = null;

  /** Every survey, newest change first; null until the list has come. */
  readonly summaries = this._summaries.asReadonly();
  readonly summariesError = this._summariesError.asReadonly();
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

  /** A change to the survey, shown at once and saved a moment later. */
  updateSurvey(id: string, change: (survey: Survey) => Survey): void {
    const current = this._surveys().get(id);
    if (!current) {
      return;
    }
    this._surveys.update((surveys) => new Map(surveys).set(id, { ...change(current), updatedAt: new Date().toISOString() }));
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

  /** A conflict settled this way: what is here is saved over their version. */
  keepMine(id: string): void {
    const theirs = this.saveStatus(id).theirs;
    const mine = this._surveys().get(id);
    if (theirs && mine) {
      this._surveys.update((surveys) => new Map(surveys).set(id, { ...mine, revision: theirs.revision }));
      this._dirty.add(id);
      this._setSave(id, { state: 'waiting', message: null, theirs: null });
      void this._save(id);
    }
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
      this._surveys.update((surveys) => {
        const here = surveys.get(id);
        return new Map(surveys).set(
          id,
          here ? { ...here, status: saved.status, closesOn: saved.closesOn, openedAt: saved.openedAt, closedAt: saved.closedAt, revision: saved.revision, updatedAt: saved.updatedAt } : saved,
        );
      });
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
          // The server has this version now; what was changed meanwhile goes
          // in the next save, made to the revision it has.
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
            this._setSave(id, { state: 'conflict', message: error.message, theirs: (error.body['survey'] as Survey | undefined) ?? null });
          } else if (error.status === 0 || error.status >= 500) {
            // Out of reach: it tries again by itself.
            this._setSave(id, { state: 'failed', message: error.message, theirs: null });
            this._schedule(id, RETRY_DELAY_MS);
          } else {
            // Refused for what it holds (an address another survey has): the next change tries again.
            this._setSave(id, {
              state: 'failed',
              message: error.status === 401 ? 'You are signed out, so the changes cannot be saved. Sign in again in another tab - they stay here meanwhile.' : error.message,
              theirs: null,
            });
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

  private _put(survey: Survey): void {
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
    this._inFlight.clear();
    this._loads.clear();
    this._responseLoads.clear();
    this._summariesLoad = null;
    this._summaries.set(null);
    this._summariesError.set(null);
    this._surveys.set(new Map());
    this._failed.set(new Map());
    this._responses.set(new Map());
    this._responsesFailed.set(new Map());
    this._saves.set(new Map());
  }
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

function without<V>(map: ReadonlyMap<string, V>, key: string): ReadonlyMap<string, V> {
  if (!map.has(key)) {
    return map;
  }
  const copy = new Map(map);
  copy.delete(key);
  return copy;
}
