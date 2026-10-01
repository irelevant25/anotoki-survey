import { TEST_LANGUAGES } from '../../core/testing/test-translations';
import { PageLanguage, otherLanguage } from './shown-language';

/** A page in a language, offering English and Slovak. */
function pageIn(language: string): PageLanguage {
  return { effectiveLanguage: () => language, languages: () => TEST_LANGUAGES } as PageLanguage;
}

describe('otherLanguage', () => {
  it('is nothing for texts in the language of the page - or in no language anybody named', () => {
    expect(otherLanguage(pageIn('sk'), 'sk')).toBeNull();
    expect(otherLanguage(pageIn('en'), 'en')).toBeNull();
    expect(otherLanguage(pageIn('sk'), undefined)).toBeNull();
    expect(otherLanguage(pageIn('sk'), null)).toBeNull();
    expect(otherLanguage(pageIn('sk'), '')).toBeNull();
  });

  it('names another language as its speakers write it, and says that the name is in it', () => {
    expect(otherLanguage(pageIn('sk'), 'en')).toEqual({ code: 'en', name: 'English', nameLang: 'en' });
    expect(otherLanguage(pageIn('en'), 'sk')).toEqual({ code: 'sk', name: 'Slovenčina', nameLang: 'sk' });
  });

  it('names a language the site does not offer by its code - which is not a word of that language', () => {
    expect(otherLanguage(pageIn('sk'), 'cs')).toEqual({ code: 'cs', name: 'cs', nameLang: null });
  });
});
