import { richHtmlText } from '@anotoki/lib/ui/rich-html';
import { AGES, AGE_ID, ALL_GENDERS, GENDER_ID } from './about-you';
import { numberedQuestions } from './survey-outline';
import { Person, Question, Survey, SurveyImage, SurveyResponse } from './survey.model';

/**
 * The numbers behind the results page: how many chose what, who they were,
 * and what they wrote. Everything is computed from the responses in hand, so
 * narrowing them down (the filters) narrows every number with them.
 */

/** "People who chose this": a question - or gender or age - and one of its options. */
export interface ResultFilter {
  questionId: string;
  optionId: string;
}

export function matchesFilter(response: SurveyResponse, filter: ResultFilter): boolean {
  if (filter.questionId === GENDER_ID) {
    return response.aboutYou?.gender === filter.optionId;
  }
  if (filter.questionId === AGE_ID) {
    return response.aboutYou?.age === filter.optionId;
  }
  return response.answers[filter.questionId]?.optionIds.includes(filter.optionId) ?? false;
}

/** The responses that match every filter (all of them when there is none). */
export function filterResponses(responses: readonly SurveyResponse[], filters: readonly ResultFilter[]): SurveyResponse[] {
  return filters.length ? responses.filter((response) => filters.every((filter) => matchesFilter(response, filter))) : [...responses];
}

/** One option's count. `share` is of the people who answered the question, 0 to 1. */
export interface Tally {
  key: string;
  label: string;
  other: boolean;
  /** The option's first picture, drawn beside its bar; null for none. */
  image: SurveyImage | null;
  count: number;
  share: number;
  responseIds: string[];
}

/** Something a person wrote: a text answer, or what they put next to "Other". */
export interface WrittenAnswer {
  responseId: string;
  person: Person;
  text: string;
  submittedAt: string;
}

export interface ChoiceSummary {
  /** People who chose anything. */
  answered: number;
  /** People who left the question empty. */
  skipped: number;
  /** One per option, in the question's order. */
  tallies: Tally[];
  /** What people wrote for "Other", newest first. */
  others: WrittenAnswer[];
  /** Several choices: how many each person picked, on average. */
  averagePicked: number | null;
}

export function choiceSummary(question: Question, responses: readonly SurveyResponse[]): ChoiceSummary {
  const tallies = new Map<string, Tally>(
    question.options.map((option) => [option.id, { key: option.id, label: option.label, other: option.other, image: option.images[0] ?? null, count: 0, share: 0, responseIds: [] }]),
  );
  const others: WrittenAnswer[] = [];
  let answered = 0;
  let picked = 0;

  for (const response of responses) {
    const answer = response.answers[question.id];
    // An option the editor has since removed is not counted anywhere.
    const chosen = answer ? answer.optionIds.filter((id) => tallies.has(id)) : [];
    if (!answer || chosen.length === 0) {
      continue;
    }
    answered++;
    picked += chosen.length;
    for (const id of chosen) {
      const tally = tallies.get(id) as Tally;
      tally.count++;
      tally.responseIds.push(response.id);
    }
    if (answer.other.trim() && chosen.some((id) => tallies.get(id)?.other)) {
      others.push({ responseId: response.id, person: response.person, text: answer.other.trim(), submittedAt: response.submittedAt });
    }
  }

  for (const tally of tallies.values()) {
    tally.share = answered ? tally.count / answered : 0;
  }
  others.sort(newestFirst);
  return {
    answered,
    skipped: responses.length - answered,
    tallies: [...tallies.values()],
    others,
    averagePicked: question.type === 'multiple' && answered ? picked / answered : null,
  };
}

/** A text question's answers, newest first. */
export function writtenAnswers(question: Question, responses: readonly SurveyResponse[]): WrittenAnswer[] {
  const list: WrittenAnswer[] = [];
  for (const response of responses) {
    const text = response.answers[question.id]?.text.trim();
    if (text) {
      list.push({ responseId: response.id, person: response.person, text, submittedAt: response.submittedAt });
    }
  }
  return list.sort(newestFirst);
}

export interface AboutYouSummary {
  answered: number;
  gender: Tally[];
  age: Tally[];
}

/**
 * Gender and age, counted. Every answer the gender question has had is counted
 * under its label - one it no longer offers ("Non-binary", kept from before
 * 2026-10-20) like the rest - and that one has a bar only where somebody gave
 * it, so the bars always add up to the people who answered.
 */
export function aboutYouSummary(responses: readonly SurveyResponse[]): AboutYouSummary {
  const gender = ALL_GENDERS.map((item): Tally => ({ key: item.key, label: item.label, other: false, image: null, count: 0, share: 0, responseIds: [] }));
  const age = AGES.map((item): Tally => ({ key: item.key, label: item.label, other: false, image: null, count: 0, share: 0, responseIds: [] }));
  let answered = 0;
  for (const response of responses) {
    if (!response.aboutYou) {
      continue;
    }
    answered++;
    const g = gender.find((tally) => tally.key === response.aboutYou?.gender);
    const a = age.find((tally) => tally.key === response.aboutYou?.age);
    if (g) {
      g.count++;
      g.responseIds.push(response.id);
    }
    if (a) {
      a.count++;
      a.responseIds.push(response.id);
    }
  }
  for (const tally of [...gender, ...age]) {
    tally.share = answered ? tally.count / answered : 0;
  }
  return { answered, gender: gender.filter((tally, index) => ALL_GENDERS[index].offered || tally.count > 0), age };
}

/**
 * What a filter means, in words: the question and the answer. Null for one
 * that means nothing - an option the question does not have, a gender or an
 * age no answer has ever had - which the page then leaves out.
 */
export function describeFilter(survey: Survey, filter: ResultFilter): { question: string; answer: string } | null {
  if (filter.questionId === GENDER_ID) {
    const gender = ALL_GENDERS.find((item) => item.key === filter.optionId);
    return gender ? { question: 'Gender', answer: gender.label } : null;
  }
  if (filter.questionId === AGE_ID) {
    const age = AGES.find((item) => item.key === filter.optionId);
    return age ? { question: 'Age', answer: age.label } : null;
  }
  const found = numberedQuestions(survey).find((item) => item.question.id === filter.questionId);
  const option = found?.question.options.find((item) => item.id === filter.optionId);
  if (!found || !option) {
    return null;
  }
  return { question: `${found.number}. ${richHtmlText(found.question.text)}`, answer: option.label };
}

/** How long a person took, from pressing Start to sending, in seconds. */
export function durationSeconds(response: SurveyResponse): number {
  return Math.max(0, Math.round((Date.parse(response.submittedAt) - Date.parse(response.startedAt)) / 1000));
}

export function medianDuration(responses: readonly SurveyResponse[]): number | null {
  if (!responses.length) {
    return null;
  }
  const sorted = responses.map(durationSeconds).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function newestFirst(a: { submittedAt: string }, b: { submittedAt: string }): number {
  return b.submittedAt.localeCompare(a.submittedAt);
}
