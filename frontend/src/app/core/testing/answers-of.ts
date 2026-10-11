import { SurveyResponse } from '../survey/survey.model';

/**
 * For the unit tests only: somebody's answers to survey `s1` - a person's, or
 * a visitor's (`visitor: true`: the server's "Visitor N").
 */
export function answersOf(id: string, name: string, visitor: boolean): SurveyResponse {
  return {
    id,
    surveyId: 's1',
    person: { id: visitor ? '-3' : 'p1', name, visitor },
    aboutYou: null,
    answers: {},
    language: 'en',
    startedAt: '2026-10-05T08:00:00Z',
    submittedAt: '2026-10-05T08:05:00Z',
  };
}
