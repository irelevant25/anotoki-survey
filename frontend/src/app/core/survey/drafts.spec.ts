import { Draft, VISITOR_SLOT, adoptVisitorDraft, adoptVisitorDrafts, clearDraft, readDraft, writeDraft } from './drafts';

const draft = (stepIndex: number): Draft => ({ stepIndex, answers: { q1: { optionIds: ['o1'], other: '', text: '' } }, startedAt: '2026-10-01T10:00:00.000Z', savedAt: '2026-10-01T10:05:00.000Z' });

describe('drafts: what somebody started and has not sent, kept in this browser', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('keeps a draft by the survey and by who takes it - a person, or this browser’s visitor', () => {
    writeDraft('s1', '12', draft(1));
    writeDraft('s1', VISITOR_SLOT, draft(2));
    expect(readDraft('s1', '12')?.stepIndex).toBe(1);
    expect(readDraft('s1', VISITOR_SLOT)?.stepIndex).toBe(2);
    clearDraft('s1', VISITOR_SLOT);
    expect(readDraft('s1', VISITOR_SLOT)).toBeNull();
    expect(readDraft('s1', '12')).not.toBeNull();
  });

  describe('at a sign-in, the visitor’s drafts become the person’s', () => {
    it('into an empty slot', () => {
      writeDraft('s1', VISITOR_SLOT, draft(2));
      adoptVisitorDraft('s1', '12');
      expect(readDraft('s1', '12')).toEqual(draft(2));
      expect(readDraft('s1', VISITOR_SLOT)).toBeNull();
    });

    it('never over the person’s own: theirs stays, and the visitor’s goes', () => {
      writeDraft('s1', VISITOR_SLOT, draft(2));
      writeDraft('s1', '12', draft(0));
      adoptVisitorDraft('s1', '12');
      expect(readDraft('s1', '12')).toEqual(draft(0));
      expect(readDraft('s1', VISITOR_SLOT)).toBeNull();
    });

    it('drops one that is not a draft, and takes nothing into the person’s slot for it', () => {
      localStorage.setItem(`anotoki-survey:draft:s1:${VISITOR_SLOT}`, '{"not":"a draft"}');
      adoptVisitorDraft('s1', '12');
      expect(localStorage.getItem('anotoki-survey:draft:s1:12')).toBeNull();
      expect(localStorage.getItem(`anotoki-survey:draft:s1:${VISITOR_SLOT}`)).toBeNull();
    });

    it('every survey’s at once - and nobody else’s draft is touched', () => {
      writeDraft('s1', VISITOR_SLOT, draft(1));
      writeDraft('s:2', VISITOR_SLOT, draft(2));
      writeDraft('s3', '99', draft(3));
      localStorage.setItem('something-else:visitor', 'x');
      adoptVisitorDrafts('12');
      expect(readDraft('s1', '12')?.stepIndex).toBe(1);
      expect(readDraft('s:2', '12')?.stepIndex).toBe(2);
      expect(readDraft('s3', '99')?.stepIndex).toBe(3);
      expect(readDraft('s3', '12')).toBeNull();
      expect(localStorage.getItem('something-else:visitor')).toBe('x');
      expect(Object.keys(localStorage).filter((name) => name.endsWith(`:${VISITOR_SLOT}`))).toEqual(['something-else:visitor']);
    });

    it('leaves them where they are when storage cannot be read', () => {
      writeDraft('s1', VISITOR_SLOT, draft(1));
      vi.spyOn(Storage.prototype, 'key').mockImplementation(() => {
        throw new DOMException('denied', 'SecurityError');
      });
      expect(() => adoptVisitorDrafts('12')).not.toThrow();
      vi.restoreAllMocks();
      expect(readDraft('s1', VISITOR_SLOT)?.stepIndex).toBe(1);
    });
  });
});
