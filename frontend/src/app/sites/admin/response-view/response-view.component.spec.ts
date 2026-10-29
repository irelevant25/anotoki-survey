import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { type AdminLanguage } from '@anotoki/lib/translations';
import { AdminStore } from '../../../shared/admin/admin-store.service';
import { GenderKey } from '../../../shared/survey/about-you';
import { newOption, newQuestion, newStep, newSurvey } from '../../../shared/survey/survey-factory';
import { Survey, SurveyResponse } from '../../../shared/survey/survey.model';
import { ResponseViewComponent } from './response-view.component';

const LANGUAGES: AdminLanguage[] = [
  { code: 'en', name: 'English', native_name: 'English', enabled: true, sort_order: 1, seeded: true, strings: 0 },
  { code: 'sk', name: 'Slovak', native_name: 'Slovenčina', enabled: true, sort_order: 2, seeded: true, strings: 0 },
];

/** Written in English, with its one question in Slovak too. */
function survey(): Survey {
  const question = { ...newQuestion('single'), id: 'q1', text: '<p>Which element?</p>', options: [{ ...newOption('Wind'), id: 'o1' }] };
  return {
    ...newSurvey([]),
    id: 's1',
    askAboutYou: false,
    steps: [{ id: 'st1', title: 'The game', text: '', images: [], questions: [question] }],
    translations: {
      sk: {
        title: '',
        intro: '',
        thanks: '',
        steps: { st1: { title: 'Hra', text: '', images: {} } },
        questions: { q1: { text: '<p>Ktorý živel?</p>', placeholder: '', options: { o1: { label: 'Vietor' } }, images: {} } },
      },
    },
  };
}

function response(language: string | null): SurveyResponse {
  return {
    id: 'r1',
    surveyId: 's1',
    person: { id: 'p1', name: 'Zuzka' },
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

describe('ResponseViewComponent: a step of text alone', () => {
  it('is a line in the person’s survey - its number and title, and that it asked nothing - between the steps they answered', async () => {
    TestBed.configureTestingModule({ providers: [{ provide: AdminStore, useValue: { languages: signal(LANGUAGES) } }] });
    const fixture = TestBed.createComponent(ResponseViewComponent);
    const base = survey();
    const task = { ...newStep('Try the genshin site'), id: 'st0', text: '<p>Go there, then come back.</p>' };
    fixture.componentRef.setInput('survey', { ...base, steps: [task, ...base.steps] });
    fixture.componentRef.setInput('response', response('en'));
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;

    const titles = Array.from(host.querySelectorAll('.step-title')).map((title) => title.textContent?.replace(/\s+/g, ' ').trim());
    expect(titles).toEqual(['Step 1 Try the genshin site Text only - nothing to answer', 'Step 2 The game']);
    // Its text is the summary's, read there once: the person's survey lists what they answered.
    expect(host.textContent).not.toContain('Go there');
    expect(host.querySelectorAll('.item')).toHaveLength(1);
  });
});

describe('ResponseViewComponent: a gender the question no longer offers', () => {
  /** The About-you step of a person's survey, their gender `gender`. */
  async function aboutYouOf(gender: GenderKey): Promise<HTMLElement> {
    TestBed.configureTestingModule({ providers: [{ provide: AdminStore, useValue: { languages: signal(LANGUAGES) } }] });
    const fixture = TestBed.createComponent(ResponseViewComponent);
    fixture.componentRef.setInput('survey', { ...survey(), askAboutYou: true });
    fixture.componentRef.setInput('response', { ...response('en'), aboutYou: { gender, age: '25-34' } });
    await fixture.whenStable();
    return (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('.step')!;
  }

  /** The gender question's options: each label, and whether it is the one chosen. */
  const genderOptions = (about: HTMLElement) =>
    Array.from(about.querySelector('.item')!.querySelectorAll('.option')).map((option) => [
      option.querySelector('.option-label')?.textContent?.replace('(chosen)', '').trim(),
      option.classList.contains('is-chosen'),
    ]);

  it('shows a kept "Non-binary" chosen, under its label, where it stood among the answers', async () => {
    const about = await aboutYouOf('non-binary');
    expect(about.querySelector('.step-title')?.textContent).toContain('About you');
    expect(genderOptions(about)).toEqual([
      ['Male', false],
      ['Female', false],
      ['Non-binary', true],
      ['Prefer not to say', false],
    ]);
    expect(about.querySelector('.item.is-skipped')).toBeNull();
  });

  it('and the three the question offers for every other answer', async () => {
    expect(genderOptions(await aboutYouOf('female'))).toEqual([
      ['Male', false],
      ['Female', true],
      ['Prefer not to say', false],
    ]);
  });
});
