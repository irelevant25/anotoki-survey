import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { AuthService } from '../../../core/auth/auth.service';
import { newSurvey } from '../../../core/survey/survey-factory';
import { SurveyResponse } from '../../../core/survey/survey.model';
import { answersOf } from '../../../core/testing/answers-of';
import { ResponsePageComponent } from './response-page.component';

describe('ResponsePageComponent: a visitor’s answers on a page of their own', () => {
  async function show(responses: SurveyResponse[], id: string): Promise<HTMLElement> {
    const survey = { ...newSurvey([]), id: 's1', askAboutYou: false };
    const store = {
      survey: () => survey,
      loadError: () => null,
      responses: () => responses,
      responsesError: () => null,
      languages: signal(null),
      load: () => Promise.resolve(),
      loadResponses: () => Promise.resolve(),
    };
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AdminStore, useValue: store }, { provide: AuthService, useValue: { isAdmin: () => false } }],
    });
    const fixture = TestBed.createComponent(ResponsePageComponent);
    fixture.componentRef.setInput('surveyId', 's1');
    fixture.componentRef.setInput('responseId', id);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const both = [answersOf('r1', 'Zuzka', 'zuzka@example.com', false), answersOf('r2', 'Visitor 3', '', true)];

  it('says "Not signed in" under a visitor’s name', async () => {
    const host = await show(both, 'r2');

    expect(host.querySelector('h1')?.textContent).toBe('Visitor 3');
    expect(host.querySelector('.who .muted')?.textContent?.trim()).toBe('Not signed in');
  });

  it('and a person’s address under theirs', async () => {
    const host = await show(both, 'r1');

    expect(host.querySelector('h1')?.textContent).toBe('Zuzka');
    expect(host.querySelector('.who .muted')?.textContent?.trim()).toBe('zuzka@example.com');
    expect(host.querySelector('.not-signed-in')).toBeNull();
  });
});
