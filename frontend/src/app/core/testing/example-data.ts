import { AGES, AgeKey, GENDERS, GenderKey } from '../survey/about-you';
import { Answer, ChoiceLayout, Person, Question, QuestionType, Step, Survey, SurveyImage, SurveyResponse } from '../survey/survey.model';
import { Random, between, chance, pick, seededRandom, shuffled, weightedIndex } from '../util/random';

/**
 * Example data for the tests (it was the prototype's, before the backend):
 * three surveys - one open with some sixty answers, one draft, one closed -
 * and the made-up people who answered.
 *
 * The answers are drawn by a seeded generator, so a reset gives the same
 * people with the same answers. They are not independent coin flips: each
 * person has a keenness and a mood, which lean their answers the way real
 * ones lean - the daily visitors play more quizzes, the unhappy ones write
 * more about what to improve - so filtering the results shows differences
 * worth finding. Times are counted back from now, so the example stays
 * recent whenever it is reset.
 *
 * People are gamer handles at example.com, a domain reserved for examples:
 * nobody real.
 */

const SEED = 20260929;
const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/** A person who has taken no survey yet. */
export const PROTOTYPE_YOU: Person = { id: 'person-you', name: 'You' };

const HANDLES = [
  'aether.wanders',
  'lumine_sk',
  'paimon.snacks',
  'kazuha.leaves',
  'zhongli.coin',
  'hutao.boo',
  'noelle.maid',
  'xiao.yaksha',
  'raiden.fan',
  'cocogoat',
  'venti.bard',
  'klee.boom',
  'diluc.wine',
  'kaeya.ice',
  'barbara.idol',
  'bennett.luck',
  'xiangling.chef',
  'fischl.oz',
  'sucrose.lab',
  'mona.astro',
  'albedo.chalk',
  'ayaka.snow',
  'yoimiya.fire',
  'itto.oni',
  'kokomi.tides',
  'nahida.seeds',
  'tighnari.forest',
  'cyno.puns',
  'nilou.dance',
  'alhaitham.reads',
  'furina.stage',
  'neuvillette.rain',
  'navia.sun',
  'chiori.tailor',
  'clorinde.duel',
  'mualani.surf',
  'xilonen.forge',
  'citlali.stars',
  'traveler42',
  'starlight.mk',
  'mora.miner',
  'resin.saver',
  'wish.upon',
  'primo.hoarder',
  'gacha.goblin',
  'fontaine.fan',
  'inazuma.nights',
  'sumeru.scholar',
  'liyue.harbor',
  'mondstadt.breeze',
  'teapot.builder',
  'domain.runner',
  'artifact.farmer',
  'spiral.abyss',
  'pity.counter',
  'fifty.fifty',
  'c6.dreamer',
  'crit.ratio',
  'elemental.sight',
  'anemo.slime',
  'geo.construct',
  'hydro.mimic',
  'pyro.lector',
  'cryo.vine',
  'dendro.core',
  'electro.charge',
  'waverider',
  'statue.seven',
  'waypoint.hopper',
  'oculus.hunter',
  'chest.finder',
  'fishing.rod',
  'serenitea',
  'sticky.honey',
  'sweet.madame',
  'jueyun.chili',
  'glaze.lily',
  'violetgrass',
  'windwheel',
  'mist.flower',
  'sakura.bloom',
  'sango.pearl',
  'lotus.head',
  'rainbow.rose',
  'lumidouce',
  'qingxin',
  'wolfhook',
  'cecilia',
];

// ─────────────────────────────────────────────────────────────────────────────
// Building blocks: questions with ids that read well in an address bar.
// ─────────────────────────────────────────────────────────────────────────────

type OptionSpec = string | { label: string; other?: true; images?: SurveyImage[] };

function other(label = 'Other'): OptionSpec {
  return { label, other: true };
}

/** An example picture, at an address like the server's. */
function examplePicture(file: string, width: number, height: number, alt = ''): SurveyImage {
  const id = `example-${file.replace(/\.svg$/, '')}`;
  return { id, alt, width, height, src: `/api/images/${id}.webp` };
}

const ELEMENTS = ['Anemo', 'Geo', 'Electro', 'Dendro', 'Hydro', 'Pyro', 'Cryo'];

function question(id: string, type: QuestionType, text: string, options: OptionSpec[], extra: Partial<Question> = {}): Question {
  return {
    id,
    type,
    text,
    images: [],
    required: true,
    options: options.map((option, i) => ({
      id: `${id}-o${i + 1}`,
      label: typeof option === 'string' ? option : option.label,
      other: typeof option !== 'string' && !!option.other,
      images: typeof option === 'string' ? [] : (option.images ?? []),
    })),
    layout: 'list' as ChoiceLayout,
    minChoices: null,
    maxChoices: null,
    multiline: true,
    maxLength: null,
    placeholder: '',
    ...extra,
  };
}

function step(id: string, title: string, questions: Question[]): Step {
  return { id, title, questions };
}

function iso(time: number): string {
  return new Date(time).toISOString();
}

function isoDay(time: number): string {
  const date = new Date(time);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function personFor(handle: string): Person {
  return { id: `person-${handle}`, name: handle };
}

// ─────────────────────────────────────────────────────────────────────────────
// The surveys
// ─────────────────────────────────────────────────────────────────────────────

const QUIZZES = ['Daily run', 'Banner quiz', 'Dish quiz', 'Odd one out', 'Music quiz', 'Pixelated art', 'Voice lines', 'Elemental minesweeper', 'Tournament'];

function genshinSurvey(now: number): Survey {
  const opened = now - 9 * DAY - 3 * 60 * MINUTE;
  return {
    id: 'example-genshin',
    slug: 'genshin-1-0',
    title: 'genshin.anotoki.eu · Version 1.0 survey',
    intro:
      '<p>Thank you for playing with us! Version <strong>1.0</strong> of genshin.anotoki.eu is here, and we would love to know what you think of it - what you enjoy, and what you would change.</p>' +
      '<p>It takes <mark>a few minutes</mark>. You can go back to any step before you send your answers.</p>',
    thanks: '<p>Thank you for your answers! We read every one of them, and they decide what comes next.</p><p>See you in the next version, Traveler.</p>',
    askAboutYou: true,
    status: 'open',
    closesOn: isoDay(now + 12 * DAY),
    steps: [
      step('g-s1', 'You and the site', [
        question('g-q1', 'single', '<p>How often do you visit <strong>genshin.anotoki.eu</strong>?</p>', [
          'Every day',
          'A few times a week',
          'A few times a month',
          'Less often',
          'This is my first visit',
        ]),
        question('g-q2', 'single', '<p>How did you first hear about the site?</p>', ['From a friend', 'On Discord', 'On Reddit', 'On YouTube', 'Searching the web', other('Somewhere else')], {
          layout: 'columns',
        }),
        question('g-q3', 'single', '<p>How easy is it to find what you are looking for?</p>', ['Very hard', 'Hard', 'Okay', 'Easy', 'Very easy'], { layout: 'scale' }),
      ]),
      step('g-s2', 'Quizzes and games', [
        question('g-q4', 'multiple', '<p>Which quizzes and games have you played?</p>', QUIZZES, { layout: 'columns', required: false }),
        question('g-q5', 'multiple', '<p>Which are your <strong>favourites</strong>? Pick <mark>up to three</mark>.</p>', QUIZZES, { layout: 'columns', required: false, maxChoices: 3 }),
        question('g-q6', 'single', '<p>How hard are the quizzes for you?</p>', ['Too easy', 'A bit easy', 'Just right', 'A bit hard', 'Too hard'], { layout: 'scale', required: false }),
        question(
          'g-q13',
          'single',
          '<p>Which element do you like playing <strong>most</strong>?</p>',
          ELEMENTS.map((label) => ({ label, images: [examplePicture(`element-${label.toLowerCase()}.svg`, 400, 300)] })),
          { images: [examplePicture('elements.svg', 800, 300, 'The seven elements side by side: Anemo, Geo, Electro, Dendro, Hydro, Pyro and Cryo')] },
        ),
      ]),
      step('g-s3', 'The database', [
        question('g-q7', 'multiple', '<p>Which parts of the database do you use?</p>', ['Characters', 'Weapons', 'Materials', 'Banners', other()], { layout: 'columns' }),
        question(
          'g-q8',
          'multiple',
          '<p>What should we build <strong>next</strong>? Choose one or two.</p>',
          ['Artifact pages', 'Food pages', 'Enemy pages', 'A team builder', other('Something else')],
          {
            minChoices: 1,
            maxChoices: 2,
          },
        ),
      ]),
      step('g-s4', 'Overall', [
        question('g-q14', 'single', '<p>We are trying two new character pages. Which one do you like more?</p>', ['Page A', 'Page B', 'I like them the same'], {
          layout: 'columns',
          images: [
            examplePicture('character-page-a.svg', 800, 520, 'Character page A: the picture on the left, the facts beside it'),
            examplePicture('character-page-b.svg', 800, 520, 'Character page B: a wide picture on top, the facts under it'),
          ],
        }),
        question('g-q9', 'single', '<p>Overall, how happy are you with <strong>version 1.0</strong>?</p>', ['Very unhappy', 'Unhappy', 'Neutral', 'Happy', 'Very happy'], { layout: 'scale' }),
        question('g-q10', 'text', '<p>In one word, the site is…</p>', [], { required: false, multiline: false, maxLength: 40, placeholder: 'One word' }),
        question('g-q11', 'text', '<p>What do you like most about the site?</p>', [], { required: false, maxLength: 1000, placeholder: 'A few words are enough.' }),
        question('g-q12', 'text', '<p>What should we improve first?</p><ul><li>something that bothers you, or</li><li>something you miss.</li></ul>', [], {
          required: false,
          maxLength: 1000,
        }),
      ]),
    ],
    language: 'en',
    translations: {},
    createdAt: iso(opened - 2 * DAY),
    updatedAt: iso(opened - 20 * MINUTE),
    openedAt: iso(opened),
    closedAt: null,
    revision: 12,
  };
}

function japaneseSurvey(now: number): Survey {
  const created = now - 1 * DAY - 5 * 60 * MINUTE;
  return {
    id: 'example-japanese',
    slug: 'japanese-academy',
    title: 'Japanese Academy · First impressions',
    intro: '<p>You have been learning with Japanese Academy for a while now. How is it going?</p>',
    thanks: '<p>ありがとう! Thank you - it helps us more than you know.</p>',
    askAboutYou: false,
    status: 'draft',
    closesOn: null,
    steps: [
      step('j-s1', 'Learning', [
        question('j-q1', 'single', '<p>How long have you been learning Japanese?</p>', ['I just started', 'Less than a year', 'One to three years', 'More than three years']),
        question('j-q2', 'multiple', '<p>Which parts of the course do you use?</p>', ['Kana', 'Vocabulary', 'Grammar', 'Reading', 'Listening'], { layout: 'columns' }),
      ]),
      step('j-s2', 'Your thoughts', [question('j-q3', 'text', '<p>What would help you learn faster?</p>', [], { required: false })]),
    ],
    language: 'en',
    translations: {},
    createdAt: iso(created),
    updatedAt: iso(created + 40 * MINUTE),
    openedAt: null,
    closedAt: null,
    revision: 3,
  };
}

function accountsSurvey(now: number): Survey {
  const opened = now - 26 * DAY;
  const closed = now - 12 * DAY;
  return {
    id: 'example-accounts',
    slug: 'anotoki-accounts',
    title: 'anotoki accounts · Signing in',
    intro: '<p>Every anotoki site now signs you in with one <strong>anotoki account</strong>. Tell us how the move went for you.</p>',
    thanks: '<p>Thank you! If something is still broken, the account page has a way to reach us.</p>',
    askAboutYou: true,
    status: 'closed',
    closesOn: null,
    steps: [
      step('a-s1', 'Signing in', [
        question('a-q1', 'single', '<p>How did signing in with your new anotoki account go?</p>', ['Smoothly', 'A few hiccups', 'It did not work at first']),
        question('a-q2', 'multiple', '<p>Which ways of signing in have you used?</p>', ['Email and password', 'Google', 'Two-factor codes', 'A remembered device']),
      ]),
      step('a-s2', 'Anything else', [question('a-q3', 'text', '<p>Was anything confusing? Tell us about it.</p>', [], { required: false })]),
    ],
    language: 'en',
    translations: {},
    createdAt: iso(opened - 3 * DAY),
    updatedAt: iso(opened - 60 * MINUTE),
    openedAt: iso(opened),
    closedAt: iso(closed),
    revision: 5,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The answers
// ─────────────────────────────────────────────────────────────────────────────

const HEARD_ELSEWHERE = ['TikTok', 'A Twitch stream', 'Instagram', 'My brother told me', 'A school friend', 'A Facebook group'];
const DATABASE_OTHER = ['Talent materials', 'Voice-overs', 'Enemy drops'];
const NEXT_OTHER = ['An achievement tracker', 'An interactive map', 'Card game decks', 'A domain schedule'];
const ONE_WORD = ['Fun', 'Useful', 'Cozy', 'Addictive', 'Clean', 'Handy', 'Cute', 'Fast', 'Promising', 'Helpful', 'Great', 'Pretty', 'Slow', 'Nice', 'Smart'];
const LIKES = [
  'The daily run. I do it every morning with my coffee.',
  'The voice line quiz! I learned lines I never noticed in the game.',
  'It is fast and the design is clean.',
  'Dark mode looks really nice.',
  'Everything about a character on one page.',
  'Elemental minesweeper is way more addictive than it should be.',
  'Banner history - great for planning my pulls.',
  'Search finds things quickly.',
  'That it is also in Slovak!',
  'The pixelated art quiz. Hard, but fun.',
  'The music quiz, some of those tracks are so good.',
  'No ads, no clutter.',
  'Tournaments with my friends.',
  'Material pages show where to farm.',
  'The dish quiz made me hungry.',
  'Quizzes are short enough for a break at school.',
  'My progress stays with my account now.',
  'Nice animations, it feels polished.',
];
const IMPROVE = [
  'More characters in the voice quiz.',
  'A leaderboard for the daily run.',
  'Artifact pages, please!',
  'Let me filter weapons by main stat.',
  'Pages load a bit slowly on my phone.',
  'Show which banners a character was on right on their page.',
  'The music quiz needs a volume slider.',
  'A team builder would be amazing.',
  'Pictures sometimes take a while to appear.',
  'Make the odd-one-out quiz harder, it is too easy now.',
  'More languages - my friend only speaks Czech.',
  'Sometimes I get the same dish twice in a row.',
  'A chart of my old quiz results.',
  'Keyboard shortcuts for the quizzes.',
  'Bigger text on the character pages.',
  'Tell me when a new banner is added.',
];
const ACCOUNT_NOTES = [
  'I did not know I had to confirm my email first.',
  'Google sign-in was instant, great.',
  'The two-factor setup was clear.',
  'I got signed out once on my phone.',
  'Where do I change my username?',
  'Everything worked, thanks.',
  'The code email took a minute to arrive.',
];

/** Some of the options, each with the chance its weight gives it, never the same one twice; in the question's order. */
function pickSome(random: Random, weights: readonly number[], count: number): number[] {
  const left = [...weights];
  const chosen: number[] = [];
  while (chosen.length < count && left.some((weight) => weight > 0)) {
    const index = weightedIndex(random, left);
    chosen.push(index);
    left[index] = 0;
  }
  return chosen.sort((a, b) => a - b);
}

/** A point on a five-point scale (0-4) around `centre` (1-5), a little either side. */
function onScale(random: Random, centre: number, spread = 0.9): number {
  const noise = (random() + random() + random() - 1.5) * spread;
  return Math.min(4, Math.max(0, Math.round(centre + noise) - 1));
}

function aboutYouOf(random: Random, ageWeights: readonly number[]): { gender: GenderKey; age: AgeKey } {
  return { gender: GENDERS[weightedIndex(random, [0.5, 0.38, 0.05, 0.07])].key, age: AGES[weightedIndex(random, ageWeights)].key };
}

/** Collects a person's answers by question. */
class Answers {
  readonly byQuestion: Record<string, Answer> = {};

  choose(question: Question, indexes: number[], otherText = ''): void {
    if (indexes.length) {
      const chosenOther = indexes.some((index) => question.options[index].other);
      this.byQuestion[question.id] = { optionIds: indexes.map((index) => question.options[index].id), other: chosenOther ? otherText : '', text: '' };
    }
  }

  write(question: Question, text: string): void {
    this.byQuestion[question.id] = { optionIds: [], other: '', text };
  }
}

function genshinResponses(random: Random, survey: Survey, people: Person[], now: number): SurveyResponse[] {
  const [s1, s2, s3, s4] = survey.steps;
  const [visit, heard, findable] = s1.questions;
  const [played, favourites, difficulty, element] = s2.questions;
  const [parts, next] = s3.questions;
  const [pages, overall, oneWord, likes, improve] = s4.questions;
  const opened = Date.parse(survey.openedAt as string);

  return people.map((person, index) => {
    const keen = random();
    const mood = Math.min(1, 0.3 + 0.5 * random() + 0.25 * keen);
    const a = new Answers();

    a.choose(visit, [weightedIndex(random, [0.05 + 0.45 * keen, 0.2 + 0.25 * keen, 0.35 - 0.1 * keen, 0.25 - 0.3 * keen, 0.12 - 0.12 * keen])]);
    const heardIndex = weightedIndex(random, [0.28, 0.24, 0.1, 0.12, 0.18, 0.08]);
    a.choose(heard, [heardIndex], pick(random, HEARD_ELSEWHERE));
    a.choose(findable, [onScale(random, 1.8 + 2.6 * mood)]);

    const popularity = [0.8, 0.55, 0.45, 0.5, 0.4, 0.35, 0.6, 0.3, 0.15];
    let playedIndexes = popularity.map((p, i) => (chance(random, Math.min(0.97, p * (0.45 + 0.75 * keen))) ? i : -1)).filter((i) => i >= 0);
    if (!playedIndexes.length && chance(random, 0.6)) {
      playedIndexes = [0];
    }
    a.choose(played, playedIndexes);
    if (playedIndexes.length && chance(random, 0.92)) {
      const liked = [0.9, 0.5, 0.4, 0.45, 0.5, 0.35, 0.8, 0.55, 0.3].map((weight, i) => (playedIndexes.includes(i) ? weight : 0));
      a.choose(favourites, pickSome(random, liked, between(random, 1, Math.min(3, playedIndexes.length))));
    }
    if (playedIndexes.length && chance(random, 0.94)) {
      a.choose(difficulty, [weightedIndex(random, [0.06, 0.18, 0.46, 0.22, 0.08])]);
    }
    a.choose(element, [weightedIndex(random, [0.16, 0.12, 0.2, 0.12, 0.16, 0.14, 0.1])]);

    const partsIndexes = [0.85, 0.55, 0.48, 0.42, 0.07].map((p, i) => (chance(random, p) ? i : -1)).filter((i) => i >= 0);
    a.choose(parts, partsIndexes.length ? partsIndexes : [0], pick(random, DATABASE_OTHER));
    a.choose(next, pickSome(random, [0.34, 0.14, 0.2, 0.42, 0.08], chance(random, 0.6) ? 2 : 1), pick(random, NEXT_OTHER));

    a.choose(pages, [weightedIndex(random, [0.44, 0.36, 0.2])]);
    a.choose(overall, [onScale(random, 1.4 + 3.0 * mood, 0.8)]);
    if (chance(random, 0.45)) {
      a.write(
        oneWord,
        mood < 0.35 && chance(random, 0.5)
          ? 'Slow'
          : pick(
              random,
              ONE_WORD.filter((word) => word !== 'Slow'),
            ),
      );
    }
    const wroteLike = chance(random, 0.45 + 0.2 * keen);
    if (wroteLike) {
      a.write(likes, pick(random, LIKES));
    }
    const wroteImprove = chance(random, 0.3 + 0.4 * (1 - mood));
    if (wroteImprove) {
      a.write(improve, pick(random, IMPROVE));
    }

    // Most people answer in the first days after a survey opens.
    const submitted = Math.min(now - between(random, 5, 90) * MINUTE, opened + 9 * DAY * Math.pow(random(), 1.8) + (index % 7) * MINUTE);
    const seconds = between(random, 140, 420) + (wroteLike ? 60 : 0) + (wroteImprove ? 75 : 0);
    return {
      id: `response-genshin-${index + 1}`,
      surveyId: survey.id,
      person,
      aboutYou: aboutYouOf(random, [0.2, 0.42, 0.25, 0.08, 0.02, 0.03]),
      answers: a.byQuestion,
      language: survey.language,
      startedAt: iso(submitted - seconds * 1000),
      submittedAt: iso(submitted),
    };
  });
}

function accountsResponses(random: Random, survey: Survey, people: Person[]): SurveyResponse[] {
  const [s1, s2] = survey.steps;
  const [how, ways] = s1.questions;
  const [confusing] = s2.questions;
  const opened = Date.parse(survey.openedAt as string);
  const closed = Date.parse(survey.closedAt as string);

  return people.map((person, index) => {
    const a = new Answers();
    const howIndex = weightedIndex(random, [0.7, 0.24, 0.06]);
    a.choose(how, [howIndex]);
    const wayIndexes = [0.75, 0.45, 0.25, 0.3].map((p, i) => (chance(random, p) ? i : -1)).filter((i) => i >= 0);
    a.choose(ways, wayIndexes.length ? wayIndexes : [0]);
    if (chance(random, howIndex === 0 ? 0.3 : 0.8)) {
      a.write(confusing, pick(random, howIndex === 0 ? ACCOUNT_NOTES.slice(1, 3).concat(ACCOUNT_NOTES[5]) : ACCOUNT_NOTES));
    }
    const submitted = opened + (closed - opened) * Math.pow(random(), 1.5);
    const seconds = between(random, 50, 200);
    return {
      id: `response-accounts-${index + 1}`,
      surveyId: survey.id,
      person,
      aboutYou: aboutYouOf(random, [0.14, 0.38, 0.3, 0.12, 0.04, 0.02]),
      answers: a.byQuestion,
      // Answered before surveys had languages: nobody recorded which one it was read in.
      language: null,
      startedAt: iso(submitted - seconds * 1000),
      submittedAt: iso(submitted),
    };
  });
}

/** The example surveys and their answers, as of `now`. */
export function exampleData(now = Date.now()): { surveys: Survey[]; responses: SurveyResponse[] } {
  const random = seededRandom(SEED);
  const people = shuffled(random, HANDLES).map(personFor);
  const genshin = genshinSurvey(now);
  const japanese = japaneseSurvey(now);
  const accounts = accountsSurvey(now);
  // Some people answered both surveys, as the same people would.
  const responses = [...genshinResponses(random, genshin, people.slice(0, 63), now), ...accountsResponses(random, accounts, people.slice(45, 64))];
  return { surveys: [genshin, japanese, accounts], responses };
}
