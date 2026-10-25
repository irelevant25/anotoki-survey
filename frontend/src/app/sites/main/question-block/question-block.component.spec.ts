import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslationService } from '@anotoki/lib/translations';
import { AnswerProblem, answerProblem } from '../../../shared/survey/answer-rules';
import { newOption, newQuestion } from '../../../shared/survey/survey-factory';
import { Answer, Question } from '../../../shared/survey/survey.model';
import { provideTestTranslations } from '../../../shared/testing/test-translations';
import { LightboxService } from '../../../shared/ui/lightbox/lightbox.service';
import { QuestionBlockComponent } from './question-block.component';

const ENGLISH = {
  'answer.rule.any': 'Choose any that apply.',
  'answer.rule.upTo.one': 'Choose up to {count}.',
  'answer.rule.upTo.few': 'Choose up to {count}.',
  'answer.rule.upTo.other': 'Choose up to {count}.',
  'answer.problem.choose': 'Please choose an answer.',
  'answer.problem.writeOther': 'Please write what "{label}" is for you.',
  'question.chosen.one': '{count} chosen',
  'question.chosen.few': '{count} chosen',
  'question.chosen.other': '{count} chosen',
  'question.optional': 'Optional',
  'question.otherPlaceholder': 'Your own answer',
  'question.otherLabel': '{label}: your own answer',
  'question.clear': 'Clear my answer',
  'question.showLarge': 'Show large: {label}',
  'question.showLargeNumbered': 'Show large: picture {number}',
  'question.showOptionLarge': 'Show the picture of {label} large',
  'question.showLargeTitle': 'Show large',
};
const SLOVAK = {
  'answer.rule.any': 'Vyberte všetky možnosti, ktoré platia.',
  'answer.rule.upTo.one': 'Vyberte najviac 1 možnosť.',
  'answer.rule.upTo.few': 'Vyberte najviac {count} možnosti.',
  'answer.rule.upTo.other': 'Vyberte najviac {count} možností.',
  'answer.problem.choose': 'Vyberte, prosím, odpoveď.',
  'answer.problem.writeOther': 'Pri možnosti „{label}“ napíšte, prosím, vlastnú odpoveď.',
  'question.chosen.one': 'Vybraná 1 možnosť',
  'question.chosen.few': 'Vybrané {count} možnosti',
  'question.chosen.other': 'Vybraných {count} možností',
  'question.optional': 'Nepovinné',
  'question.otherPlaceholder': 'Vaša vlastná odpoveď',
  'question.otherLabel': '{label}: Vaša vlastná odpoveď',
  'question.clear': 'Vymazať odpoveď',
  'question.showLarge': 'Zväčšiť obrázok: {label}',
  'question.showLargeNumbered': 'Zväčšiť obrázok {number}',
  'question.showOptionLarge': 'Zväčšiť obrázok možnosti: {label}',
  'question.showLargeTitle': 'Zväčšiť',
};

function choice(type: 'single' | 'multiple', labels: string[], extra: Partial<Question> = {}): Question {
  return { ...newQuestion(type), text: '<p>Čo hráte?</p>', options: labels.map((label) => newOption(label, label === 'Iné')), ...extra };
}

function picked(question: Question, ...labels: string[]): Answer {
  return { optionIds: question.options.filter((option) => labels.includes(option.label)).map((option) => option.id), other: '', text: '' };
}

describe('QuestionBlockComponent', () => {
  let fixture: ComponentFixture<QuestionBlockComponent>;
  let host: HTMLElement;

  const text = (selector: string) => host.querySelector(selector)?.textContent?.trim();

  async function draw(question: Question, answer?: Answer, error: AnswerProblem | null = null): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideTestTranslations(SLOVAK, { language: 'sk', english: ENGLISH })] });
    fixture = TestBed.createComponent(QuestionBlockComponent);
    host = fixture.nativeElement;
    fixture.componentRef.setInput('question', question);
    fixture.componentRef.setInput('answer', answer);
    fixture.componentRef.setInput('error', error);
    await fixture.whenStable();
  }

  async function english(): Promise<void> {
    expect(await TestBed.inject(TranslationService).setLanguage('en', { remember: false })).toBe(true);
    await fixture.whenStable();
  }

  it('words the rule and counts what is chosen, the way the language counts', async () => {
    const question = choice('multiple', ['A', 'B', 'C', 'D', 'E', 'F'], { maxChoices: 5 });
    await draw(question, picked(question, 'A'));
    expect(text('.rule span')).toBe('Vyberte najviac 5 možností.');
    expect(text('.rule .count')).toBe('Vybraná 1 možnosť');

    fixture.componentRef.setInput('answer', picked(question, 'A', 'B', 'C'));
    await fixture.whenStable();
    expect(text('.rule .count')).toBe('Vybrané 3 možnosti');

    fixture.componentRef.setInput('answer', picked(question, 'A', 'B', 'C', 'D', 'E'));
    await fixture.whenStable();
    expect(text('.rule .count')).toBe('Vybraných 5 možností');
  });

  it('has no rule line for a required question of one choice, and says "optional" for one that is not', async () => {
    await draw(choice('single', ['A', 'B']));
    expect(host.querySelector('.rule')).toBeNull();

    fixture.componentRef.setInput('question', choice('single', ['A', 'B'], { required: false }));
    await fixture.whenStable();
    expect(text('.rule')).toBe('Nepovinné');
    // The line is what the options are described by, so it must be there to point at.
    expect(host.querySelector('.options')?.getAttribute('aria-describedby')).toBe(host.querySelector('.rule')?.id);
  });

  it('words the problem it is given as a kind, and says it again in another language', async () => {
    const question = choice('single', ['A', 'B']);
    await draw(question, undefined, answerProblem(question, undefined));
    expect(text('.error span')).toBe('Vyberte, prosím, odpoveď.');
    expect(host.querySelector('.error')?.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.question')?.classList.contains('has-error')).toBe(true);

    await english();
    expect(text('.error span')).toBe('Please choose an answer.');
  });

  it('names "Other" in its problem by the label on the page', async () => {
    const question = choice('single', ['A', 'Iné']);
    const answer = picked(question, 'Iné');
    // The problem as it was found on the survey in another language: the same option, its label there.
    const found = answerProblem({ ...question, options: question.options.map((option) => (option.other ? { ...option, label: 'Other' } : option)) }, answer);
    expect(found).toEqual({ kind: 'writeOther', params: { optionId: question.options[1].id, label: 'Other' } });

    await draw(question, answer, found);
    expect(text('.error span')).toBe('Pri možnosti „Iné“ napíšte, prosím, vlastnú odpoveď.');
    const field = host.querySelector<HTMLInputElement>('.other input')!;
    expect(field.getAttribute('placeholder')).toBe('Vaša vlastná odpoveď');
    expect(field.getAttribute('aria-label')).toBe('Iné: Vaša vlastná odpoveď');
  });

  it('shows no problem and no words for one when there is none', async () => {
    const question = choice('multiple', ['A', 'B']);
    await draw(question, picked(question, 'A'));
    expect(host.querySelector('.error')).toBeNull();
    expect(host.querySelector('.question')?.classList.contains('has-error')).toBe(false);
    expect(text('.rule span')).toBe('Vyberte všetky možnosti, ktoré platia.');
  });

  it('offers a way back to no answer on an optional question of one choice', async () => {
    const question = choice('single', ['A', 'B'], { required: false });
    await draw(question, picked(question, 'A'));
    expect(text('button.clear')).toBe('Vymazať odpoveď');
    await english();
    expect(text('button.clear')).toBe('Clear my answer');
    expect(text('.rule')).toBe('Optional');
  });

  it('marks the question’s own texts with the language they are in when it is given one - the text and the labels, not the site’s words', async () => {
    const question = choice('multiple', ['Wind', 'Water'], { text: '<p>What do you play?</p>', required: false });
    await draw(question, picked(question, 'Wind'), { kind: 'choose', params: {} });
    expect(host.querySelectorAll('[lang]')).toHaveLength(0);

    fixture.componentRef.setInput('lang', 'en');
    await fixture.whenStable();
    expect(Array.from(host.querySelectorAll('[lang]')).map((element) => [element.className, element.textContent?.trim(), element.getAttribute('lang')])).toEqual([
      ['anotoki-rich-html text rich', 'What do you play?', 'en'],
      ['label', 'Wind', 'en'],
      ['label', 'Water', 'en'],
    ]);
    // The rule, the count, "optional", the problem: the page's language, so nothing of their own.
    expect(text('.rule')).toContain('Nepovinné');
    expect(host.querySelector('.rule')?.closest('[lang]:not(html)')).toBeNull();
    expect(host.querySelector('.error')?.closest('[lang]:not(html)')).toBeNull();
  });

  it('gives an own-words field no language, though its hint is the survey’s: `lang` there would name the language of what is typed', async () => {
    for (const multiline of [true, false]) {
      TestBed.resetTestingModule();
      await draw({ ...newQuestion('text'), text: '<p>What would you change?</p>', placeholder: 'A sentence or two', multiline });
      fixture.componentRef.setInput('lang', 'en');
      await fixture.whenStable();

      const field = host.querySelector<HTMLElement>('textarea, input.field-input')!;
      expect(field.tagName).toBe(multiline ? 'TEXTAREA' : 'INPUT');
      // The hint is there, the question's text is marked - and the field, where a Slovak reader writes Slovak, is not.
      expect(field.getAttribute('placeholder')).toBe('A sentence or two');
      expect(host.querySelector('.text')?.getAttribute('lang')).toBe('en');
      expect(field.hasAttribute('lang')).toBe(false);
      expect(field.closest('[lang]:not(html)')).toBeNull();
    }
  });

  it('gives the field of "Other" no language either', async () => {
    const question = choice('single', ['Wind', 'Iné']);
    await draw(question, picked(question, 'Iné'));
    fixture.componentRef.setInput('lang', 'en');
    await fixture.whenStable();

    const field = host.querySelector<HTMLInputElement>('.other input')!;
    expect(field.hasAttribute('lang')).toBe(false);
    expect(field.closest('[lang]:not(html)')).toBeNull();
  });

  it('shows a picture large with the language of its words: the question’s pictures, and an option’s under the option’s label', async () => {
    const image = (id: string, alt: string) => ({ id, src: `/api/images/${id}.png`, alt, width: 40, height: 30 });
    const question = { ...choice('single', ['A', 'B']), images: [image('one', 'A map of the world'), image('two', '')] };
    question.options[0] = { ...question.options[0], images: [image('three', '')] };
    await draw(question);
    const lightbox = TestBed.inject(LightboxService);

    host.querySelectorAll<HTMLButtonElement>('.gallery-item')[1].click();
    expect(lightbox.view()).toMatchObject({ index: 1, caption: null, lang: null });

    fixture.componentRef.setInput('lang', 'en');
    await fixture.whenStable();
    host.querySelectorAll<HTMLButtonElement>('.gallery-item')[0].click();
    expect(lightbox.view()).toMatchObject({ index: 0, caption: null, lang: 'en' });
    host.querySelector<HTMLButtonElement>('button.zoom')!.click();
    expect(lightbox.view()).toMatchObject({ index: 0, caption: 'A', lang: 'en' });
  });

  it('names the buttons that show a picture large: by its description, else by its place', async () => {
    const image = (id: string, alt: string) => ({ id, src: `/api/images/${id}.png`, alt, width: 40, height: 30 });
    const question = { ...choice('single', ['A', 'B']), images: [image('one', 'Mapa sveta'), image('two', '')] };
    question.options[0] = { ...question.options[0], images: [image('three', '')] };
    await draw(question);

    expect(Array.from(host.querySelectorAll('.gallery-item')).map((button) => button.getAttribute('aria-label'))).toEqual(['Zväčšiť obrázok: Mapa sveta', 'Zväčšiť obrázok 2']);
    const zoom = host.querySelector('button.zoom')!;
    expect(zoom.getAttribute('aria-label')).toBe('Zväčšiť obrázok možnosti: A');
    expect(zoom.getAttribute('title')).toBe('Zväčšiť');
  });
});
