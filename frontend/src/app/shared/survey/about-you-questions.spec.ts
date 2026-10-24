import { DYNAMIC_KEYS } from '../i18n/dynamic-keys';
import { AGES, AGE_ID, ALL_GENDERS, GENDERS, GENDER_ID, genderLabel, isOfferedGender } from './about-you';
import { ABOUT_YOU_QUESTIONS, aboutYouQuestions, aboutYouQuestionsFor } from './about-you-questions';
import { plainText } from './plain-text';

const SLOVAK: Record<string, string> = {
  'aboutYou.genderQuestion': 'Aké je Vaše pohlavie?',
  'aboutYou.ageQuestion': 'Koľko máte rokov?',
  'aboutYou.gender.male': 'Muž',
  'aboutYou.gender.female': 'Žena',
  'aboutYou.gender.undisclosed': 'Nechcem uviesť',
  'aboutYou.age.under-18': 'Menej ako 18',
  'aboutYou.age.18-24': '18–24',
  'aboutYou.age.25-34': '25–34',
  'aboutYou.age.35-44': '35–44',
  'aboutYou.age.45-plus': '45 a viac',
  'aboutYou.age.undisclosed': 'Nechcem uviesť',
};

describe('ABOUT_YOU_QUESTIONS', () => {
  it('stays English, for the admin area', () => {
    const [gender, age] = ABOUT_YOU_QUESTIONS;
    expect(gender.text).toBe('<p>What is your gender?</p>');
    expect(gender.options.map((option) => option.label)).toEqual(['Male', 'Female', 'Prefer not to say']);
    expect(age.text).toBe('<p>How old are you?</p>');
    expect(age.options.map((option) => option.label)).toEqual(['Under 18', '18–24', '25–34', '35–44', '45 or older', 'Prefer not to say']);
  });
});

describe('aboutYouQuestions', () => {
  it('words the two questions and their answers through the keys', () => {
    const asked: string[] = [];
    const [gender, age] = aboutYouQuestions((key) => {
      asked.push(key);
      return SLOVAK[key] ?? key;
    });
    expect(plainText(gender.text)).toBe('Aké je Vaše pohlavie?');
    expect(gender.options.map((option) => option.label)).toEqual(['Muž', 'Žena', 'Nechcem uviesť']);
    expect(plainText(age.text)).toBe('Koľko máte rokov?');
    expect(age.options.map((option) => option.label)).toEqual(['Menej ako 18', '18–24', '25–34', '35–44', '45 a viac', 'Nechcem uviesť']);
    expect([...asked].sort()).toEqual(Object.keys(SLOVAK).sort());
  });

  it('changes the words only: the ids are those of the English questions, so answers stay', () => {
    const worded = aboutYouQuestions((key) => SLOVAK[key] ?? key);
    expect(worded.map((question) => question.id)).toEqual([GENDER_ID, AGE_ID]);
    worded.forEach((question, index) => {
      const english = ABOUT_YOU_QUESTIONS[index];
      expect(question.options.map((option) => option.id)).toEqual(english.options.map((option) => option.id));
      expect({ ...question, text: '', options: [] }).toEqual({ ...english, text: '', options: [] });
    });
  });

  it('escapes a worded question before it becomes HTML, and leaves the labels as words', () => {
    // A question's text is drawn with [innerHTML]; a string is text, whatever somebody typed into it.
    const [gender, age] = aboutYouQuestions((key) => (key === 'aboutYou.ageQuestion' ? 'Vek < 18 & viac' : key === 'aboutYou.genderQuestion' ? '<img src=x onerror="alert(1)">' : 'A & B <i>'));
    expect(age.text).toBe('<p>Vek &lt; 18 &amp; viac</p>');
    expect(plainText(age.text)).toBe('Vek < 18 & viac');
    expect(gender.text).toBe('<p>&lt;img src=x onerror=&quot;alert(1)&quot;&gt;</p>');
    // Labels are drawn as text ({{ }}), which escapes them itself - escaped here they would show "&amp;".
    expect(age.options[0].label).toBe('A & B <i>');
  });

  it('asks only for keys the key scan is told about', () => {
    expect(DYNAMIC_KEYS['aboutYou.gender.']).toEqual(GENDERS.map((gender) => gender.key));
    expect(DYNAMIC_KEYS['aboutYou.age.']).toEqual(AGES.map((age) => age.key));
  });
});

describe('the gender question’s answers (the owner’s decision of 2026-10-20)', () => {
  it('offers three, in this order - "Non-binary" no more: a new answer may not say it', () => {
    expect(GENDERS.map((gender) => [gender.key, gender.label])).toEqual([
      ['male', 'Male'],
      ['female', 'Female'],
      ['undisclosed', 'Prefer not to say'],
    ]);
    expect(isOfferedGender('non-binary')).toBe(false);
    expect(GENDERS.every((gender) => isOfferedGender(gender.key))).toBe(true);
  });

  it('keeps "Non-binary" for the answers that said it: its label, in its old place among every answer the question has had', () => {
    expect(ALL_GENDERS.map((gender) => gender.key)).toEqual(['male', 'female', 'non-binary', 'undisclosed']);
    expect(genderLabel('non-binary')).toBe('Non-binary');
  });

  it('puts a kept "Non-binary" among the options in one person’s survey - where it stood - and leaves the questions as they are for every other answer', () => {
    const [gender, age] = aboutYouQuestionsFor('non-binary');
    expect(gender.options.map((option) => [option.id, option.label])).toEqual([
      ['male', 'Male'],
      ['female', 'Female'],
      ['non-binary', 'Non-binary'],
      ['undisclosed', 'Prefer not to say'],
    ]);
    expect({ ...gender, options: [] }).toEqual({ ...ABOUT_YOU_QUESTIONS[0], options: [] });
    expect(age).toBe(ABOUT_YOU_QUESTIONS[1]);
    for (const other of ['female', 'undisclosed', null, undefined, 'nope']) {
      expect(aboutYouQuestionsFor(other)).toBe(ABOUT_YOU_QUESTIONS);
    }
  });
});
