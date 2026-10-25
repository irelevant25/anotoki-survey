import { richHtmlText } from '@anotoki/lib/ui/rich-html';
import { ageLabel, genderLabel } from './about-you';
import { durationSeconds } from './results';
import { numberedQuestions } from './survey-outline';
import { Survey, SurveyResponse } from './survey.model';

/**
 * The responses as a spreadsheet: one row per person, one column per
 * question. Several choices share a cell, separated by "; ", and "Other"
 * carries what the person wrote ("Other: TikTok"). A person is their name -
 * the anotoki account's, or "Visitor 12" - and no address: the site keeps
 * none (the IAM does).
 *
 * A cell that starts like a formula (= + - @) gets a leading apostrophe, so a
 * spreadsheet shows what a person typed instead of running it. The byte-order
 * mark makes Excel read the file as UTF-8.
 */
export function responsesCsv(survey: Survey, responses: readonly SurveyResponse[]): string {
  const questions = numberedQuestions(survey);
  const header = ['Submitted', 'Name', ...(survey.askAboutYou ? ['Gender', 'Age'] : []), ...questions.map(({ number, question }) => `${number}. ${richHtmlText(question.text)}`), 'Seconds taken'];

  const rows = responses.map((response) => {
    const cells = [response.submittedAt, response.person.name];
    if (survey.askAboutYou) {
      cells.push(response.aboutYou ? genderLabel(response.aboutYou.gender) : '', response.aboutYou ? ageLabel(response.aboutYou.age) : '');
    }
    for (const { question } of questions) {
      const answer = response.answers[question.id];
      if (!answer) {
        cells.push('');
      } else if (question.type === 'text') {
        cells.push(answer.text);
      } else {
        const chosen = question.options.filter((option) => answer.optionIds.includes(option.id));
        cells.push(chosen.map((option) => (option.other && answer.other ? `${option.label}: ${answer.other}` : option.label)).join('; '));
      }
    }
    cells.push(String(durationSeconds(response)));
    return cells;
  });

  return '﻿' + [header, ...rows].map((cells) => cells.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replace(/"/g, '""')}"`;
}
