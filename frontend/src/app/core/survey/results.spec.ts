import { exampleData } from '../testing/example-data';
import { AGE_ID, GENDER_ID } from './about-you';
import { ABOUT_YOU_QUESTIONS } from './about-you-questions';
import { answerProblem } from './answer-rules';
import { responsesCsv } from './csv';
import { aboutYouSummary, choiceSummary, describeFilter, filterResponses, medianDuration, writtenAnswers } from './results';
import { numberedQuestions } from './survey-outline';

// A fixed "now", so the example data is the same on every run.
const NOW = Date.parse('2026-09-29T12:00:00Z');
const { surveys, responses } = exampleData(NOW);
const genshin = surveys.find((survey) => survey.id === 'example-genshin')!;
const genshinResponses = responses.filter((response) => response.surveyId === genshin.id);
const [visit] = genshin.steps[0].questions;
const everyDay = visit.options[0];

describe('the example data', () => {
  it('is the same every time', () => {
    expect(JSON.stringify(exampleData(NOW))).toBe(JSON.stringify(exampleData(NOW)));
  });

  it('answers every survey as the survey itself would accept', () => {
    for (const response of responses) {
      const survey = surveys.find((item) => item.id === response.surveyId)!;
      for (const { question } of numberedQuestions(survey)) {
        expect(answerProblem(question, response.answers[question.id]), `${response.id}, ${question.id}`).toBeNull();
      }
      if (survey.askAboutYou) {
        expect(response.aboutYou).not.toBeNull();
        const [gender, age] = ABOUT_YOU_QUESTIONS;
        expect(gender.options.some((option) => option.id === response.aboutYou?.gender)).toBe(true);
        expect(age.options.some((option) => option.id === response.aboutYou?.age)).toBe(true);
      }
    }
  });

  it('has one response per person and survey, all in the past', () => {
    const keys = responses.map((response) => `${response.surveyId}/${response.person.id}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(responses.every((response) => Date.parse(response.submittedAt) <= NOW && Date.parse(response.startedAt) < Date.parse(response.submittedAt))).toBe(true);
  });
});

describe('results', () => {
  it('counts each option, with shares of those who answered', () => {
    const summary = choiceSummary(visit, genshinResponses);
    expect(summary.answered).toBe(genshinResponses.length);
    expect(summary.skipped).toBe(0);
    expect(summary.tallies.reduce((sum, tally) => sum + tally.count, 0)).toBe(summary.answered);
    const tally = summary.tallies[0];
    expect(tally.share).toBeCloseTo(tally.count / summary.answered);
    expect(tally.responseIds.length).toBe(tally.count);
  });

  it('narrows everything to the people behind a filter', () => {
    const daily = filterResponses(genshinResponses, [{ questionId: visit.id, optionId: everyDay.id }]);
    expect(daily.length).toBe(choiceSummary(visit, genshinResponses).tallies[0].count);
    expect(daily.every((response) => response.answers[visit.id].optionIds.includes(everyDay.id))).toBe(true);
    const dailyWomen = filterResponses(genshinResponses, [
      { questionId: visit.id, optionId: everyDay.id },
      { questionId: GENDER_ID, optionId: 'female' },
    ]);
    expect(dailyWomen.every((response) => response.aboutYou?.gender === 'female')).toBe(true);
    expect(dailyWomen.length).toBeLessThanOrEqual(daily.length);
  });

  it('describes a filter in words', () => {
    expect(describeFilter(genshin, { questionId: visit.id, optionId: everyDay.id })).toEqual({ question: '1. How often do you visit genshin.anotoki.eu?', answer: 'Every day' });
    expect(describeFilter(genshin, { questionId: AGE_ID, optionId: '18-24' })).toEqual({ question: 'Age', answer: '18–24' });
    expect(describeFilter(genshin, { questionId: visit.id, optionId: 'nope' })).toBeNull();
  });

  it('adds up gender and age', () => {
    const about = aboutYouSummary(genshinResponses);
    expect(about.answered).toBe(genshinResponses.length);
    expect(about.gender.reduce((sum, tally) => sum + tally.count, 0)).toBe(about.answered);
    expect(about.age.reduce((sum, tally) => sum + tally.count, 0)).toBe(about.answered);
  });

  it('lists written answers newest first', () => {
    const likes = genshin.steps[3].questions.find((question) => question.id === 'g-q11')!;
    const written = writtenAnswers(likes, genshinResponses);
    expect(written.length).toBeGreaterThan(0);
    expect(written.every((answer, i) => i === 0 || written[i - 1].submittedAt >= answer.submittedAt)).toBe(true);
  });

  it('takes the median time', () => {
    expect(medianDuration([])).toBeNull();
    expect(medianDuration(genshinResponses)).toBeGreaterThan(0);
  });
});

describe('the CSV', () => {
  it('has a row per person and a column per question, and defuses formulas', () => {
    const tricky = { ...genshinResponses[0], person: { ...genshinResponses[0].person, name: '=HYPERLINK("x")' } };
    const csv = responsesCsv(genshin, [tricky, ...genshinResponses.slice(1)]);
    const lines = csv.trim().split('\r\n');
    expect(lines.length).toBe(genshinResponses.length + 1);
    expect(csv.startsWith('﻿"Submitted","Name","Email","Gender","Age","1. How often')).toBe(true);
    expect(lines[1]).toContain(`"'=HYPERLINK(""x"")"`);
  });
});
