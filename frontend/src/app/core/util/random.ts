/**
 * A seeded random number generator, for example data that comes out the same
 * on every reset: the same people, with the same answers, so a result seen
 * once can be found again.
 */
export type Random = () => number;

/** mulberry32: small, fast, and good enough for made-up survey answers. */
export function seededRandom(seed: number): Random {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** True with the given probability (0 to 1). */
export function chance(random: Random, probability: number): boolean {
  return random() < probability;
}

/** An index, each with the chance its weight gives it. Negative weights count as none. */
export function weightedIndex(random: Random, weights: readonly number[]): number {
  const clean = weights.map((weight) => Math.max(0, weight));
  const total = clean.reduce((sum, weight) => sum + weight, 0);
  let roll = random() * total;
  for (let i = 0; i < clean.length; i++) {
    roll -= clean[i];
    if (roll < 0) {
      return i;
    }
  }
  return clean.length - 1;
}

export function pick<T>(random: Random, items: readonly T[]): T {
  return items[Math.floor(random() * items.length)];
}

/** A shuffled copy (Fisher-Yates). */
export function shuffled<T>(random: Random, items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** A whole number from min to max, both included. */
export function between(random: Random, min: number, max: number): number {
  return min + Math.floor(random() * (max - min + 1));
}
