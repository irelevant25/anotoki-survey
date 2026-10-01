import { ApiError } from '../../../core/api/api.service';
import { errorKey, errorParams } from '../../../core/i18n/error-text';
import { TranslationService } from '../../../core/i18n/translation.service';
import { AGE_ID, GENDER_ID } from '../../../core/survey/about-you';

/**
 * Why the answers a person sent were not kept, and what the page says then.
 *
 * The page words every one of these itself, in the reader's language: the
 * server's sentence is English and is never shown. What is wrong with one
 * answer is not said here either - the toast says which question to look at,
 * and the exact problem appears under it, from the page's own answerProblem().
 */
export type SendFailure =
  /** This person has answered the survey before (another tab, another device). */
  | 'already'
  /** The survey closed before the answers arrived. */
  | 'closed'
  /** The server would not take an answer: the survey changed under the person. */
  | 'answer'
  /** The sign-in ran out on the way. */
  | 'signedOut'
  /** The survey is not at this address any more: moved or deleted. */
  | 'gone'
  /** Anything else: no connection, the server failing. */
  | 'other';

/**
 * By the API's own code, never by the status alone: a 404 that is not the
 * API's (a proxy's, the hosting's) has the code `http_404`, says nothing
 * about the survey, and stays 'other' - trying again may well work.
 */
export function sendFailure(error: ApiError): SendFailure {
  if (error.code === 'already_answered') {
    return 'already';
  }
  if (error.code === 'not_open') {
    return 'closed';
  }
  if (error.code === 'invalid_answer') {
    return 'answer';
  }
  if (error.code === 'not_found') {
    return 'gone';
  }
  return error.status === 401 ? 'signedOut' : 'other';
}

/**
 * The sentence for a failed send. `numberOf` gives a question's number as the
 * page shows it (null: the page has no such question, or it has no number).
 *
 * For anything the page has no words of its own for, two whole sentences side
 * by side: what went wrong with the request, and that the answers are safe.
 */
export function sendFailureText(i18n: Pick<TranslationService, 't'>, error: ApiError, numberOf: (questionId: string) => number | null): string {
  switch (sendFailure(error)) {
    case 'already':
      return i18n.t('take.refused.already');
    case 'closed':
      return i18n.t('take.refused.closed');
    case 'signedOut':
      return i18n.t('take.refused.signedOut');
    case 'gone':
      return i18n.t('take.refused.gone');
    case 'answer': {
      const questionId = error.body['questionId'];
      if (questionId === GENDER_ID || questionId === AGE_ID) {
        return i18n.t('take.refused.aboutYou');
      }
      const number = typeof questionId === 'string' ? numberOf(questionId) : null;
      return number === null ? i18n.t('take.refused.unknown') : i18n.t('take.refused.question', { number });
    }
    case 'other':
      return `${i18n.t(errorKey(error), errorParams(error))} ${i18n.t('take.answersKept')}`;
  }
}
