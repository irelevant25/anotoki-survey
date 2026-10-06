import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AdminStore } from '../../../core/admin/admin-store.service';
import { type AnotokiPreferences } from '../../../core/auth/anotoki-auth';
import { AuthService } from '../../../core/auth/auth.service';
import { newSurvey } from '../../../core/survey/survey-factory';
import { SurveyResponse } from '../../../core/survey/survey.model';
import { answersOf } from '../../../core/testing/answers-of';
import { ResponsePageComponent } from './response-page.component';

describe('ResponsePageComponent: a visitor’s answers on a page of their own', () => {
  /** AuthService.preferences(): the signed-in person's anotoki account's - null while it has none. */
  const preferences = signal<AnotokiPreferences | null>(null);
  let fixture: ComponentFixture<ResponsePageComponent>;

  beforeEach(() => preferences.set(null));

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
      providers: [provideRouter([]), { provide: AdminStore, useValue: store }, { provide: AuthService, useValue: { isAdmin: () => false, preferences } }],
    });
    fixture = TestBed.createComponent(ResponsePageComponent);
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

  it('writes when they started and sent in the order and on the clock the reader’s anotoki account has chosen - and again when it changes', async () => {
    // By this computer's clock, so the hours are the same in any time zone.
    const response = { ...answersOf('r1', 'Zuzka', 'zuzka@example.com', false), startedAt: new Date(2026, 9, 5, 14, 30).toISOString(), submittedAt: new Date(2026, 9, 5, 14, 35).toISOString() };
    const host = await show([response], 'r1');
    const times = () => Array.from(host.querySelectorAll('dl dt')).flatMap((term) => (['Started', 'Sent'].includes(term.textContent ?? '') ? [term.nextElementSibling?.textContent?.trim()] : []));
    expect(times()).toEqual(['5 Oct 2026, 14:30', '5 Oct 2026, 14:35']);

    preferences.set({ theme: 'auto', date_format: 'ymd_dash', time_format: '12' });
    await fixture.whenStable();
    expect(times()).toEqual(['2026-10-05 2:30 pm', '2026-10-05 2:35 pm']);
  });
});
