import { computed, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApiError, ApiService, VisitorMove } from '../api/api.service';
import { VISITOR_SLOT, readDraft, writeDraft } from '../survey/drafts';
import { Person } from '../survey/survey.model';
import { AuthService } from './auth.service';
import { MOVE_RETRY_MS, VISITOR_STORAGE_KEY, VisitorKey } from './visitor-key';

const KEY = 'k'.repeat(43);
const OTHER_KEY = 'o'.repeat(43);
const ZUZKA: Person = { id: '12', name: 'Zuzka', email: 'zuzka@example.com' };

describe('VisitorKey', () => {
  const person = signal<Person | null>(null);
  const auth = { person, signedIn: computed(() => person() !== null) };
  const api = { moveVisitor: vi.fn<(key: string) => Promise<VisitorMove>>() };

  function make(): VisitorKey {
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: ApiService, useValue: api },
      ],
    });
    const visitor = TestBed.inject(VisitorKey);
    TestBed.tick();
    return visitor;
  }

  /** Lets a move's answer arrive and what follows it run. */
  const settle = async () => {
    for (let turn = 0; turn < 3; turn++) {
      await Promise.resolve();
    }
    TestBed.tick();
  };

  beforeEach(() => {
    localStorage.clear();
    person.set(null);
    api.moveVisitor.mockReset().mockResolvedValue({ found: true, moved: 0, kept: 0 });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  describe('the key', () => {
    it('is the one this browser holds - and nothing that is not shaped like a key', () => {
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      expect(make().key()).toBe(KEY);
      TestBed.resetTestingModule();
      localStorage.setItem(VISITOR_STORAGE_KEY, 'not a key');
      expect(make().current()).toBeNull();
    });

    it('is read at send time: what another tab stored or forgot meanwhile, never what was read at the start', () => {
      const visitor = make();
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      expect(visitor.current()).toBe(KEY);
      expect(visitor.key()).toBe(KEY);
      localStorage.removeItem(VISITOR_STORAGE_KEY);
      expect(visitor.current()).toBeNull();
    });

    it('follows another tab through the storage event', () => {
      const visitor = make();
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      window.dispatchEvent(new StorageEvent('storage', { key: VISITOR_STORAGE_KEY }));
      expect(visitor.key()).toBe(KEY);
    });

    it('keeps the first key: one a second tab was given does not replace it', () => {
      const visitor = make();
      visitor.remember(KEY);
      visitor.remember(OTHER_KEY);
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBe(KEY);
      expect(visitor.key()).toBe(KEY);
      visitor.remember('short');
      expect(visitor.key()).toBe(KEY);
    });

    it('forgets only the key it was told, while that one is held - and says when it was lost', () => {
      const visitor = make();
      visitor.remember(KEY);
      visitor.forget(OTHER_KEY, true);
      expect(visitor.key()).toBe(KEY);
      expect(visitor.lost()).toBe(false);
      visitor.forget(KEY, true);
      expect(visitor.key()).toBeNull();
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
      expect(visitor.lost()).toBe(true);
      // A new key: the visit is not lost any more.
      visitor.remember(OTHER_KEY);
      expect(visitor.lost()).toBe(false);
    });

    it('lives in memory for the tab when storage refuses it', () => {
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
        throw new DOMException('full', 'QuotaExceededError');
      });
      const visitor = make();
      visitor.remember(KEY);
      expect(visitor.current()).toBe(KEY);
      visitor.forget(KEY);
      expect(visitor.current()).toBeNull();
    });
  });

  describe('after a sign-in', () => {
    it('makes the visitor’s drafts the person’s', () => {
      writeDraft('s1', VISITOR_SLOT, { stepIndex: 1, answers: {}, startedAt: '2026-10-01T10:00:00Z', savedAt: '2026-10-01T10:00:00Z' });
      make();
      expect(readDraft('s1', VISITOR_SLOT)).not.toBeNull();
      person.set(ZUZKA);
      TestBed.tick();
      expect(readDraft('s1', ZUZKA.id)?.stepIndex).toBe(1);
      expect(readDraft('s1', VISITOR_SLOT)).toBeNull();
    });

    it('moves nothing without a key, and nothing while nobody is signed in', async () => {
      const visitor = make();
      person.set(ZUZKA);
      await settle();
      expect(api.moveVisitor).not.toHaveBeenCalled();
      person.set(null);
      visitor.remember(KEY);
      await settle();
      expect(api.moveVisitor).not.toHaveBeenCalled();
    });

    it('moves what the visitor answered, then forgets the key, counts the move, and says what it did', async () => {
      api.moveVisitor.mockResolvedValue({ found: true, moved: 2, kept: 1 });
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      const visitor = make();
      person.set(ZUZKA);
      await settle();
      expect(api.moveVisitor).toHaveBeenCalledWith(KEY);
      expect(visitor.key()).toBeNull();
      expect(localStorage.getItem(VISITOR_STORAGE_KEY)).toBeNull();
      expect(visitor.moves()).toBe(1);
      expect(visitor.moved()).toEqual({ found: true, moved: 2, kept: 1 });
      expect(visitor.lost()).toBe(false);
    });

    it('forgets a key nobody has any more (another tab moved it) and says nothing', async () => {
      api.moveVisitor.mockResolvedValue({ found: false, moved: 0, kept: 0 });
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      person.set(ZUZKA);
      const visitor = make();
      await settle();
      expect(visitor.key()).toBeNull();
      expect(visitor.moves()).toBe(1);
      expect(visitor.moved()).toBeNull();
    });

    it('asks once at a time', async () => {
      let answer!: (move: VisitorMove) => void;
      api.moveVisitor.mockReturnValue(new Promise((done) => (answer = done)));
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      person.set(ZUZKA);
      const visitor = make();
      void visitor.moveIntoAccount();
      void visitor.moveIntoAccount();
      expect(api.moveVisitor).toHaveBeenCalledTimes(1);
      answer({ found: true, moved: 1, kept: 0 });
      await settle();
      expect(visitor.key()).toBeNull();
    });

    it('keeps the key after no answer or a 5xx, and asks again later - a Retry-After wins', async () => {
      vi.useFakeTimers();
      api.moveVisitor.mockRejectedValueOnce(new ApiError(0, 'offline', 'x')).mockRejectedValueOnce(new ApiError(503, 'visitor_move_retry', 'x', {}, 5));
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      person.set(ZUZKA);
      const visitor = make();
      await settle();
      expect(api.moveVisitor).toHaveBeenCalledTimes(1);
      expect(visitor.key()).toBe(KEY);

      await vi.advanceTimersByTimeAsync(MOVE_RETRY_MS[0]);
      expect(api.moveVisitor).toHaveBeenCalledTimes(2);
      expect(visitor.key()).toBe(KEY);

      // The server asked for 5 s: not the next of the list (10 s).
      await vi.advanceTimersByTimeAsync(4_999);
      expect(api.moveVisitor).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(api.moveVisitor).toHaveBeenCalledTimes(3);
      await settle();
      expect(visitor.key()).toBeNull();
    });

    it('gives up for this page load after the last wait - the key stays for the next', async () => {
      vi.useFakeTimers();
      api.moveVisitor.mockRejectedValue(new ApiError(500, 'server_error', 'x'));
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      person.set(ZUZKA);
      const visitor = make();
      await settle();
      await vi.advanceTimersByTimeAsync(MOVE_RETRY_MS.reduce((sum, wait) => sum + wait, 0) + 60_000);
      expect(api.moveVisitor).toHaveBeenCalledTimes(MOVE_RETRY_MS.length + 1);
      expect(visitor.key()).toBe(KEY);
    });

    it('forgets something the server says is no key (422), and keeps the key when the sign-in ended meanwhile (401)', async () => {
      api.moveVisitor.mockRejectedValueOnce(new ApiError(401, 'sign_in_required', 'x'));
      localStorage.setItem(VISITOR_STORAGE_KEY, KEY);
      person.set(ZUZKA);
      const visitor = make();
      await settle();
      expect(visitor.key()).toBe(KEY);

      api.moveVisitor.mockRejectedValueOnce(new ApiError(422, 'invalid_visitor_key', 'x'));
      await visitor.moveIntoAccount();
      expect(visitor.key()).toBeNull();
      expect(visitor.moves()).toBe(0);
    });
  });
});
