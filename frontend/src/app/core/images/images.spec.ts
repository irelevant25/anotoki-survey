import { choiceSummary } from '../survey/results';
import { copyQuestion, copySurvey, newOption, newQuestion } from '../survey/survey-factory';
import { SurveyImage } from '../survey/survey.model';
import { exampleData } from '../testing/example-data';
import { MAX_FILE_BYTES, altFromFileName, imageFileProblem, pastedPictures, pictureFiles } from './prepare-image';

const picture = (id: string): SurveyImage => ({ id, alt: '', width: 400, height: 300, src: `/api/images/${id}.webp` });

describe('the files a survey takes as pictures', () => {
  it('takes the web picture formats, and nothing else', () => {
    expect(imageFileProblem({ name: 'a.png', type: 'image/png', size: 1000 })).toBeNull();
    expect(imageFileProblem({ name: 'a.webp', type: 'image/webp', size: 1000 })).toBeNull();
    expect(imageFileProblem({ name: 'a.gif', type: 'image/gif', size: 1000 })).toBeNull();
    expect(imageFileProblem({ name: 'a.svg', type: 'image/svg+xml', size: 1000 })).toMatch(/not a picture this survey can show/);
    expect(imageFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toMatch(/not a picture/);
    expect(imageFileProblem({ name: 'huge.jpg', type: 'image/jpeg', size: MAX_FILE_BYTES + 1 })).toMatch(/larger than 15 MB/);
  });

  it('keeps only the pictures of a drop or a paste', () => {
    const files = [new File(['x'], 'a.png', { type: 'image/png' }), new File(['x'], 'b.txt', { type: 'text/plain' })];
    expect(pictureFiles(files).map((file) => file.name)).toEqual(['a.png']);
    expect(pictureFiles(null)).toEqual([]);
  });

  it('pastes the text of a spreadsheet as text, though a picture of its cells comes with it', () => {
    // What a DataTransfer offers a paste handler, without the browser around it.
    const clipboard = (text: string, ...files: File[]) => ({ files, getData: (type: string) => (type === 'text/plain' ? text : '') }) as unknown as DataTransfer;
    const png = new File(['x'], 'image.png', { type: 'image/png' });
    expect(pastedPictures(clipboard('Anemo\tGeo\nHydro\tPyro', png))).toEqual([]);
    expect(pastedPictures(clipboard('', png))).toEqual([png]);
    expect(pastedPictures(clipboard('https://example.com/picture.png', png))).toEqual([png]);
    expect(pastedPictures(clipboard('just words'))).toEqual([]);
    expect(pastedPictures(null)).toEqual([]);
  });

  it('describes a picture by its file name, unless a camera named it', () => {
    expect(altFromFileName('hu-tao_portrait.png')).toBe('hu tao portrait');
    expect(altFromFileName('IMG_2041.jpg')).toBe('');
    expect(altFromFileName('Screenshot 2026-09-29 201455.png')).toBe('');
    expect(altFromFileName('12345.png')).toBe('');
  });
});

describe('pictures in surveys', () => {
  it('shares the pictures of a copied question, never the ids of its options', () => {
    const question = { ...newQuestion('single'), images: [picture('p1')], options: [{ ...newOption('A'), images: [picture('p2')] }, newOption('B')] };
    const copy = copyQuestion(question).question;
    expect(copy.images).toEqual(question.images);
    expect(copy.images).not.toBe(question.images);
    expect(copy.options[0].images).toEqual([picture('p2')]);
    expect(copy.options[0].id).not.toBe(question.options[0].id);
  });

  it('copies a survey as a new draft that shows the same pictures, never saved yet', () => {
    const [original] = exampleData(Date.parse('2026-09-29T12:00:00Z')).surveys;
    const copy = copySurvey(original, [original.slug]);
    const pictures = (survey: typeof original) => survey.steps.flatMap((step) => step.questions.flatMap((question) => [...question.images, ...question.options.flatMap((option) => option.images)]));
    expect(pictures(copy)).toEqual(pictures(original));
    expect(copy.status).toBe('draft');
    expect(copy.revision).toBe(0);
    expect(copy.slug).toBe(`${original.slug}-copy`);
  });

  it('puts an option first picture beside its bar', () => {
    const question = { ...newQuestion('single'), options: [{ ...newOption('A'), images: [picture('p1'), picture('p2')] }, newOption('B')] };
    const [a, b] = choiceSummary(question, []).tallies;
    expect(a.image?.id).toBe('p1');
    expect(b.image).toBeNull();
  });
});
