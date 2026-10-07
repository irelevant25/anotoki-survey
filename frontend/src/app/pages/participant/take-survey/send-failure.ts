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
  /** A visitor's answers, refused because the site has required a sign-in since the page loaded. */
  | 'signInRequired'
  /** Nobody's first answers, past the limits on new visitors: sign in, or later. */
  | 'tooManyVisitors'
  /** The survey is not at this address any more: moved or deleted. */
  | 'gone'
  /**
   * The site closed under the person - a database update began, or its
   * settings went: the anotoki family's page has taken this one's place by
   * now (siteStatusInterceptor heard the same answer), and says what there is
   * to say, calmly. The page says nothing more; the answers stay in the draft.
   */
  | 'siteClosed'
  /** Anything else: no connection, the server failing. */
  | 'other';

/**
 * By the API's own code, never by the status alone: a 404 that is not the
 * API's (a proxy's, the hosting's) has the code `http_404`, says nothing
 * about the survey, and stays 'other' - trying again may well work.
 * `visitor`: the answers were sent without a sign-in, so a 401 is no sign-in
 * that ran out.
 */
export function sendFailure(error: ApiError, visitor = false): SendFailure {
  if (error.status === 503 && (error.code === 'update_pending' || error.code === 'not_set_up')) {
    return 'siteClosed';
  }
  if (error.code === 'too_many_visitors') {
    return 'tooManyVisitors';
  }
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
  if (error.status === 401) {
    return visitor ? 'signInRequired' : 'signedOut';
  }
  return 'other';
}

/**
 * The sentence for a failed send. `numberOf` gives a question's number as the
 * page shows it (null: the page has no such question, or it has no number);
 * `visitor`, as for sendFailure().
 *
 * For anything the page has no words of its own for, two whole sentences side
 * by side: what went wrong with the request, and that the answers are safe.
 */
export function sendFailureText(i18n: Pick<TranslationService, 't'>, error: ApiError, numberOf: (questionId: string) => number | null, visitor = false): string {
  switch (sendFailure(error, visitor)) {
    case 'already':
      return i18n.t('take.refused.already');
    case 'closed':
      return i18n.t('take.refused.closed');
    case 'signedOut':
      return i18n.t('take.refused.signedOut');
    case 'signInRequired':
      return i18n.t('take.refused.signInRequired');
    case 'tooManyVisitors':
      return i18n.t('take.refused.tooManyVisitors');
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
    // 'siteClosed' is not said (the family's page stands instead); a page that did say it would say a send failed.
    case 'siteClosed':
    case 'other':
      return `${i18n.t(errorKey(error), errorParams(error))} ${i18n.t('take.answersKept')}`;
  }
}
