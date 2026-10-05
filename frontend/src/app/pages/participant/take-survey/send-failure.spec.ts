import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { ApiError, toApiError } from '../../../core/api/api.service';
import { TranslationService } from '../../../core/i18n/translation.service';
import { provideTestTranslations } from '../../../core/testing/test-translations';
import { sendFailure, sendFailureText } from './send-failure';

const ENGLISH = {
  'take.refused.question': 'Please look at question {number} again.',
  'take.refused.aboutYou': 'Please look at the questions about you again.',
  'take.refused.unknown': 'One of your answers could not be accepted. Please check them and send them again.',
  'take.refused.closed': 'The survey closed before your answers arrived, so they could not be kept. Sorry!',
  'take.refused.already': 'You have already taken this survey - your first answers are the ones kept.',
  'take.refused.signedOut': 'Your sign-in has run out. Sign in again - your answers are kept in this browser, and are still here when you come back.',
  'take.refused.gone':
    'This survey is no longer at this address, so your answers could not be sent. They are kept in this browser - if the survey has moved, open it from the list of surveys and carry on.',
  'take.answersKept': 'Your answers could not be sent. They are kept in this browser - try again.',
  'take.refused.signInRequired': 'Sign in to send your answers - they are kept in this browser, and are still here when you come back.',
  'take.refused.tooManyVisitors': 'Too many people have sent answers without signing in lately. Sign in to send yours, or try again later - they are kept in this browser.',
  'error.offline': 'The site could not be reached. Check the connection and try again.',
  'error.server_error': 'Something went wrong on the server.',
  'error.http': 'The server answered {status}.',
  'error.unknown': 'Something went wrong.',
};

const SLOVAK = {
  'take.refused.question': 'Pozrite sa, prosím, ešte raz na otázku {number}.',
  'take.refused.aboutYou': 'Pozrite sa, prosím, ešte raz na otázky o Vás.',
  'take.refused.unknown': 'Niektorú z odpovedí sa nepodarilo prijať. Skontrolujte ich, prosím, a odošlite znova.',
  'take.refused.closed': 'Prieskum sa uzavrel skôr, než Vaše odpovede dorazili, takže ich už nebolo možné uložiť. Mrzí nás to!',
  'take.refused.already': 'Tento prieskum ste už vyplnili – uložené zostávajú Vaše prvé odpovede.',
  'take.refused.signedOut': 'Vaše prihlásenie vypršalo. Prihláste sa znova – odpovede zostávajú uložené v tomto prehliadači a po návrate ich tu nájdete.',
  'take.refused.gone':
    'Tento prieskum sa už na tejto adrese nenachádza, takže odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – ak sa prieskum presunul, otvorte ho zo zoznamu prieskumov a pokračujte.',
  'take.answersKept': 'Odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – skúste to znova.',
  'take.refused.signInRequired': 'Ak chcete odpovede odoslať, prihláste sa – zostávajú uložené v tomto prehliadači a po návrate ich tu nájdete.',
  'take.refused.tooManyVisitors': 'V poslednom čase poslalo odpovede bez prihlásenia priveľa ľudí. Prihláste sa a odošlite tie svoje, alebo to skúste neskôr – zostávajú uložené v tomto prehliadači.',
  'error.offline': 'So stránkou sa nepodarilo spojiť. Skontrolujte pripojenie a skúste to znova.',
  'error.server_error': 'Na serveri sa niečo pokazilo.',
  'error.http': 'Server odpovedal kódom {status}.',
  'error.unknown': 'Niečo sa pokazilo.',
};

/** The page's numbering: question q3 is number 3, and nothing else is known. */
const numberOf = (questionId: string): number | null => (questionId === 'q3' ? 3 : null);

function words(language: 'en' | 'sk'): TranslationService {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [language === 'sk' ? provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH }) : provideTestTranslations(ENGLISH)] });
  return TestBed.inject(TranslationService);
}

/** A refusal with the server's own English sentence in it - which must never come out. */
function refusal(status: number, code: string, body: Record<string, unknown> = {}): ApiError {
  return new ApiError(status, code, 'THE SERVER’S SENTENCE', body);
}

describe('sendFailure(): why the answers were not kept', () => {
  it('tells the refusals the page acts on apart', () => {
    expect(sendFailure(refusal(409, 'already_answered'))).toBe('already');
    expect(sendFailure(refusal(409, 'not_open'))).toBe('closed');
    expect(sendFailure(refusal(422, 'invalid_answer', { questionId: 'q3' }))).toBe('answer');
    expect(sendFailure(refusal(422, 'invalid_answer'))).toBe('answer');
    expect(sendFailure(refusal(401, 'invalid_token'))).toBe('signedOut');
    expect(sendFailure(refusal(401, 'sign_in_required'))).toBe('signedOut');
    // The API's own "no such survey": moved to another address, or deleted.
    expect(sendFailure(refusal(404, 'not_found'))).toBe('gone');
  });

  it('takes a 401 to a visitor’s answers for a site that has come to require a sign-in - nobody’s sign-in ran out', () => {
    expect(sendFailure(refusal(401, 'sign_in_required'), true)).toBe('signInRequired');
    expect(sendFailure(refusal(401, 'visitor_unknown'), true)).toBe('signInRequired');
    expect(sendFailure(refusal(401, 'sign_in_required'), false)).toBe('signedOut');
  });

  it('tells the limit on new visitors apart, for a visitor and anybody', () => {
    expect(sendFailure(refusal(429, 'too_many_visitors'), true)).toBe('tooManyVisitors');
    expect(sendFailure(refusal(429, 'too_many_visitors'))).toBe('tooManyVisitors');
  });

  it('takes everything else as a request that failed', () => {
    expect(sendFailure(refusal(0, 'offline'))).toBe('other');
    expect(sendFailure(refusal(500, 'server_error'))).toBe('other');
  });

  it('takes a 404 that is not the API’s own for a request that failed: it says nothing about the survey', () => {
    // A proxy's page, or the hosting's: no code in it, so the code is the status.
    expect(sendFailure(toApiError(new HttpErrorResponse({ status: 404, error: '<html>Not Found</html>' })))).toBe('other');
    expect(sendFailure(refusal(404, 'http_404'))).toBe('other');
  });
});

describe('sendFailureText(): what the page says then', () => {
  it('names the question by the page’s own number', () => {
    expect(sendFailureText(words('en'), refusal(422, 'invalid_answer', { questionId: 'q3' }), numberOf)).toBe('Please look at question 3 again.');
    expect(sendFailureText(words('sk'), refusal(422, 'invalid_answer', { questionId: 'q3' }), numberOf)).toBe('Pozrite sa, prosím, ešte raz na otázku 3.');
  });

  it('says "about you" for gender and age, which have no number', () => {
    const i18n = words('sk');
    expect(sendFailureText(i18n, refusal(422, 'invalid_answer', { questionId: 'about-gender' }), numberOf)).toBe('Pozrite sa, prosím, ešte raz na otázky o Vás.');
    expect(sendFailureText(i18n, refusal(422, 'invalid_answer', { questionId: 'about-age' }), numberOf)).toBe('Pozrite sa, prosím, ešte raz na otázky o Vás.');
  });

  it('says so when it cannot tell which answer: no question named, one the page does not have, or not a question id at all', () => {
    const i18n = words('en');
    const unknown = 'One of your answers could not be accepted. Please check them and send them again.';
    expect(sendFailureText(i18n, refusal(422, 'invalid_answer'), numberOf)).toBe(unknown);
    expect(sendFailureText(i18n, refusal(422, 'invalid_answer', { questionId: 'added-since' }), numberOf)).toBe(unknown);
    expect(sendFailureText(i18n, refusal(422, 'invalid_answer', { questionId: 3 }), numberOf)).toBe(unknown);
    expect(sendFailureText(i18n, refusal(422, 'invalid_answer', { questionId: ['q3'] }), numberOf)).toBe(unknown);
  });

  it('has its own words for a survey that closed, one already taken, and a sign-in that ran out', () => {
    const i18n = words('sk');
    expect(sendFailureText(i18n, refusal(409, 'not_open'), numberOf)).toBe(SLOVAK['take.refused.closed']);
    expect(sendFailureText(i18n, refusal(409, 'already_answered'), numberOf)).toBe(SLOVAK['take.refused.already']);
    expect(sendFailureText(i18n, refusal(401, 'invalid_token'), numberOf)).toBe(SLOVAK['take.refused.signedOut']);
  });

  it('has its own words for a visitor: sign in now that the site requires it, or wait out the limit on new visitors', () => {
    const i18n = words('sk');
    expect(sendFailureText(i18n, refusal(401, 'sign_in_required'), numberOf, true)).toBe(SLOVAK['take.refused.signInRequired']);
    expect(sendFailureText(i18n, refusal(429, 'too_many_visitors'), numberOf, true)).toBe(SLOVAK['take.refused.tooManyVisitors']);
  });

  it('says that the survey is gone from its address, and where to carry on - never "try again", which could not work', () => {
    const slovak = sendFailureText(words('sk'), refusal(404, 'not_found'), numberOf);
    expect(slovak).toBe(
      'Tento prieskum sa už na tejto adrese nenachádza, takže odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – ak sa prieskum presunul, otvorte ho zo zoznamu prieskumov a pokračujte.',
    );
    expect(slovak).not.toContain('skúste to znova');
    const english = sendFailureText(words('en'), refusal(404, 'not_found'), numberOf);
    expect(english).toBe(
      'This survey is no longer at this address, so your answers could not be sent. They are kept in this browser - if the survey has moved, open it from the list of surveys and carry on.',
    );
    expect(english).not.toContain('try again');
  });

  it('puts two whole sentences side by side for the rest: what failed, and that the answers are kept', () => {
    const offline = toApiError(new HttpErrorResponse({ status: 0 }));
    expect(sendFailureText(words('en'), offline, numberOf)).toBe(
      'The site could not be reached. Check the connection and try again. Your answers could not be sent. They are kept in this browser - try again.',
    );
    expect(sendFailureText(words('sk'), offline, numberOf)).toBe(
      'So stránkou sa nepodarilo spojiť. Skontrolujte pripojenie a skúste to znova. Odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – skúste to znova.',
    );
    const gateway = toApiError(new HttpErrorResponse({ status: 502, error: '<html>Bad gateway</html>' }));
    expect(sendFailureText(words('sk'), gateway, numberOf)).toBe('Server odpovedal kódom 502. Odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – skúste to znova.');
    // A code nobody listed.
    expect(sendFailureText(words('sk'), refusal(418, 'teapot'), numberOf)).toBe('Niečo sa pokazilo. Odpovede sa nepodarilo odoslať. Zostávajú uložené v tomto prehliadači – skúste to znova.');
  });

  it('never shows the server’s sentence, whatever was refused', () => {
    const errors = [
      refusal(409, 'already_answered'),
      refusal(409, 'not_open'),
      refusal(422, 'invalid_answer', { questionId: 'q3' }),
      refusal(422, 'invalid_answer', { questionId: 'about-age' }),
      refusal(422, 'invalid_answer'),
      refusal(401, 'invalid_token'),
      refusal(401, 'sign_in_required'),
      refusal(429, 'too_many_visitors'),
      refusal(404, 'not_found'),
      refusal(500, 'server_error'),
      refusal(418, 'teapot'),
    ];
    for (const language of ['en', 'sk'] as const) {
      const i18n = words(language);
      for (const error of errors) {
        expect(sendFailureText(i18n, error, numberOf)).not.toContain('SENTENCE');
        expect(sendFailureText(i18n, error, numberOf, true)).not.toContain('SENTENCE');
      }
    }
  });
});
