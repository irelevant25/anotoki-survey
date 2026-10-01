import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { AdminLanguage } from '../../../core/i18n/translation.model';
import { newOption, newQuestion, newSurvey } from '../../../core/survey/survey-factory';
import { Survey, SurveyResponse } from '../../../core/survey/survey.model';
import { ResponseViewComponent } from './response-view.component';

const LANGUAGES: AdminLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', enabled: true, sortOrder: 1, seeded: true },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', enabled: true, sortOrder: 2, seeded: true },
];

/** Written in English, with its one question in Slovak too. */
function survey(): Survey {
  const question = { ...newQuestion('single'), id: 'q1', text: '<p>Which element?</p>', options: [{ ...newOption('Wind'), id: 'o1' }] };
  return {
    ...newSurvey([]),
    id: 's1',
    askAboutYou: false,
    steps: [{ id: 'st1', title: 'The game', questions: [question] }],
    translations: {
      sk: { title: '', intro: '', thanks: '', steps: { st1: { title: 'Hra' } }, questions: { q1: { text: '<p>Ktorý živel?</p>', placeholder: '', options: { o1: { label: 'Vietor' } }, images: {} } } },
    },
  };
}

function response(language: string | null): SurveyResponse {
  return {
    id: 'r1',
    surveyId: 's1',
    person: { id: 'p1', name: 'Zuzka', email: 'zuzka@example.com' },
    aboutYou: null,
    answers: { q1: { optionIds: ['o1'], other: '', text: '' } },
    language,
    startedAt: '2026-09-30T08:00:00Z',
    submittedAt: '2026-09-30T08:05:00Z',
  };
}

describe('ResponseViewComponent: the language the survey was read in', () => {
  let fixture: ComponentFixture<ResponseViewComponent>;
  let host: HTMLElement;
  const languages = signal<AdminLanguage[] | null>(LANGUAGES);

  const readIn = () => host.querySelector('.read-in')?.textContent?.replace(/\s+/g, ' ').trim();

  async function show(answers: SurveyResponse): Promise<void> {
    TestBed.configureTestingModule({ providers: [{ provide: AdminStore, useValue: { languages } }] });
    fixture = TestBed.createComponent(ResponseViewComponent);
    host = fixture.nativeElement;
    fixture.componentRef.setInput('survey', survey());
    fixture.componentRef.setInput('response', answers);
    await fixture.whenStable();
  }

  beforeEach(() => languages.set(LANGUAGES));

  it('says it by the language’s English name, above the answers - which stay in the language the survey is written in', async () => {
    await show(response('sk'));

    expect(readIn()).toBe('Read in Slovak');
    expect(host.firstElementChild?.classList.contains('read-in')).toBe(true);
    // The admin area reads the survey as it is written, whatever the person read.
    expect(host.querySelector('.step-title')?.textContent).toContain('The game');
    expect(host.querySelector('.text')?.textContent).toBe('Which element?');
    expect(host.querySelector('.option-label')?.textContent).toContain('Wind');
  });

  it('stands with the facts above it, not with the step below: nearer to what is over it by what it takes from the top', async () => {
    await show(response('sk'));
    const line = getComputedStyle(host.querySelector('.read-in')!);
    // The drawer and the page both leave 1.25rem over this component, and the steps are 1.5rem apart.
    expect(getComputedStyle(host).gap).toBe('1.5rem');
    expect(line.marginTop).toBe('-0.75rem');
    expect(['', '0px']).toContain(line.marginBottom);
  });

  it('says it for the survey’s own language too', async () => {
    await show(response('en'));
    expect(readIn()).toBe('Read in English');
  });

  it('says nothing when the answers do not say: older ones, and ones the server was told no language it knows', async () => {
    await show(response(null));
    expect(host.querySelector('.read-in')).toBeNull();
    // The answers are there all the same, from their first step on.
    expect(host.firstElementChild?.classList.contains('step')).toBe(true);
  });

  it('shows the code until the languages have come, and for one the list does not have', async () => {
    languages.set(null);
    await show(response('sk'));
    expect(readIn()).toBe('Read in sk');

    languages.set(LANGUAGES);
    await fixture.whenStable();
    expect(readIn()).toBe('Read in Slovak');

    fixture.componentRef.setInput('response', response('de'));
    await fixture.whenStable();
    expect(readIn()).toBe('Read in de');
  });
});
