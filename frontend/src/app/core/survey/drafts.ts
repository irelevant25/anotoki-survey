import { readStorage, writeStorage } from '../util/storage';
import { Answer } from './survey.model';

/**
 * A survey somebody has started and not sent: kept in their browser after
 * every change, so closing the tab or losing the connection costs nothing.
 * It is theirs alone - nothing of it reaches anybody until they send it -
 * and it goes when they do. Kept by the survey's id and the person's (the
 * IAM's id), or - for somebody taking surveys without signing in - under
 * VISITOR_SLOT: a draft never makes a visitor on the server.
 *
 * `answers` holds gender and age too, under GENDER_ID and AGE_ID.
 */
export interface Draft {
  stepIndex: number;
  answers: Record<string, Answer>;
  startedAt: string;
  savedAt: string;
}

/** Where the drafts of this browser's visitor are kept, in place of a person's id (an IAM id is a number, never this). */
export const VISITOR_SLOT = 'visitor';

/** The start of every draft's name in localStorage: `anotoki-survey:draft:{surveyId}:{personId}` (the Privacy page names it). */
export const DRAFT_PREFIX = 'anotoki-survey:draft:';
const PREFIX = DRAFT_PREFIX;

function key(surveyId: string, personId: string): string {
  return `${PREFIX}${surveyId}:${personId}`;
}

export function readDraft(surveyId: string, personId: string): Draft | null {
  const raw = readStorage(key(surveyId, personId));
  if (!raw) {
    return null;
  }
  try {
    const draft = JSON.parse(raw) as Draft;
    return typeof draft?.stepIndex === 'number' && draft.answers && typeof draft.answers === 'object' && typeof draft.startedAt === 'string' ? draft : null;
  } catch {
    return null;
  }
}

export function writeDraft(surveyId: string, personId: string, draft: Draft): void {
  writeStorage(key(surveyId, personId), JSON.stringify(draft));
}

export function clearDraft(surveyId: string, personId: string): void {
  writeStorage(key(surveyId, personId), null);
}

/**
 * At a sign-in, the visitor's draft of one survey becomes the person's - when
 * the person has none of it; when they have, theirs stays and the visitor's
 * goes (the rule the server keeps for answers both sent: the person's win).
 */
export function adoptVisitorDraft(surveyId: string, personId: string): void {
  if (personId === VISITOR_SLOT) {
    return;
  }
  const visitor = readStorage(key(surveyId, VISITOR_SLOT));
  if (visitor === null) {
    return;
  }
  if (readDraft(surveyId, personId) === null && readDraft(surveyId, VISITOR_SLOT) !== null) {
    writeStorage(key(surveyId, personId), visitor);
  }
  writeStorage(key(surveyId, VISITOR_SLOT), null);
}

/**
 * At a sign-in, every draft this browser's visitor left becomes the person's
 * (adoptVisitorDraft() for each). Called before the first page is drawn
 * (boot()) and at a sign-in in another tab (VisitorKey); storage that refuses
 * to be read leaves them where they are.
 */
export function adoptVisitorDrafts(personId: string): void {
  const surveys: string[] = [];
  try {
    const storage = globalThis.localStorage;
    for (let index = 0; storage && index < storage.length; index++) {
      const name = storage.key(index);
      if (name?.startsWith(PREFIX) && name.endsWith(`:${VISITOR_SLOT}`)) {
        surveys.push(name.slice(PREFIX.length, -(VISITOR_SLOT.length + 1)));
      }
    }
  } catch {
    return;
  }
  for (const surveyId of surveys) {
    adoptVisitorDraft(surveyId, personId);
  }
}
