import { HttpClient, HttpContext, HttpContextToken, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { AdminLanguage, LanguageChanges, NewLanguage, TranslationChanges, TranslationGrid } from '../i18n/translation.model';
import { AboutYou, Answer, Survey, SurveyImage, SurveyResponse, SurveyStatus, SurveySummary } from '../survey/survey.model';

/**
 * A refusal from the API, in the one shape it answers with: {error, code} and
 * whatever else the code needs (the question an answer failed on, the survey
 * as somebody else saved it). Status 0, code `offline`: no answer at all.
 * `retryAfter`: the seconds its `Retry-After` header asked to wait, when it
 * had one (the move after a sign-in, the limits on new visitors).
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
    readonly retryAfter: number | null = null,
  ) {
    super(message);
  }
}

/** The header a visitor's key travels in, both ways (core/auth/visitor-key.ts). */
export const VISITOR_KEY_HEADER = 'X-Visitor-Key';

/** Who a request is for: the signed-in person, or the visitor this browser is (or becomes, with its first answers). */
export type Caller = 'person' | 'visitor';

/**
 * Who a request of the site's own API is for, decided when it is ISSUED -
 * from the app's state then, never from whether a token happens to be there
 * when it leaves (authInterceptor reads it):
 *
 *   'person'   the token, or the request is never sent: it fails at once as a
 *              401 sign_in_required - a person's answers never go out as
 *              nobody's, and never make a visitor
 *   'visitor'  the visitor key (to /api/surveys, while the site does not
 *              require a sign-in), never a token
 *   null       a request this service did not mark: decided by the
 *              interceptor as it is handed over
 */
export const ISSUED_AS = new HttpContextToken<Caller | null>(() => null);

/**
 * The one request that carries the person's token and the visitor's key
 * together - the move after a sign-in: the interceptor adds the token and
 * leaves the key the request set itself.
 */
export const CARRIES_VISITOR_KEY = new HttpContextToken<boolean>(() => false);

/** A request's context saying who it is for. */
export function issuedAs(caller: Caller): HttpContext {
  return new HttpContext().set(ISSUED_AS, caller);
}

/** What the move after a sign-in did: whether the key was still a visitor's, how many surveys' answers became the person's, and how many kept the person's own. */
export interface VisitorMove {
  found: boolean;
  moved: number;
  kept: number;
}

/** A survey for the people taking it, and when this person - or this browser's visitor - answered it (null: not yet). */
export interface ParticipantSurvey {
  survey: Survey;
  answeredAt: string | null;
}

/**
 * A filled survey as it is sent: the answers, gender and age when asked, the
 * language the survey's texts were read in, and when the person began.
 */
export interface ResponseSubmission {
  aboutYou: AboutYou | null;
  answers: Record<string, Answer>;
  /**
   * The language the survey's texts were shown in at the moment of sending
   * (what localizedSurvey() reported): the survey's own, or one of its
   * translations. The server keeps it when it is one of those, and never
   * refuses the answers over it.
   */
  language: string;
  startedAt: string;
}

/**
 * The backend's API (backend/api/routes/), one method a route. Every call
 * resolves with what the route answers or rejects with an ApiError. The access
 * token - or the visitor key - is added by the interceptor, by whom the request
 * says it was issued for (ISSUED_AS): the three routes of the people taking
 * surveys are the person's while somebody is signed in and the visitor's
 * otherwise, the move is always the person's, and the rest (the admin area)
 * are decided as they are handed over - which, for a call made here, is the
 * same moment.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly _http = inject(HttpClient);
  private readonly _auth = inject(AuthService);

  // ── For the people taking surveys ────────────────────────────────────────

  async openSurveys(): Promise<ParticipantSurvey[]> {
    return (await this._call(this._http.get<{ surveys: ParticipantSurvey[] }>('/api/surveys', { context: this._asTaker() }))).surveys;
  }

  surveyBySlug(slug: string): Promise<ParticipantSurvey> {
    return this._call(this._http.get<ParticipantSurvey>(`/api/surveys/${encodeURIComponent(slug)}`, { context: this._asTaker() }));
  }

  /**
   * The answers. Sent by nobody yet (no token, no key) while the site does not
   * require a sign-in, the answer that keeps them makes this browser a visitor:
   * its key comes in the `X-Visitor-Key` header, which the interceptor keeps.
   * ApiError 429 `too_many_visitors` when too many new visitors came lately.
   */
  submit(slug: string, response: ResponseSubmission): Promise<{ id: string; submittedAt: string }> {
    return this._call(this._http.post<{ id: string; submittedAt: string }>(`/api/surveys/${encodeURIComponent(slug)}/responses`, response, { context: this._asTaker() }));
  }

  /**
   * After a sign-in: what this browser answered as a visitor becomes the
   * person's (core/auth/visitor-key.ts) - the token and the key together, the
   * only request that carries both. ApiError 422 `invalid_visitor_key` for
   * something that is not a key; 503 `visitor_move_retry` (with `retryAfter`)
   * when it did not finish this time.
   */
  moveVisitor(key: string): Promise<VisitorMove> {
    return this._call(this._http.post<VisitorMove>('/api/visitor/move', {}, { headers: { [VISITOR_KEY_HEADER]: key }, context: issuedAs('person').set(CARRIES_VISITOR_KEY, true) }));
  }

  // ── The site's own words ─────────────────────────────────────────────────

  /**
   * One language's strings with English underneath, and the languages on
   * offer. The same for everybody (no token goes with it). `language` says
   * which language answered: the one asked for; for a code with a region
   * that is not offered itself (`sk-sk`), its base language when that is; and
   * English for a code that is unknown or switched off. Not checked here:
   * TranslationService takes nothing it has not.
   */
  translations(code: string): Promise<unknown> {
    return this._call(this._http.get<unknown>(`/api/translations/${encodeURIComponent(code)}`));
  }

  // ── The admin area ───────────────────────────────────────────────────────

  async summaries(): Promise<SurveySummary[]> {
    return (await this._call(this._http.get<{ surveys: SurveySummary[] }>('/api/admin/surveys'))).surveys;
  }

  async survey(id: string): Promise<Survey> {
    return (await this._call(this._http.get<{ survey: Survey }>(`/api/admin/surveys/${encodeURIComponent(id)}`))).survey;
  }

  async createSurvey(survey: Survey): Promise<Survey> {
    return (await this._call(this._http.post<{ survey: Survey }>('/api/admin/surveys', { survey }))).survey;
  }

  /** Saves the survey as changed from `revision`: ApiError 409 `conflict` when somebody else saved since. */
  async saveSurvey(survey: Survey, revision: number): Promise<Survey> {
    return (await this._call(this._http.put<{ survey: Survey }>(`/api/admin/surveys/${encodeURIComponent(survey.id)}`, { revision, survey }))).survey;
  }

  /** Opens or closes it; `closesOn`, when given, is the last day it opens with. */
  async setStatus(id: string, status: Exclude<SurveyStatus, 'draft'>, closesOn?: string | null): Promise<Survey> {
    const body = closesOn === undefined ? { status } : { status, closesOn };
    return (await this._call(this._http.post<{ survey: Survey }>(`/api/admin/surveys/${encodeURIComponent(id)}/status`, body))).survey;
  }

  async deleteSurvey(id: string): Promise<void> {
    await this._call(this._http.delete(`/api/admin/surveys/${encodeURIComponent(id)}`));
  }

  async responses(surveyId: string): Promise<SurveyResponse[]> {
    return (await this._call(this._http.get<{ responses: SurveyResponse[] }>(`/api/admin/surveys/${encodeURIComponent(surveyId)}/responses`))).responses;
  }

  async deleteResponse(id: string): Promise<void> {
    await this._call(this._http.delete(`/api/admin/responses/${encodeURIComponent(id)}`));
  }

  /** The picture's bytes as they are: the server reads what it is from the file itself. */
  async uploadImage(file: Blob): Promise<SurveyImage> {
    const type = file.type.startsWith('image/') ? file.type : 'image/png';
    return (await this._call(this._http.post<{ image: SurveyImage }>('/api/admin/images', file, { headers: { 'Content-Type': type } }))).image;
  }

  /** Every language, the hidden ones too. */
  async languages(): Promise<AdminLanguage[]> {
    return (await this._call(this._http.get<{ languages: AdminLanguage[] }>('/api/admin/languages'))).languages;
  }

  /**
   * A new language, sorted last - and offered to readers at once only when
   * `enabled` says so: one with no strings yet reads in English throughout, so
   * the page that adds it says which it is, every time.
   * ApiError 409 `language_exists`, 422 `invalid_language` or `too_many_languages`.
   */
  async createLanguage(language: NewLanguage & { enabled: boolean }): Promise<AdminLanguage> {
    return (await this._call(this._http.post<{ language: AdminLanguage }>('/api/admin/languages', language))).language;
  }

  /** Its names, its place, whether it is offered. ApiError 409 `fallback_language` for switching English off. */
  async updateLanguage(code: string, changes: LanguageChanges): Promise<AdminLanguage> {
    return (await this._call(this._http.put<{ language: AdminLanguage }>(`/api/admin/languages/${encodeURIComponent(code)}`, changes))).language;
  }

  /** ADMIN only. ApiError 409 `fallback_language`, `seeded_language`, or `language_in_use` while a survey is written or translated in it. */
  async deleteLanguage(code: string): Promise<void> {
    await this._call(this._http.delete(`/api/admin/languages/${encodeURIComponent(code)}`));
  }

  /** Every key with its string in every language. */
  translationGrid(): Promise<TranslationGrid> {
    return this._call(this._http.get<TranslationGrid>('/api/admin/translations'));
  }

  /** Saves the cells that changed, all or none; answers the grid as it is now, other people's changes included. */
  saveTranslations(values: TranslationChanges): Promise<TranslationGrid> {
    return this._call(this._http.put<TranslationGrid>('/api/admin/translations', { values }));
  }

  /** One language's own strings as a flat {key: text} map - not merged with English. */
  exportTranslations(code: string): Promise<Record<string, string>> {
    return this._call(this._http.get<Record<string, string>>(`/api/admin/translations/${encodeURIComponent(code)}/export`));
  }

  /** The way back: a flat {key: text} map, checked like a save; unknown keys are refused, blank values skipped. */
  importTranslations(code: string, values: Record<string, string>): Promise<TranslationGrid> {
    return this._call(this._http.put<TranslationGrid>(`/api/admin/translations/${encodeURIComponent(code)}/import`, values));
  }

  // The database's migrations (ADMIN) are the anotoki family's Migrations page's own
  // (<anotoki-migrations-page>, @anotoki/lib/migrations): it asks /api/admin/migrations itself.

  /** For whoever takes surveys now: the person signed in, or else the visitor - decided as the request is made. */
  private _asTaker(): HttpContext {
    return issuedAs(this._auth.signedIn() ? 'person' : 'visitor');
  }

  private async _call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      throw toApiError(error);
    }
  }
}

/** Whatever a request failed with, as an ApiError. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof HttpErrorResponse) {
    if (error.status === 0) {
      return new ApiError(0, 'offline', 'The site could not be reached. Check the connection and try again.');
    }
    const body = error.error && typeof error.error === 'object' ? (error.error as Record<string, unknown>) : {};
    const message = typeof body['error'] === 'string' ? body['error'] : `The server answered ${error.status}.`;
    const wait = Number(error.headers?.get('Retry-After') ?? Number.NaN);
    return new ApiError(error.status, typeof body['code'] === 'string' ? body['code'] : 'http_' + error.status, message, body, Number.isFinite(wait) && wait >= 0 ? wait : null);
  }
  return new ApiError(0, 'unknown', error instanceof Error ? error.message : 'Something went wrong.');
}
