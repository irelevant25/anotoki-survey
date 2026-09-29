import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
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

/** A filled survey as it is sent: the answers, gender and age when asked, and when the person began. */
export interface ResponseSubmission {
  aboutYou: AboutYou | null;
  answers: Record<string, Answer>;
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
