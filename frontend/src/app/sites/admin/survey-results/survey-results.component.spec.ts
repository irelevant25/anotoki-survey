import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { AdminStore } from '../../../shared/admin/admin-store.service';
import { AuthService } from '../../../shared/auth/auth.service';
import { newStep, newSurvey } from '../../../shared/survey/survey-factory';
import { SurveyResponse } from '../../../shared/survey/survey.model';
import { answersOf } from '../../../shared/testing/answers-of';
import { SurveyResultsComponent } from './survey-results.component';

describe('SurveyResultsComponent: a visitor among everybody', () => {
  async function show(response?: string): Promise<HTMLElement> {
    const survey = { ...newSurvey([]), id: 's1', askAboutYou: false };
    const responses = [answersOf('r1', 'Zuzka', false), answersOf('r2', 'Visitor 3', true)];
    const store = {
      survey: () => survey,
      loadError: () => null,
      responses: () => responses,
      responsesError: () => null,
      responseCount: () => responses.length,
      summaries: signal([]),
      languages: signal([]),
      saveStatus: () => ({ state: 'saved', message: null, theirs: null }),
      load: () => Promise.resolve(),
      loadSummaries: () => Promise.resolve(),
      loadResponses: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminStore, useValue: store }, { provide: AuthService, useValue: { isAdmin: () => false, preferences: () => null } }],
    });
    const fixture = TestBed.createComponent(SurveyResultsComponent);
    fixture.componentRef.setInput('surveyId', 's1');
    fixture.componentRef.setInput('tab', 'people');
    if (response) {
      fixture.componentRef.setInput('response', response);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('lists a visitor as "Not signed in" under the name, and a person by their name alone - the site keeps no address', async () => {
    const host = await show();
    const rows = [...host.querySelectorAll('tbody tr')].map((row) => [row.querySelector('.who-name')?.textContent, row.querySelector('.who-email')?.textContent]);

    expect(rows).toEqual([
      ['Zuzka', undefined],
      ['Visitor 3', 'Not signed in'],
    ]);
  });

  it('says it under the name in the drawer of a visitor’s answers', async () => {
    const host = await show('r2');

    expect(host.querySelector('anotoki-drawer .anotoki-drawer__subtitle')?.textContent).toBe('Not signed in');
  });

  it('and nothing under a person’s name in theirs', async () => {
    const host = await show('r1');

    expect(host.querySelector('anotoki-drawer .anotoki-drawer__subtitle')).toBeNull();
  });
});

describe('SurveyResultsComponent: the filters, the kit’s removable chips', () => {
  let fixture: ComponentFixture<SurveyResultsComponent> | null = null;

  afterEach(() => {
    fixture?.destroy();
    fixture = null;
    document.body.innerHTML = '';
  });

  /** The results narrowed by `filter` ("question:option,..."), drawn in the page; every navigation the page asks for, recorded. */
  async function show(filter: (made: ReturnType<typeof surveyWithAQuestion>) => string) {
    const made = surveyWithAQuestion();
    const responses = [answersOf('r1', 'Zuzka', false)];
    const store = {
      survey: () => made.survey,
      loadError: () => null,
      responses: () => responses,
      responsesError: () => null,
      responseCount: () => responses.length,
      summaries: signal([]),
      languages: signal([]),
      saveStatus: () => ({ state: 'saved', message: null, theirs: null }),
      load: () => Promise.resolve(),
      loadSummaries: () => Promise.resolve(),
      loadResponses: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminStore, useValue: store }, { provide: AuthService, useValue: { isAdmin: () => false, preferences: () => null } }],
    });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(SurveyResultsComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentRef.setInput('surveyId', 's1');
    fixture.componentRef.setInput('filter', filter(made));
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const filtersAsked = () => navigate.mock.calls.map((call) => (call[1]?.queryParams as Record<string, unknown> | undefined)?.['filter']);
    return { made, host, filtersAsked };
  }

  /** A survey that asks about you, with one question whose text is long and whose first option is "Furina". */
  function surveyWithAQuestion() {
    const survey = { ...newSurvey([]), id: 's1', askAboutYou: true };
    const question = survey.steps[0].questions[0];
    question.text = '<p>Which of the many characters that came with the last version do you play most often?</p>';
    question.options[0].label = 'Furina';
    return { survey, question, option: question.options[0] };
  }

  it('names each chip with its question - cut short at a word where it is long - and the answer, and its remove button with the same words', async () => {
    const { host } = await show(({ question, option }) => `about-gender:female,${question.id}:${option.id}`);

    const list = host.querySelector('anotoki-chip-list')!;
    expect(list.getAttribute('aria-label')).toBe('The filters on');
    const labels = [...list.querySelectorAll('.anotoki-chip-list__label')].map((label) => label.textContent?.trim());
    expect(labels).toEqual(['Gender: Female', '1. Which of the many characters that came with…: Furina']);
    expect([...list.querySelectorAll('.anotoki-chip-list__remove')].map((button) => button.getAttribute('aria-label'))).toEqual([
      'Remove: Gender: Female',
      'Remove: 1. Which of the many characters that came with…: Furina',
    ]);
    expect(host.querySelector('.chip-remove')).toBeNull();
  });

  it('a chip’s remove button drops its filter from the address and keeps the others; the last one - and "Show everybody" - puts the focus on the results’ tab, which stays', async () => {
    const two = await show(({ question, option }) => `about-gender:female,${question.id}:${option.id}`);
    two.host.querySelector<HTMLButtonElement>('.anotoki-chip-list__remove')!.click();
    expect(two.filtersAsked()).toEqual([`${two.made.question.id}:${two.made.option.id}`]);
    expect(document.activeElement?.id).not.toBe('results-tab-summary');
    fixture!.destroy();
    document.body.innerHTML = '';
    TestBed.resetTestingModule();

    const one = await show(() => 'about-gender:female');
    one.host.querySelector<HTMLButtonElement>('.anotoki-chip-list__remove')!.click();
    expect(one.filtersAsked()).toEqual([null]);
    expect(document.activeElement?.id).toBe('results-tab-summary');

    (document.activeElement as HTMLElement).blur();
    one.host.querySelector<HTMLButtonElement>('.clear')!.click();
    expect(one.filtersAsked()).toEqual([null, null]);
    expect(document.activeElement?.id).toBe('results-tab-summary');
  });
});

describe('SurveyResultsComponent: a step of text alone', () => {
  it('has no results, so the summary leaves it out - and the steps that asked keep the numbers people saw them under', async () => {
    const base = { ...newSurvey([]), id: 's1', askAboutYou: true };
    const task = { ...newStep('Try the genshin site'), text: '<p>Go there, then come back.</p>' };
    const survey = { ...base, steps: [task, { ...base.steps[0], title: 'How it went' }] };
    const responses = [answersOf('r1', 'Zuzka', false)];
    const store = {
      survey: () => survey,
      loadError: () => null,
      responses: () => responses,
      responsesError: () => null,
      responseCount: () => responses.length,
      summaries: signal([]),
      languages: signal([]),
      saveStatus: () => ({ state: 'saved', message: null, theirs: null }),
      load: () => Promise.resolve(),
      loadSummaries: () => Promise.resolve(),
      loadResponses: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminStore, useValue: store }, { provide: AuthService, useValue: { isAdmin: () => false, preferences: () => null } }],
    });
    const fixture = TestBed.createComponent(SurveyResultsComponent);
    fixture.componentRef.setInput('surveyId', 's1');
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;

    const steps = [...host.querySelectorAll('#results-panel-summary .step-title')].map((title) => title.textContent?.replace(/\s+/g, ' ').trim());
    expect(steps).toEqual(['Step 1 About them', 'Step 3 How it went']);
    expect(host.querySelectorAll('app-choice-result')).toHaveLength(1);
    expect(host.textContent).not.toContain('Try the genshin site');
  });
});

describe('SurveyResultsComponent: a gender the question no longer offers', () => {
  let fixture: ComponentFixture<SurveyResultsComponent> | null = null;

  afterEach(() => {
    fixture?.destroy();
    fixture = null;
  });

  /** Zuzka's answers kept with "Non-binary" - sent before 2026-10-20 - and a visitor's with "Female", the page given `inputs`. */
  async function show(inputs: Record<string, string> = {}): Promise<HTMLElement> {
    const survey = { ...newSurvey([]), id: 's1', askAboutYou: true };
    const responses: SurveyResponse[] = [
      { ...answersOf('r1', 'Zuzka', false), aboutYou: { gender: 'non-binary', age: '25-34' } },
      { ...answersOf('r2', 'Visitor 3', true), aboutYou: { gender: 'female', age: '18-24' } },
    ];
    const store = {
      survey: () => survey,
      loadError: () => null,
      responses: () => responses,
      responsesError: () => null,
      responseCount: () => responses.length,
      summaries: signal([]),
      languages: signal([]),
      saveStatus: () => ({ state: 'saved', message: null, theirs: null }),
      load: () => Promise.resolve(),
      loadSummaries: () => Promise.resolve(),
      loadResponses: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminStore, useValue: store }, { provide: AuthService, useValue: { isAdmin: () => false, preferences: () => null } }],
    });
    fixture = TestBed.createComponent(SurveyResultsComponent);
    fixture.componentRef.setInput('surveyId', 's1');
    for (const [name, value] of Object.entries(inputs)) {
      fixture.componentRef.setInput(name, value);
    }
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  /** The gender bars of the summary - the first part of "About them": each label and its count. */
  const genderBars = (host: HTMLElement) =>
    [...host.querySelector('#results-panel-summary .about-part')!.querySelectorAll('.row')].map((row) => [
      row.querySelector('.label-text')?.textContent?.trim(),
      row.querySelector('.numbers strong')?.textContent,
    ]);

  it('counts it under its label in the summary, in its old place: the gender bars add up to everybody who answered', async () => {
    expect(genderBars(await show())).toEqual([
      ['Male', '0'],
      ['Female', '1'],
      ['Non-binary', '1'],
      ['Prefer not to say', '0'],
    ]);
  });

  it('names it in the list of people', async () => {
    const host = await show({ tab: 'people' });
    expect([...host.querySelectorAll('tbody td[data-label="Gender"]')].map((cell) => cell.textContent?.trim())).toEqual(['Non-binary', 'Female']);
  });

  it('is a filter said in words, and the people who chose it are counted against everybody who answered', async () => {
    const narrowed = await show({ filter: 'about-gender:non-binary' });
    expect([...narrowed.querySelectorAll('.anotoki-chip-list__label')].map((label) => label.textContent?.trim())).toEqual(['Gender: Non-binary']);
    expect(genderBars(narrowed)).toEqual([
      ['Male', '0'],
      ['Female', '0'],
      ['Non-binary', '1'],
      ['Prefer not to say', '0'],
    ]);
    fixture!.destroy();
    TestBed.resetTestingModule();

    const chose = await show({ chose: 'about-gender:non-binary' });
    expect(chose.querySelector('anotoki-drawer .anotoki-drawer__title')?.textContent?.trim()).toBe('Chose “Non-binary”');
    expect(chose.querySelector('anotoki-drawer .anotoki-drawer__subtitle')?.textContent?.trim()).toBe('Gender · 1 of the 2 who answered it');
  });

  it('leaves out a filter for a gender no answer has ever had: no chip, nobody narrowed away', async () => {
    const host = await show({ filter: 'about-gender:nope' });
    expect(host.querySelectorAll('.anotoki-chip-list__label')).toHaveLength(0);
    expect(genderBars(host).map(([, count]) => count)).toEqual(['0', '1', '1', '0']);
  });
});
