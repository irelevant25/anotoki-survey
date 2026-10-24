import {
  TranslationPlace,
  addTranslation,
  changedTranslations,
  emptyTranslation,
  localizedSurvey,
  mergeTranslations,
  pruneTranslations,
  removeTranslation,
  setTranslatedText,
  translatedText,
  translationCodes,
  translationGaps,
  translationOf,
  translationPlaces,
  translationProgress,
} from './localize';
import { newQuestion, newSurvey } from './survey-factory';
import { ChoiceOption, StepTranslation, Survey, SurveyImage, SurveyTranslation } from './survey.model';

const picture = (id: string, alt: string): SurveyImage => ({ id, alt, width: 400, height: 300, src: `/api/images/${id}.webp` });
const option = (id: string, label: string, images: SurveyImage[] = []): ChoiceOption => ({ id, label, other: false, images });

/**
 * A survey in English with everything a translation can hold: a choice with
 * pictures (one of them twice, one with no description) and a hint nobody
 * sees, and "own words" with a hint and an option left from another time.
 */
function english(): Survey {
  return {
    ...newSurvey([]),
    title: 'The patch',
    intro: '<p>Welcome</p>',
    thanks: '<p>Thank you</p>',
    steps: [
      {
        id: 's1',
        title: 'First',
        text: '',
        images: [],
        questions: [
          {
            ...newQuestion('single'),
            id: 'q1',
            text: '<p>Which <strong>one</strong>?</p>',
            images: [picture('p1', 'A map'), picture('p1', 'A map'), picture('p2', '')],
            options: [option('a', 'Yes', [picture('p3', '')]), option('b', 'No')],
            placeholder: 'kept from when it was own words',
            maxChoices: 1,
          },
        ],
      },
      {
        id: 's2',
        title: '',
        text: '',
        images: [],
        questions: [{ ...newQuestion('text'), id: 'q2', text: '<p>Why?</p>', placeholder: 'A few words', maxLength: 200, options: [option('z', 'Left from when it was a choice')] }],
      },
    ],
  };
}

/** Everything english() has to translate, translated. */
function slovak(): SurveyTranslation {
  return {
    title: 'Záplata',
    intro: '<p>Vitajte</p>',
    thanks: '<p>Ďakujeme</p>',
    steps: { s1: { title: 'Prvý', text: '', images: {} } },
    questions: {
      q1: { text: '<p>Ktorý?</p>', placeholder: '', options: { a: { label: 'Áno' }, b: { label: 'Nie' } }, images: { p1: { alt: 'Mapa' } } },
      q2: { text: '<p>Prečo?</p>', placeholder: 'Pár slov', options: {}, images: {} },
    },
  };
}

const translated = (translation: SurveyTranslation = slovak()): Survey => ({ ...english(), translations: { sk: translation } });

describe('what there is to translate', () => {
  it('lists every text the survey has, in the order of the document - what each question type shows, a picture once', () => {
    expect(translationPlaces(english())).toEqual<TranslationPlace[]>([
      { kind: 'title' },
      { kind: 'intro' },
      { kind: 'thanks' },
      { kind: 'step', stepId: 's1' },
      { kind: 'text', questionId: 'q1' },
      { kind: 'option', questionId: 'q1', optionId: 'a' },
      { kind: 'option', questionId: 'q1', optionId: 'b' },
      { kind: 'image', questionId: 'q1', imageId: 'p1' },
      { kind: 'text', questionId: 'q2' },
      { kind: 'placeholder', questionId: 'q2' },
    ]);
  });

  it('has nothing to translate where the survey says nothing', () => {
    const survey = { ...english(), title: '  ', intro: '<p></p>', thanks: '', steps: [] };
    expect(translationPlaces(survey)).toEqual([]);
    expect(translationGaps({ ...survey, translations: { sk: emptyTranslation() } }, 'sk')).toEqual([]);
  });
});

describe('translationGaps', () => {
  it('finds none in a whole translation', () => {
    expect(translationGaps(translated(), 'sk')).toEqual([]);
    expect(translationProgress(translated(), 'sk')).toEqual({ done: 10, total: 10 });
  });

  it('finds every text in a language the survey is not translated into', () => {
    expect(translationGaps(english(), 'sk')).toEqual(translationPlaces(english()));
    expect(translationProgress(english(), 'sk')).toEqual({ done: 0, total: 10 });
  });

  it('finds what is empty: a line of spaces, rich text with no words, an entry that is not there', () => {
    const translation = slovak();
    const survey = translated({
      ...translation,
      title: '  ',
      thanks: '<p></p>',
      steps: {},
      questions: { q1: { ...translation.questions['q1'], options: { a: { label: 'Áno' } }, images: {} }, q2: { ...translation.questions['q2'], placeholder: '' } },
    });
    expect(translationGaps(survey, 'sk')).toEqual<TranslationPlace[]>([
      { kind: 'title' },
      { kind: 'thanks' },
      { kind: 'step', stepId: 's1' },
      { kind: 'option', questionId: 'q1', optionId: 'b' },
      { kind: 'image', questionId: 'q1', imageId: 'p1' },
      { kind: 'placeholder', questionId: 'q2' },
    ]);
    expect(translationProgress(survey, 'sk')).toEqual({ done: 4, total: 10 });
  });

  // The pair of backend/tests/unit/rules.test.php: what is a space - and so what is empty - is the
  // set String.prototype.trim() takes away, character for character (TEXT_SPACE in backend/api/helpers.php).
  it('takes for empty exactly what the browser trims - and the server with it: a line of U+0085 or U+180E is a text', () => {
    const spaces = ['\t', '\n', '\u000B', '\f', '\r', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', ' ', '　', '﻿'];
    for (const space of spaces) {
      const translation = slovak();
      const survey = translated({
        ...translation,
        title: space + space,
        intro: `<p>${space}</p>`,
        questions: { ...translation.questions, q2: { ...translation.questions['q2'], placeholder: space } },
      });
      expect(translationGaps(survey, 'sk'), `U+${space.codePointAt(0)?.toString(16)}`).toEqual([{ kind: 'title' }, { kind: 'intro' }, { kind: 'placeholder', questionId: 'q2' }]);
      // And the survey's own: nothing there to translate.
      expect(translationPlaces({ ...english(), title: space, intro: `<p>${space}</p>` }).map((place) => place.kind)).not.toContain('title');
      expect(translationPlaces({ ...english(), title: space, intro: `<p>${space}</p>` }).map((place) => place.kind)).not.toContain('intro');
    }

    // Next line (a C1 control) and the Mongolian vowel separator: invisible, and not spaces - to neither side.
    for (const odd of ['\u0085', '᠎']) {
      const name = `U+${odd.codePointAt(0)?.toString(16)}`;
      const translation = slovak();
      const survey = translated({
        title: odd,
        intro: `<p>${odd}</p>`,
        thanks: `<p>${odd}</p>`,
        steps: { s1: { title: odd, text: '', images: {} } },
        questions: {
          q1: { text: `<p>${odd}</p>`, placeholder: '', options: { a: { label: odd }, b: { label: translation.questions['q1'].options['b'].label } }, images: { p1: { alt: odd } } },
          q2: { text: `<p>${odd}</p>`, placeholder: odd, options: {}, images: {} },
        },
      });
      expect(translationGaps(survey, 'sk'), name).toEqual([]);
      expect(translationProgress(survey, 'sk'), name).toEqual({ done: 10, total: 10 });
      expect(localizedSurvey(survey, 'sk', 'complete').language, name).toBe('sk');

      // In the survey itself such a line is a text to translate, like any other.
      const original = english();
      const [first, second] = original.steps;
      const written: Survey = { ...original, title: odd, steps: [first, { ...second, title: odd }] };
      expect(translationPlaces(written), name).toContainEqual({ kind: 'title' });
      expect(translationPlaces(written), name).toContainEqual({ kind: 'step', stepId: 's2' });
      expect(translationPlaces(written), name).toHaveLength(11);
    }
  });

  it('reads an id that is a word every object knows as an id', () => {
    const survey = english();
    const odd: Survey = {
      ...survey,
      steps: [
        { id: 'constructor', title: 'First', text: '', images: [], questions: [{ ...survey.steps[0].questions[0], id: 'toString', options: [option('valueOf', 'Yes'), option('__proto__', 'No')] }] },
      ],
    };
    const empty = { ...odd, translations: { sk: emptyTranslation() } };
    expect(translatedText(translationOf(empty, 'sk'), { kind: 'step', stepId: 'constructor' })).toBe('');
    expect(translationGaps(empty, 'sk')).toHaveLength(translationPlaces(odd).length);
    expect(translationOf(empty, 'constructor')).toBeUndefined();

    let written = setTranslatedText(empty, 'sk', { kind: 'step', stepId: 'constructor' }, 'Prvý');
    written = setTranslatedText(written, 'sk', { kind: 'option', questionId: 'toString', optionId: '__proto__' }, 'Nie');
    expect(translatedText(translationOf(written, 'sk'), { kind: 'step', stepId: 'constructor' })).toBe('Prvý');
    expect(translatedText(translationOf(written, 'sk'), { kind: 'option', questionId: 'toString', optionId: '__proto__' })).toBe('Nie');
    expect(pruneTranslations(written)).toBe(written);
    expect(translatedText(translationOf(JSON.parse(JSON.stringify(written)) as Survey, 'sk'), { kind: 'option', questionId: 'toString', optionId: '__proto__' })).toBe('Nie');
  });
});

describe('localizedSurvey', () => {
  it('gives the people taking it a translation only when it is whole', () => {
    const survey = translated();
    const shown = localizedSurvey(survey, 'sk', 'complete');
    expect(shown.language).toBe('sk');
    expect(shown.survey.title).toBe('Záplata');
    expect(shown.survey.intro).toBe('<p>Vitajte</p>');
    expect(shown.survey.thanks).toBe('<p>Ďakujeme</p>');
    expect(shown.survey.steps.map((step) => step.title)).toEqual(['Prvý', '']);
    const [q1] = shown.survey.steps[0].questions;
    expect(q1.text).toBe('<p>Ktorý?</p>');
    expect(q1.options.map((item) => item.label)).toEqual(['Áno', 'Nie']);
    expect(q1.images.map((image) => image.alt)).toEqual(['Mapa', 'Mapa', '']);
    expect(shown.survey.steps[1].questions[0].placeholder).toBe('Pár slov');
  });

  it('shows a survey with anything missing whole in the language it is written in', () => {
    const translation = slovak();
    const survey = translated({ ...translation, steps: {} });
    const shown = localizedSurvey(survey, 'sk', 'complete');
    expect(shown.language).toBe('en');
    expect(shown.survey).toBe(survey);
  });

  it('shows the preview text by text: the translation where there is one, the original where there is not', () => {
    const translation = slovak();
    const survey = translated({ ...translation, title: '', intro: '<p> </p>', questions: { q1: { ...translation.questions['q1'], options: { a: { label: 'Áno' } } } } });
    const shown = localizedSurvey(survey, 'sk', 'partial');
    expect(shown.language).toBe('sk');
    expect(shown.survey.title).toBe('The patch');
    expect(shown.survey.intro).toBe('<p>Welcome</p>');
    expect(shown.survey.thanks).toBe('<p>Ďakujeme</p>');
    expect(shown.survey.steps[0].questions[0].options.map((item) => item.label)).toEqual(['Áno', 'No']);
    expect(shown.survey.steps[1].questions[0].text).toBe('<p>Why?</p>');
    expect(shown.survey.steps[1].questions[0].placeholder).toBe('A few words');
  });

  it('gives the survey as it is in its own language, and in a language it does not have', () => {
    const survey = translated();
    for (const mode of ['complete', 'partial'] as const) {
      expect(localizedSurvey(survey, 'en', mode)).toEqual({ survey, language: 'en' });
      expect(localizedSurvey(survey, 'en', mode).survey).toBe(survey);
      expect(localizedSurvey(survey, 'de', mode).survey).toBe(survey);
      expect(localizedSurvey(survey, 'de', mode).language).toBe('en');
      expect(localizedSurvey(survey, 'constructor', mode).survey).toBe(survey);
    }
  });

  it('changes texts and nothing else: ids, structure, pictures and limits stay, and the survey that came is untouched', () => {
    const survey = translated();
    const before = JSON.stringify(survey);
    const shown = localizedSurvey(survey, 'sk', 'complete').survey;
    expect(JSON.stringify(survey)).toBe(before);

    const bones = (s: Survey) =>
      s.steps.map((step) => ({
        id: step.id,
        questions: step.questions.map(({ id, type, required, layout, minChoices, maxChoices, multiline, maxLength, options, images }) => ({
          id,
          type,
          required,
          layout,
          minChoices,
          maxChoices,
          multiline,
          maxLength,
          options: options.map((item) => ({ id: item.id, other: item.other, images: item.images })),
          images: images.map((image) => ({ id: image.id, width: image.width, height: image.height, src: image.src })),
        })),
      }));
    expect(bones(shown)).toEqual(bones(survey));
    expect(shown.id).toBe(survey.id);
    expect(shown.slug).toBe(survey.slug);
    expect(shown.language).toBe('en');
    expect(shown.translations).toBe(survey.translations);
    // What a question type does not show is translated only if somebody did: nothing is made up.
    expect(shown.steps[0].questions[0].placeholder).toBe('kept from when it was own words');
  });
});

describe('pruneTranslations', () => {
  it('gives the very survey back when every translated text still has its place', () => {
    const survey = translated();
    expect(pruneTranslations(survey)).toBe(survey);
    const plain = english();
    expect(pruneTranslations(plain)).toBe(plain);
  });

  it('drops the texts of what the survey no longer has: a step, a question, an option, a picture', () => {
    const survey = translated();
    const [first, second] = survey.steps;
    const q1 = first.questions[0];

    const withoutStep = pruneTranslations({ ...survey, steps: [second] });
    expect(withoutStep.translations['sk'].steps).toEqual({});
    expect(Object.keys(withoutStep.translations['sk'].questions)).toEqual(['q2']);

    const withoutOption = pruneTranslations({ ...survey, steps: [{ ...first, questions: [{ ...q1, options: [q1.options[0]], images: [q1.images[2]] }] }, second] });
    expect(withoutOption.translations['sk'].questions['q1']).toEqual({ text: '<p>Ktorý?</p>', placeholder: '', options: { a: { label: 'Áno' } }, images: {} });
    expect(withoutOption.translations['sk'].questions['q2']).toBe(survey.translations['sk'].questions['q2']);
    expect(withoutOption.translations['sk'].title).toBe('Záplata');
    // The survey that came is as it was.
    expect(survey.translations['sk']).toEqual(slovak());
  });

  it('keeps the texts of what a question type does not show: switching back finds them', () => {
    const survey = english();
    const q2 = survey.steps[1].questions[0];
    const kept = { ...survey, translations: { sk: { ...slovak(), questions: { q2: { text: '<p>Prečo?</p>', placeholder: 'Pár slov', options: { z: { label: 'Zostalo' } }, images: {} } } } } };
    expect(q2.type).toBe('text');
    expect(pruneTranslations(kept)).toBe(kept);
  });

  it('makes a map of what came without one', () => {
    const broken = { ...english(), translations: { sk: { title: 'x' } as unknown as SurveyTranslation } };
    expect(pruneTranslations(broken).translations['sk']).toEqual({ title: 'x', steps: {}, questions: {} });
    const none = { ...english(), translations: undefined as unknown as Survey['translations'] };
    expect(pruneTranslations(none).translations).toEqual({});
  });
});

describe('mergeTranslations: two versions of a survey brought together, text by text', () => {
  /** english() as the server last had it from this page, as it is here, and as somebody else saved it - each with its translations. */
  const versions = (base: Survey['translations'], mine: Survey['translations'], theirs: Survey['translations']) =>
    [
      { ...english(), translations: base },
      { ...english(), translations: mine },
      { ...english(), translations: theirs },
    ] as const;
  /**
   * Merged, for three versions whose questions say the same: whose document
   * the result is saved with makes no difference then - checked each time.
   */
  const merge = (base: Survey['translations'], mine: Survey['translations'], theirs: Survey['translations']) => {
    const intoMine = mergeTranslations(...versions(base, mine, theirs), 'mine');
    expect(mergeTranslations(...versions(base, mine, theirs), 'theirs')).toEqual(intoMine);
    return intoMine;
  };
  /** slovak() with some texts said otherwise. */
  const withTexts = (texts: [TranslationPlace, string][], from: SurveyTranslation = slovak()): SurveyTranslation =>
    texts.reduce((survey, [place, text]) => setTranslatedText(survey, 'sk', place, text), translated(from)).translations['sk'];
  const german: SurveyTranslation = { ...emptyTranslation(), title: 'Der Patch' };

  it('is theirs where nothing was changed here: a page that never touched a translation undoes none of it', () => {
    // The author's page: opened before anybody translated, and only the survey itself changed since.
    const theirs = { sk: slovak(), de: german };
    expect(merge({}, {}, theirs)).toEqual(theirs);
    expect(merge({}, {}, theirs)['sk']).toBe(theirs.sk);

    // Opened with a first half of the Slovak, which somebody else has finished meanwhile.
    const half = withTexts([
      [{ kind: 'thanks' }, ''],
      [{ kind: 'option', questionId: 'q1', optionId: 'b' }, ''],
    ]);
    expect(merge({ sk: half }, { sk: half }, { sk: slovak() })).toEqual({ sk: slovak() });
  });

  it('settles each language by where it is: added or removed, here or by them', () => {
    const changed = withTexts([[{ kind: 'title' }, 'Moja záplata']]);
    const cases: { name: string; base: Survey['translations']; mine: Survey['translations']; theirs: Survey['translations']; merged: Survey['translations'] }[] = [
      { name: 'added by them', base: {}, mine: {}, theirs: { sk: slovak() }, merged: { sk: slovak() } },
      { name: 'added here', base: {}, mine: { sk: slovak() }, theirs: {}, merged: { sk: slovak() } },
      { name: 'added here, empty yet', base: {}, mine: { sk: emptyTranslation() }, theirs: {}, merged: { sk: emptyTranslation() } },
      { name: 'removed here', base: { sk: slovak() }, mine: {}, theirs: { sk: slovak() }, merged: {} },
      { name: 'removed here, whatever they wrote into it since', base: { sk: slovak() }, mine: {}, theirs: { sk: changed }, merged: {} },
      { name: 'removed by them, untouched here', base: { sk: slovak() }, mine: { sk: slovak() }, theirs: {}, merged: {} },
      { name: 'removed by them, a text of it changed here', base: { sk: slovak() }, mine: { sk: changed }, theirs: {}, merged: { sk: changed } },
      { name: 'removed by both', base: { sk: slovak() }, mine: {}, theirs: {}, merged: {} },
      { name: 'added by both: theirs, with what was written here', base: {}, mine: { sk: { ...emptyTranslation(), title: 'Moja záplata' } }, theirs: { sk: slovak() }, merged: { sk: changed } },
      { name: 'one language each', base: { sk: slovak() }, mine: { sk: slovak(), cs: german }, theirs: { sk: slovak(), de: german }, merged: { sk: slovak(), de: german, cs: german } },
    ];
    for (const { name, base, mine, theirs, merged } of cases) {
      expect(merge(base, mine, theirs), name).toEqual(merged);
    }
    // Their order of languages, then the ones only here.
    expect(Object.keys(merge({ sk: slovak() }, { cs: german, sk: slovak() }, { de: german, sk: slovak() }))).toEqual(['de', 'sk', 'cs']);
  });

  it('takes a text from here only where it was changed here - over theirs when both changed the same one', () => {
    const base = slovak();
    const cases: { name: string; mine: [TranslationPlace, string][]; theirs: [TranslationPlace, string][]; merged: [TranslationPlace, string][] }[] = [
      { name: 'changed by them only', mine: [], theirs: [[{ kind: 'intro' }, '<p>Ich</p>']], merged: [[{ kind: 'intro' }, '<p>Ich</p>']] },
      { name: 'changed here only', mine: [[{ kind: 'title' }, 'Moja']], theirs: [], merged: [[{ kind: 'title' }, 'Moja']] },
      {
        name: 'one text each',
        mine: [[{ kind: 'title' }, 'Moja']],
        theirs: [[{ kind: 'intro' }, '<p>Ich</p>']],
        merged: [
          [{ kind: 'title' }, 'Moja'],
          [{ kind: 'intro' }, '<p>Ich</p>'],
        ],
      },
      { name: 'the same text, changed by both: mine', mine: [[{ kind: 'title' }, 'Moja']], theirs: [[{ kind: 'title' }, 'Ich']], merged: [[{ kind: 'title' }, 'Moja']] },
      { name: 'the same text, changed by both to the same words', mine: [[{ kind: 'title' }, 'Rovnaká']], theirs: [[{ kind: 'title' }, 'Rovnaká']], merged: [[{ kind: 'title' }, 'Rovnaká']] },
      { name: 'emptied here: empty, whatever they made of it', mine: [[{ kind: 'thanks' }, '']], theirs: [[{ kind: 'thanks' }, '<p>Ich</p>']], merged: [[{ kind: 'thanks' }, '']] },
      { name: 'emptied by them, untouched here: empty', mine: [], theirs: [[{ kind: 'thanks' }, '']], merged: [[{ kind: 'thanks' }, '']] },
    ];
    for (const { name, mine, theirs, merged } of cases) {
      expect(merge({ sk: base }, { sk: withTexts(mine) }, { sk: withTexts(theirs) }), name).toEqual({ sk: withTexts(merged) });
    }
  });

  it('does so for every kind of place, each by itself', () => {
    const places: TranslationPlace[] = [
      { kind: 'title' },
      { kind: 'intro' },
      { kind: 'thanks' },
      { kind: 'step', stepId: 's1' },
      { kind: 'text', questionId: 'q1' },
      { kind: 'option', questionId: 'q1', optionId: 'a' },
      { kind: 'option', questionId: 'q1', optionId: 'b' },
      { kind: 'image', questionId: 'q1', imageId: 'p1' },
      { kind: 'text', questionId: 'q2' },
      { kind: 'placeholder', questionId: 'q2' },
    ];
    expect(places).toEqual(translationPlaces(english()));
    // They reworded every text; here one was - each in turn.
    const theirs = withTexts(places.map((place) => [place, 'ich']));
    for (const place of places) {
      const merged = merge({ sk: slovak() }, { sk: withTexts([[place, 'moje']]) }, { sk: theirs })['sk'];
      expect(
        places.map((other) => translatedText(merged, other)),
        place.kind,
      ).toEqual(places.map((other) => (other === place ? 'moje' : 'ich')));
    }
  });

  it('minds the places that are not among those to translate, too: words written where the survey itself says nothing', () => {
    // The second step has no title of its own, and the choice shows no hint: a translator may write one all the same.
    const untitled: TranslationPlace = { kind: 'step', stepId: 's2' };
    const hint: TranslationPlace = { kind: 'placeholder', questionId: 'q1' };
    expect(translationPlaces(english())).not.toContainEqual(untitled);
    const merged = merge(
      { sk: slovak() },
      {
        sk: withTexts([
          [untitled, 'Druhý'],
          [hint, 'Moja'],
        ]),
      },
      { sk: withTexts([[{ kind: 'title' }, 'Ich']]) },
    );
    expect(merged).toEqual({
      sk: withTexts([
        [{ kind: 'title' }, 'Ich'],
        [untitled, 'Druhý'],
        [hint, 'Moja'],
      ]),
    });
  });

  it('compares the places of the survey that is here, and leaves what has no place to pruneTranslations()', () => {
    // Here a question was added and translated; they added another, and translated that.
    const added = { ...newQuestion('text'), id: 'q3', text: '<p>More?</p>' };
    const theirAdded = { ...newQuestion('text'), id: 'q4', text: '<p>Less?</p>' };
    const start = translated();
    const withQuestion = (question: typeof added, text: string, from: Survey = start): Survey =>
      setTranslatedText({ ...from, steps: [from.steps[0], { ...from.steps[1], questions: [...from.steps[1].questions, question] }] }, 'sk', { kind: 'text', questionId: question.id }, text);
    const mine = withQuestion(added, '<p>Viac?</p>');
    const theirs = withQuestion(theirAdded, '<p>Menej?</p>');

    for (const saved of ['mine', 'theirs'] as const) {
      const merged = mergeTranslations(start, mine, theirs, saved);
      expect(merged['sk'].questions['q3'].text).toBe('<p>Viac?</p>');
      expect(merged['sk'].questions['q4'].text).toBe('<p>Menej?</p>');
      // Saved over theirs, the survey here has no fourth question; taken as theirs, no third.
      expect(Object.keys(pruneTranslations({ ...(saved === 'mine' ? mine : theirs), translations: merged }).translations['sk'].questions)).toEqual(
        saved === 'mine' ? ['q1', 'q2', 'q3'] : ['q1', 'q2', 'q4'],
      );
    }
  });

  describe('saved with my questions (keepMine) - what their version removed or reworded', () => {
    /** english() without its first step (its title, and the choice in it) - their Slovak of it gone with it. */
    const withoutFirstStep = (survey: Survey): Survey => pruneTranslations({ ...survey, steps: survey.steps.slice(1) });
    const q1: TranslationPlace = { kind: 'text', questionId: 'q1' };
    /** english() with the choice asking something else. */
    const reworded = (survey: Survey): Survey => ({
      ...survey,
      steps: survey.steps.map((step) => ({ ...step, questions: step.questions.map((question) => (question.id === 'q1' ? { ...question, text: '<p>Where do you live?</p>' } : question)) })),
    });

    it('keeps my translated texts of a step, question, option or picture their version no longer has - saved into theirs, it does not', () => {
      // Nothing of the Slovak was changed here: it is as the server last had it from this page.
      const base = translated();
      const mine = translated();
      const theirs = withoutFirstStep(translated());
      expect(theirs.translations['sk'].questions['q1']).toBeUndefined();

      const intoMine = mergeTranslations(base, mine, theirs, 'mine');
      // My survey still asks the choice: its text, its option labels, its picture's description and the step's title stay translated.
      expect(pruneTranslations({ ...mine, translations: intoMine }).translations).toEqual({ sk: slovak() });

      // Saved with theirs, which has no such question: their Slovak, as it is.
      expect(mergeTranslations(base, mine, theirs, 'theirs')).toEqual(theirs.translations);

      // An option they removed, the question kept: my label of it stays.
      const optionGone = pruneTranslations({
        ...translated(),
        steps: [{ ...english().steps[0], questions: [{ ...english().steps[0].questions[0], options: [option('a', 'Yes', [picture('p3', '')])] }] }, english().steps[1]],
      });
      expect(optionGone.translations['sk'].questions['q1'].options).toEqual({ a: { label: 'Áno' } });
      expect(mergeTranslations(base, mine, optionGone, 'mine')['sk'].questions['q1'].options).toEqual({ a: { label: 'Áno' }, b: { label: 'Nie' } });
    });

    it('keeps my translation of a text they reworded: theirs is of words my survey does not have', () => {
      const base = translated();
      const mine = translated();
      const theirs = reworded(setTranslatedText(translated(), 'sk', q1, '<p>Kde bývate?</p>'));

      // Saved with my question ("Which one?"): my Slovak of it - never "Where do you live?" in Slovak beside it.
      expect(translatedText(mergeTranslations(base, mine, theirs, 'mine')['sk'], q1)).toBe('<p>Ktorý?</p>');
      // Saved with theirs: their question, their Slovak of it.
      expect(translatedText(mergeTranslations(base, mine, theirs, 'theirs')['sk'], q1)).toBe('<p>Kde bývate?</p>');

      // Every other text of theirs still comes along: an untouched question they translated better.
      const better = setTranslatedText(theirs, 'sk', { kind: 'text', questionId: 'q2' }, '<p>Prečo teda?</p>');
      expect(translatedText(mergeTranslations(base, mine, better, 'mine')['sk'], { kind: 'text', questionId: 'q2' })).toBe('<p>Prečo teda?</p>');
    });

    it('never replaces a translation by a gap: where I have no words, theirs stays', () => {
      // Opened before the choice was translated; they fixed its English and wrote its first Slovak.
      const base = setTranslatedText(translated(), 'sk', q1, '');
      const mine = setTranslatedText(translated(), 'sk', q1, '');
      const theirs = reworded(setTranslatedText(translated(), 'sk', q1, '<p>Kde bývate?</p>'));
      expect(translatedText(mergeTranslations(base, mine, theirs, 'mine')['sk'], q1)).toBe('<p>Kde bývate?</p>');
    });

    it('takes a text trimmed on its way into the server for the same text: not reworded', () => {
      // Sent from here with a space at the end; the server kept it without.
      const base = { ...translated(), title: 'The patch ' };
      const mine = { ...translated(), title: 'The patch ' };
      const theirs = setTranslatedText(translated(), 'sk', { kind: 'title' }, 'Ich záplata');
      expect(mergeTranslations(base, mine, theirs, 'mine')['sk'].title).toBe('Ich záplata');
    });
  });

  it('writes into none of the three that came, and reads a code that is a word every object knows as a code', () => {
    const [base, mine, theirs] = versions({ sk: slovak() }, { sk: withTexts([[{ kind: 'title' }, 'Moja']]) }, { sk: withTexts([[{ kind: 'intro' }, '<p>Ich</p>']]), constructor: german });
    const before = JSON.stringify([base, mine, theirs]);
    const merged = mergeTranslations(base, mine, theirs, 'mine');
    mergeTranslations(base, mine, theirs, 'theirs');
    expect(JSON.stringify([base, mine, theirs])).toBe(before);
    expect(merged['sk']).not.toBe(theirs.translations['sk']);
    expect(Object.keys(merged)).toEqual(['sk', 'constructor']);
    expect(merge({}, {}, {})).toEqual({});
  });
});

describe('changedTranslations: the languages written into since the server last had the survey', () => {
  const german: SurveyTranslation = { ...emptyTranslation(), title: 'Der Patch' };

  it('names a language whose text was written, and one added here - even empty', () => {
    const base = translated();
    expect(changedTranslations(base, translated())).toEqual([]);
    expect(changedTranslations(base, setTranslatedText(translated(), 'sk', { kind: 'option', questionId: 'q1', optionId: 'b' }, 'Nie, nikdy'))).toEqual(['sk']);
    expect(changedTranslations(base, addTranslation(translated(), 'de'))).toEqual(['de']);
    expect(changedTranslations({ ...base, translations: { sk: slovak(), de: german } }, { ...base, translations: { sk: slovak(), de: { ...german, title: 'Die Patch' } } })).toEqual(['de']);
  });

  it('names none for a text typed and taken back, for a language removed (a change to the survey), or for a change of the survey itself', () => {
    const base = translated();
    const typed = setTranslatedText(translated(), 'sk', { kind: 'title' }, 'Moja');
    expect(changedTranslations(base, setTranslatedText(typed, 'sk', { kind: 'title' }, 'Záplata'))).toEqual([]);
    expect(changedTranslations(base, removeTranslation(translated(), 'sk'))).toEqual([]);
    expect(changedTranslations(base, { ...translated(), title: 'Another patch' })).toEqual([]);
  });

  it('minds the places that are not among those to translate: words where the survey itself says nothing', () => {
    // The second step has no title of its own; a translator may write one all the same.
    expect(changedTranslations(translated(), setTranslatedText(translated(), 'sk', { kind: 'step', stepId: 's2' }, 'Druhý'))).toEqual(['sk']);
  });
});

describe('writing a translation', () => {
  it('adds a language once, and never the one the survey is written in', () => {
    const survey = english();
    const added = addTranslation(survey, 'sk');
    expect(added.translations).toEqual({ sk: emptyTranslation() });
    expect(survey.translations).toEqual({});
    expect(addTranslation(added, 'sk')).toBe(added);
    expect(addTranslation(survey, 'en')).toBe(survey);
    expect(translationCodes(addTranslation(added, 'de'))).toEqual(['sk', 'de']);
  });

  it('removes a language with every text of it', () => {
    const survey = { ...translated(), translations: { sk: slovak(), de: emptyTranslation() } };
    expect(translationCodes(removeTranslation(survey, 'sk'))).toEqual(['de']);
    expect(removeTranslation(survey, 'fr')).toBe(survey);
    expect(translationCodes(survey)).toEqual(['sk', 'de']);
  });

  it('writes one text, into a new survey - every kind of place', () => {
    const start = addTranslation(english(), 'sk');
    const texts: [TranslationPlace, string][] = [
      [{ kind: 'title' }, 'Záplata'],
      [{ kind: 'intro' }, '<p>Vitajte</p>'],
      [{ kind: 'thanks' }, '<p>Ďakujeme</p>'],
      [{ kind: 'step', stepId: 's1' }, 'Prvý'],
      [{ kind: 'text', questionId: 'q1' }, '<p>Ktorý?</p>'],
      [{ kind: 'option', questionId: 'q1', optionId: 'a' }, 'Áno'],
      [{ kind: 'option', questionId: 'q1', optionId: 'b' }, 'Nie'],
      [{ kind: 'image', questionId: 'q1', imageId: 'p1' }, 'Mapa'],
      [{ kind: 'text', questionId: 'q2' }, '<p>Prečo?</p>'],
      [{ kind: 'placeholder', questionId: 'q2' }, 'Pár slov'],
    ];
    const written = texts.reduce((survey, [place, text]) => setTranslatedText(survey, 'sk', place, text), start);
    expect(written.translations['sk']).toEqual(slovak());
    expect(start.translations['sk']).toEqual(emptyTranslation());
    for (const [place, text] of texts) {
      expect(translatedText(translationOf(written, 'sk'), place)).toBe(text);
    }
    expect(translationGaps(written, 'sk')).toEqual([]);
  });

  it('writes nothing into a language the survey does not have: a late keystroke brings no language back', () => {
    const survey = english();
    expect(setTranslatedText(survey, 'sk', { kind: 'title' }, 'Záplata')).toBe(survey);
  });
});

/** The pictures textSteps() shows: ids the server would have made (MAP and CITY in backend/tests/unit/rules.test.php). */
const MAP = '0f6c2a52-4c1e-4b55-9d2e-6a1c5e0b7a11';
const CITY = '5b8e1d7c-2f3a-4e6b-8c9d-0a1b2c3d4e5f';

/**
 * A step people only read and leave with Next - its own text and three
 * pictures (the map twice, the city with no description) - then a step that
 * asks: text_steps() in backend/tests/unit/rules.test.php, the same places in
 * the same order.
 */
function textSteps(): Survey {
  return {
    ...newSurvey([]),
    title: 'Genshin 1.0',
    intro: '<p>Hello</p>',
    thanks: '<p>Thanks</p>',
    steps: [
      {
        id: 's1',
        title: 'The task',
        text: '<p>Open the <strong>map</strong>, find Mondstadt, then come back.</p>',
        images: [picture(MAP, 'The map'), picture(CITY, ''), picture(MAP, 'The map')],
        questions: [],
      },
      { id: 's2', title: 'How it went', text: '', images: [], questions: [{ ...newQuestion('single'), id: 'q1', text: '<p>Was it easy?</p>', options: [option('a', 'Yes'), option('b', 'No')] }] },
    ],
  };
}

/** Nothing of textSteps() left to translate (whole_text_steps() in rules.test.php). */
function wholeTextSteps(): SurveyTranslation {
  return {
    title: 'Genshin 1.0',
    intro: '<p>Ahoj</p>',
    thanks: '<p>Vďaka</p>',
    steps: {
      s1: { title: 'Úloha', text: '<p>Otvorte <strong>mapu</strong>, nájdite Mondstadt a vráťte sa.</p>', images: { [MAP]: { alt: 'Mapa' } } },
      s2: { title: 'Ako to šlo', text: '', images: {} },
    },
    questions: { q1: { text: '<p>Bolo to ľahké?</p>', placeholder: '', options: { a: { label: 'Áno' }, b: { label: 'Nie' } }, images: {} } },
  };
}

describe('a step of its own text and pictures', () => {
  const withSlovak = (translation: SurveyTranslation = wholeTextSteps()): Survey => ({ ...textSteps(), translations: { sk: translation } });

  it('has its text and its pictures’ descriptions to translate, after its title and before its questions - the server’s order', () => {
    expect(translationPlaces(textSteps())).toEqual<TranslationPlace[]>([
      { kind: 'title' },
      { kind: 'intro' },
      { kind: 'thanks' },
      { kind: 'step', stepId: 's1' },
      { kind: 'stepText', stepId: 's1' },
      // The map twice is one description; the city has none to translate.
      { kind: 'stepImage', stepId: 's1', imageId: MAP },
      { kind: 'step', stepId: 's2' },
      { kind: 'text', questionId: 'q1' },
      { kind: 'option', questionId: 'q1', optionId: 'a' },
      { kind: 'option', questionId: 'q1', optionId: 'b' },
    ]);
    expect(translationGaps(withSlovak(), 'sk')).toEqual([]);
    expect(translationProgress(withSlovak(), 'sk')).toEqual({ done: 10, total: 10 });
  });

  it('finds the step’s text missing when it has no words, and a description of spaces - and an entry from before steps had a text, a title alone', () => {
    const holes = withSlovak({ ...wholeTextSteps(), steps: { ...wholeTextSteps().steps, s1: { title: 'Úloha', text: '<p> </p>', images: { [MAP]: { alt: ' ' } } } } });
    const missing: TranslationPlace[] = [
      { kind: 'stepText', stepId: 's1' },
      { kind: 'stepImage', stepId: 's1', imageId: MAP },
    ];
    expect(translationGaps(holes, 'sk')).toEqual(missing);
    const old = withSlovak({ ...wholeTextSteps(), steps: { ...wholeTextSteps().steps, s1: { title: 'Úloha' } as unknown as StepTranslation } });
    expect(translationGaps(old, 'sk')).toEqual(missing);
    // A step whose text is only an emptied editor's <p></p> has nothing to translate.
    expect(translationPlaces({ ...textSteps(), steps: [{ ...textSteps().steps[0], text: '<p></p>', images: [] }] }).map((place) => place.kind)).toEqual(['title', 'intro', 'thanks', 'step']);
  });

  it('shows the people taking it the step’s text and pictures in their language - only when nothing is missing - and the preview text by text', () => {
    const shown = localizedSurvey(withSlovak(), 'sk', 'complete');
    expect(shown.language).toBe('sk');
    const [task] = shown.survey.steps;
    expect([task.title, task.text]).toEqual(['Úloha', '<p>Otvorte <strong>mapu</strong>, nájdite Mondstadt a vráťte sa.</p>']);
    expect(task.images.map((image) => [image.id, image.alt])).toEqual([
      [MAP, 'Mapa'],
      [CITY, ''],
      [MAP, 'Mapa'],
    ]);
    // The pictures themselves are the survey's.
    expect(task.images.map((image) => image.src)).toEqual(textSteps().steps[0].images.map((image) => image.src));

    const half = withSlovak({ ...wholeTextSteps(), steps: { ...wholeTextSteps().steps, s1: { ...wholeTextSteps().steps['s1'], text: '' } } });
    expect(localizedSurvey(half, 'sk', 'complete')).toEqual({ survey: half, language: 'en' });
    const preview = localizedSurvey(half, 'sk', 'partial').survey.steps[0];
    expect([preview.title, preview.text, preview.images[0].alt]).toEqual(['Úloha', textSteps().steps[0].text, 'Mapa']);
  });

  it('writes the step’s text and a picture’s description into the step’s entry, beside its title', () => {
    let survey = addTranslation(textSteps(), 'sk');
    survey = setTranslatedText(survey, 'sk', { kind: 'step', stepId: 's1' }, 'Úloha');
    survey = setTranslatedText(survey, 'sk', { kind: 'stepText', stepId: 's1' }, '<p>Otvorte mapu.</p>');
    survey = setTranslatedText(survey, 'sk', { kind: 'stepImage', stepId: 's1', imageId: MAP }, 'Mapa');
    expect(survey.translations['sk'].steps).toEqual({ s1: { title: 'Úloha', text: '<p>Otvorte mapu.</p>', images: { [MAP]: { alt: 'Mapa' } } } });
    expect(translatedText(translationOf(survey, 'sk'), { kind: 'stepImage', stepId: 's1', imageId: MAP })).toBe('Mapa');
    expect(translatedText(translationOf(survey, 'sk'), { kind: 'stepText', stepId: 'constructor' })).toBe('');
  });

  it('drops a picture’s description with the picture, and the step’s whole entry with the step', () => {
    const survey = withSlovak();
    expect(pruneTranslations(survey)).toBe(survey);
    const [task, ask] = survey.steps;
    const withoutMap = pruneTranslations({ ...survey, steps: [{ ...task, images: [task.images[1]] }, ask] });
    expect(withoutMap.translations['sk'].steps['s1']).toEqual({ ...wholeTextSteps().steps['s1'], images: {} });
    expect(withoutMap.translations['sk'].questions).toBe(survey.translations['sk'].questions);
    const withoutStep = pruneTranslations({ ...survey, steps: [ask] });
    expect(Object.keys(withoutStep.translations['sk'].steps)).toEqual(['s2']);
  });

  it('brings two versions’ step texts together text by text, as a question’s', () => {
    const text: TranslationPlace = { kind: 'stepText', stepId: 's1' };
    const map: TranslationPlace = { kind: 'stepImage', stepId: 's1', imageId: MAP };
    const base = withSlovak();
    const mine = setTranslatedText(withSlovak(), 'sk', text, '<p>Moja úloha</p>');
    const theirs = setTranslatedText(withSlovak(), 'sk', map, 'Ich mapa');
    expect(changedTranslations(base, mine)).toEqual(['sk']);
    for (const saved of ['mine', 'theirs'] as const) {
      const merged = mergeTranslations(base, mine, theirs, saved)['sk'];
      expect([translatedText(merged, text), translatedText(merged, map)], saved).toEqual(['<p>Moja úloha</p>', 'Ich mapa']);
    }
  });
});
