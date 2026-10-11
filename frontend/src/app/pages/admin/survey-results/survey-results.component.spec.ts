import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { AuthService } from '../../../core/auth/auth.service';
import { newSurvey } from '../../../core/survey/survey-factory';
import { answersOf } from '../../../core/testing/answers-of';
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
