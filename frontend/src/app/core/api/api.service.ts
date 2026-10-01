import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { AdminLanguage, LanguageChanges, NewLanguage, TranslationChanges, TranslationGrid } from '../i18n/translation.model';
import { AboutYou, Answer, Survey, SurveyImage, SurveyResponse, SurveyStatus, SurveySummary } from '../survey/survey.model';

/**
 * A refusal from the API, in the one shape it answers with: {error, code} and
 * whatever else the code needs (the question an answer failed on, the survey
 * as somebody else saved it). Status 0, code `offline`: no answer at all.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** A survey for the people taking it, and when the signed-in person answered it (null: not yet). */
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
 * resolves with what the route answers or rejects with an ApiError; the access
 * token is added by the interceptor.
 */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly _http = inject(HttpClient);

  // ── For the people taking surveys ────────────────────────────────────────

  async openSurveys(): Promise<ParticipantSurvey[]> {
    return (await this._call(this._http.get<{ surveys: ParticipantSurvey[] }>('/api/surveys'))).surveys;
  }

  surveyBySlug(slug: string): Promise<ParticipantSurvey> {
    return this._call(this._http.get<ParticipantSurvey>(`/api/surveys/${encodeURIComponent(slug)}`));
  }

  submit(slug: string, response: ResponseSubmission): Promise<{ id: string; submittedAt: string }> {
    return this._call(this._http.post<{ id: string; submittedAt: string }>(`/api/surveys/${encodeURIComponent(slug)}/responses`, response));
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
    return new ApiError(error.status, typeof body['code'] === 'string' ? body['code'] : 'http_' + error.status, message, body);
  }
  return new ApiError(0, 'unknown', error instanceof Error ? error.message : 'Something went wrong.');
}
