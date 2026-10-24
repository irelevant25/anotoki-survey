/**
 * The keys that are put together at run time: prefix -> every tail the code
 * can add to it. A key is never built from anything open - an address, the
 * IAM's answer, what a person typed - only from these closed sets, and the
 * code that words them goes through a table with a fallback key.
 *
 * This file is read by the backend's key scan (backend/tools/translation_keys.php),
 * which cannot see a key that is never written out whole: every key listed
 * here (or its plural family) must exist in the database, and a database key
 * under one of these prefixes that is not listed is unused.
 */
export const DYNAMIC_KEYS: Record<string, readonly string[]> = {
  // The whole-request failures errorKey() words (error-text.ts): the API's own codes, verbatim.
  'error.': [
    'offline',
    'server_error',
    'database_unavailable',
    'invalid_token',
    'sign_in_required',
    'too_large',
    'not_set_up',
    'visitor_unknown',
    'too_many_visitors',
    'visitor_move_retry',
    'http',
    'unknown',
  ],
  // The answers of the About-you step, as aboutYouQuestions() asks for them
  // (shared/survey/about-you-questions.ts): the keys of GENDERS and AGES
  // (shared/survey/about-you.ts), verbatim - the server's SURVEY_GENDERS and SURVEY_AGES.
  // The answers the step offers, that is: "Non-binary", no longer offered, has no string.
  'aboutYou.gender.': ['male', 'female', 'undisclosed'],
  'aboutYou.age.': ['under-18', '18-24', '25-34', '35-44', '45-plus', 'undisclosed'],
  // The kinds choiceRule() and answerProblem() return (shared/survey/answer-rules.ts), worded by
  // answer-words.ts. Every kind with a number is a plural family: its keys end in .one, .few, .other.
  'answer.rule.': ['any', 'atLeast', 'upTo', 'exactly', 'between'],
  'answer.problem.': ['write', 'choose', 'chooseAtLeast', 'tooLong', 'chooseOne', 'chooseAtMost', 'writeOther'],
};
