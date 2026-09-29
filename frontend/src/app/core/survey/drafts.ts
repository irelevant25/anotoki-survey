import { readStorage, writeStorage } from '../util/storage';
import { Answer } from './survey.model';

/**
 * A survey somebody has started and not sent: kept in their browser after
 * every change, so closing the tab or losing the connection costs nothing.
 * It is theirs alone - nothing of it reaches anybody until they send it -
 * and it goes when they do.
 *
 * `answers` holds gender and age too, under GENDER_ID and AGE_ID.
 */
export interface Draft {
  stepIndex: number;
  answers: Record<string, Answer>;
  startedAt: string;
  savedAt: string;
}

function key(surveyId: string, personId: string): string {
  return `anotoki-survey:draft:${surveyId}:${personId}`;
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
