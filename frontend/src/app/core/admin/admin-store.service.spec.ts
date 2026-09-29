import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService } from '../api/api.service';
import { AuthService } from '../auth/auth.service';
import { newSurvey } from '../survey/survey-factory';
import { Person, Survey } from '../survey/survey.model';
import { AdminStore, SAVE_DELAY_MS } from './admin-store.service';

/** A promise the test settles by hand: the server's answer, when the test says. */
function later<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const ANNA: Person = { id: '1', name: 'anna', email: 'anna@example.test' };
const BEN: Person = { id: '2', name: 'ben', email: 'ben@example.test' };

function survey(revision: number, title = 'Genshin 1.0'): Survey {
  return { ...newSurvey([]), id: 'survey-1', title, revision };
}

describe('AdminStore: saving what the editor changes', () => {
  let store: AdminStore;
  const api = { survey: vi.fn(), saveSurvey: vi.fn(), setStatus: vi.fn(), summaries: vi.fn(), responses: vi.fn() };
  const person = signal<Person | null>(ANNA);
  const listeners = new Set<() => void>();
  const signedInAs = (who: Person | null) => {
    person.set(who);
    listeners.forEach((listener) => listener());
  };

  beforeEach(async () => {
    vi.useFakeTimers();
    Object.values(api).forEach((fn) => fn.mockReset());
    person.set(ANNA);
    listeners.clear();
    TestBed.configureTestingModule({
      providers: [
        { provide: ApiService, useValue: api },
        { provide: AuthService, useValue: { person, onAuthChange: (listener: () => void) => (listeners.add(listener), () => listeners.delete(listener)) } },
      ],
    });
    store = TestBed.inject(AdminStore);
    api.survey.mockResolvedValueOnce(survey(3));
    await store.load('survey-1');
  });

  afterEach(() => {
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  it('saves a moment after the last change, made to its revision, and never replaces what is being typed', async () => {
    const first = later<Survey>();
    api.saveSurvey.mockReturnValueOnce(first.promise);
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'A' }));
    expect(store.saveStatus('survey-1').state).toBe('waiting');
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(api.saveSurvey).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(api.saveSurvey).toHaveBeenCalledWith(expect.objectContaining({ title: 'A' }), 3);

    // Typed on while the save is on its way.
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'AB' }));
    first.resolve(survey(4, 'A'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.survey('survey-1')?.title).toBe('AB');
    expect(store.survey('survey-1')?.revision).toBe(4);

    api.saveSurvey.mockResolvedValueOnce(survey(5, 'AB'));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'AB' }), 4);
    expect(store.saveStatus('survey-1').state).toBe('saved');
    expect(store.unsaved()).toBe(false);
  });

  it("meets somebody else's save as a conflict for the editor to settle - never saved over by itself", async () => {
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: survey(7, 'Theirs') }));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.saveStatus('survey-1').state).toBe('conflict');
    expect(store.saveStatus('survey-1').theirs?.title).toBe('Theirs');

    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine, still' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 3);
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);

    api.saveSurvey.mockResolvedValueOnce(survey(8, 'Mine, still'));
    store.keepMine('survey-1');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'Mine, still' }), 7);
    expect(store.saveStatus('survey-1').state).toBe('saved');
  });

  it('takes their version when the editor says so', async () => {
    api.saveSurvey.mockRejectedValueOnce(new ApiError(409, 'conflict', 'Somebody else has saved this survey.', { survey: survey(7, 'Theirs') }));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Mine' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    store.takeTheirs('survey-1');
    expect(store.survey('survey-1')).toMatchObject({ title: 'Theirs', revision: 7 });
    expect(store.unsaved()).toBe(false);
  });

  it('keeps what is here when an older survey arrives late from a fresh load', async () => {
    const slow = later<Survey>();
    api.survey.mockReturnValueOnce(slow.promise);
    void store.load('survey-1', true);

    api.saveSurvey.mockResolvedValueOnce(survey(4, 'Typed'));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Typed' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.survey('survey-1')?.revision).toBe(4);

    slow.resolve(survey(3, 'Genshin 1.0'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.survey('survey-1')).toMatchObject({ title: 'Typed', revision: 4 });
  });

  it('keeps unsaved changes when the session ends, and lets them go only when somebody else signs in', async () => {
    api.saveSurvey.mockRejectedValueOnce(new ApiError(0, 'offline', 'The site could not be reached.'));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Not saved yet' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.saveStatus('survey-1').state).toBe('failed');

    signedInAs(null);
    expect(store.survey('survey-1')?.title).toBe('Not saved yet');
    expect(store.unsaved()).toBe(true);

    signedInAs(ANNA);
    expect(store.survey('survey-1')?.title).toBe('Not saved yet');

    signedInAs(BEN);
    expect(store.survey('survey-1')).toBeUndefined();
    expect(store.unsaved()).toBe(false);
  });

  it('opens after the waiting changes are saved, and saves after it to the revision it brings', async () => {
    api.saveSurvey.mockResolvedValueOnce(survey(4, 'Before'));
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'Before' }));
    const opening = later<Survey>();
    api.setStatus.mockReturnValueOnce(opening.promise);
    const opened = store.setStatus('survey-1', 'open');
    await vi.advanceTimersByTimeAsync(0);
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);
    expect(api.setStatus).toHaveBeenCalledWith('survey-1', 'open', undefined);

    // Typed while the survey opens: that save waits for it.
    store.updateSurvey('survey-1', (s) => ({ ...s, title: 'After' }));
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(api.saveSurvey).toHaveBeenCalledTimes(1);

    api.saveSurvey.mockResolvedValueOnce(survey(6, 'After'));
    opening.resolve({ ...survey(5, 'Before'), status: 'open', openedAt: '2026-09-29T12:00:00.000Z' });
    await opened;
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS);
    expect(store.survey('survey-1')).toMatchObject({ status: 'open', title: 'After' });
    expect(api.saveSurvey).toHaveBeenLastCalledWith(expect.objectContaining({ title: 'After' }), 5);
  });

  it('reopens a survey whose last day has passed without that day', async () => {
    store.updateSurvey('survey-1', (s) => ({ ...s, closesOn: '2020-01-01' }));
    api.saveSurvey.mockResolvedValueOnce({ ...survey(4), closesOn: '2020-01-01' });
    api.setStatus.mockResolvedValueOnce({ ...survey(5), status: 'open', closesOn: null });
    await store.setStatus('survey-1', 'open');
    expect(api.setStatus).toHaveBeenCalledWith('survey-1', 'open', null);
    expect(store.survey('survey-1')).toMatchObject({ closesOn: null, revision: 5 });
  });
});
