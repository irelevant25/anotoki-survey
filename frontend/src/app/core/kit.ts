import { EnvironmentProviders, inject, makeEnvironmentProviders } from '@angular/core';
import { type AnotokiWordKey, type AnotokiWordTable, type IconSet, type KitIconName, provideAnotokiUi } from '@anotoki/lib/ui';
import {
  iconArrowDown,
  iconArrowRight,
  iconArrowUp,
  iconBold,
  iconCalendar,
  iconChart,
  iconCheckSquare,
  iconChevronUp,
  iconClipboardList,
  iconClock,
  iconCollapse,
  iconColumns,
  iconCornerDownRight,
  iconDownload,
  iconEraser,
  iconExpand,
  iconFileText,
  iconFilter,
  iconGlobe,
  iconGrip,
  iconHighlighter,
  iconImage,
  iconImageOff,
  iconImagePlus,
  iconItalic,
  iconLink,
  iconListBullets,
  iconListOrdered,
  iconLock,
  iconMessage,
  iconPencil,
  iconPlay,
  iconRadio,
  iconRedo,
  iconRotateCcw,
  iconScale,
  iconSend,
  iconSliders,
  iconStopCircle,
  iconStrike,
  iconText,
  iconTrash,
  iconUnderline,
  iconUndo,
  iconUnlink,
  iconUsers,
  iconZoomIn,
} from '@anotoki/lib/ui/icons';
import { type AnotokiShellConfig, provideAnotokiShell } from '@anotoki/lib/shell';
import { AuthService } from './auth/auth.service';
import { TranslationService } from './i18n/translation.service';

/**
 * The anotoki family's UI kit (anotoki-lib 0.2.0: @anotoki/lib/ui and its
 * entry points, @anotoki/lib/shell) wired to this site: its icons, its words
 * and its formal Slovak, its theme and its languages. The kit itself is the
 * library's and is never changed here; what is the site's meets it in this
 * file.
 */

/**
 * The icons this site's own templates name beyond the kit's own (sun, moon,
 * menu, x, check, alert, search, ...): every other one it draws. The
 * question types, the editor's toolbar and the results are the survey's own;
 * `survey` is the family's clipboard.
 */
export const SURVEY_ICONS = {
  arrowDown: iconArrowDown,
  arrowRight: iconArrowRight,
  arrowUp: iconArrowUp,
  bold: iconBold,
  calendar: iconCalendar,
  chart: iconChart,
  checkSquare: iconCheckSquare,
  chevronUp: iconChevronUp,
  clock: iconClock,
  collapse: iconCollapse,
  columns: iconColumns,
  cornerDownRight: iconCornerDownRight,
  download: iconDownload,
  eraser: iconEraser,
  expand: iconExpand,
  fileText: iconFileText,
  filter: iconFilter,
  globe: iconGlobe,
  grip: iconGrip,
  highlighter: iconHighlighter,
  image: iconImage,
  imageOff: iconImageOff,
  imagePlus: iconImagePlus,
  italic: iconItalic,
  link: iconLink,
  listBullets: iconListBullets,
  listOrdered: iconListOrdered,
  lock: iconLock,
  message: iconMessage,
  pencil: iconPencil,
  play: iconPlay,
  radio: iconRadio,
  redo: iconRedo,
  rotateCcw: iconRotateCcw,
  scale: iconScale,
  send: iconSend,
  sliders: iconSliders,
  stopCircle: iconStopCircle,
  strike: iconStrike,
  survey: iconClipboardList,
  text: iconText,
  trash: iconTrash,
  underline: iconUnderline,
  undo: iconUndo,
  unlink: iconUnlink,
  users: iconUsers,
  zoomIn: iconZoomIn,
} satisfies IconSet;

/** An icon this site can draw: one of the kit's, or one of SURVEY_ICONS. */
export type SurveyIconName = KitIconName | keyof typeof SURVEY_ICONS;

/** The localStorage key of the theme shown last - the one the kit's theme-boot.js reads (index.html says it too). */
export const THEME_KEY = 'anotoki-survey:theme';

/** The kit's word keys by their namespace ('topbar') and their word ('signIn'). */
type Namespace = AnotokiWordKey extends `${infer Space}.${string}` ? Space : never;
type WordOf<Space extends string> = AnotokiWordKey extends infer Key ? (Key extends `${Space}.${infer Word}` ? Word : never) : never;
/**
 * Something for some of the kit's words, by namespace and word. Written so and
 * not as 'topbar.signIn': the key scan (backend/tools/translation_keys.php)
 * takes any quoted literal in a namespace the database has for a key the site
 * asks for, and these are the kit's names - the site's keys are the values.
 */
type ByKitWord = { readonly [Space in Namespace]?: { readonly [Word in WordOf<Space>]?: string } };

/**
 * The kit's words this site has strings of its own for - each with the
 * site's key. The string is read from the site's translations, so every word
 * the site showed before the kit keeps showing, an administrator's rewording
 * on the Translations page included, in the language on the page (English in
 * the admin panel). A kit word with no key here, or with no string loaded
 * (the pages drawn while the site cannot run), is the kit's own - in Slovak,
 * FORMAL_SLOVAK first.
 */
const SITE_KEYS: ByKitWord = {
  ui: {
    close: 'common.close',
    dismiss: 'toast.dismiss',
    notifications: 'toast.region',
    cancel: 'common.cancel',
    confirm: 'common.confirm',
    retry: 'common.tryAgain',
  },
  topbar: {
    sections: 'topbar.sections',
    phoneMenu: 'topbar.phoneMenu',
    menuButton: 'topbar.menuButton',
    menu: 'topbar.menu',
    roleAdmin: 'topbar.roleAdmin',
    roleEditor: 'topbar.roleEditor',
    account: 'topbar.account',
    admin: 'topbar.admin',
    signIn: 'common.signIn',
    signOut: 'common.signOut',
  },
  language: {
    button: 'language.button',
    notLoaded: 'language.notLoaded',
    notSaved: 'language.notSaved',
  },
  theme: {
    label: 'theme.label',
    light: 'theme.light',
    dark: 'theme.dark',
    auto: 'theme.auto',
    autoHint: 'theme.autoHint',
    notSaved: 'theme.notSaved',
  },
};

/**
 * The kit's built-in Slovak speaks to the reader informally (ty), as the other
 * anotoki sites do; this site speaks formally (Vy, with its capital -
 * docs/decisions.md). Every kit word whose Slovak addresses the reader, said
 * this site's way - for the moments its own strings are not there (the same
 * words as its migrations give them).
 */
const FORMAL_SLOVAK: ByKitWord = {
  ui: {
    copyFailed: 'Kopírovanie nefungovalo. Označte text a skopírujte ho ručne.',
  },
  topbar: {
    menuButton: 'Vaša ponuka: {name}',
    menu: 'Vaša ponuka',
    account: 'Váš anotoki účet',
  },
  language: {
    notLoaded: 'Jazyk sa nepodarilo načítať. Skúste to, prosím, znova.',
    notSaved: 'Jazyk sa nepodarilo uložiť do Vášho anotoki účtu – platí len počas tejto návštevy.',
  },
  theme: {
    notSaved: 'Vzhľad sa nepodarilo uložiť do Vášho anotoki účtu. Skúste to, prosím, znova.',
  },
};

/** A ByKitWord as the kit takes words: { 'topbar.menu': '...' }. */
function kitWords(words: ByKitWord): AnotokiWordTable {
  const table: Record<string, string> = {};
  for (const [space, inSpace] of Object.entries(words)) {
    for (const [word, text] of Object.entries(inSpace ?? {})) {
      table[`${space}.${word}`] = text as string;
    }
  }
  return table as AnotokiWordTable;
}

/** The site's own key for a kit word, or null. */
export function siteKeyOf(key: AnotokiWordKey): string | null {
  const [space, word] = key.split('.') as [Namespace, string];
  return (SITE_KEYS[space] as Readonly<Record<string, string>> | undefined)?.[word] ?? null;
}

/**
 * The kit's words, icons and language: the language on the page ('en' in the
 * admin panel - `effectiveLanguage`), the site's own string for a kit word
 * wherever it has one (SITE_KEYS), formal Slovak for the rest, and the
 * survey's icons.
 */
export function provideSiteUi(): EnvironmentProviders {
  return provideAnotokiUi(() => {
    const i18n = inject(TranslationService);
    return {
      language: () => i18n.effectiveLanguage(),
      words: { sk: kitWords(FORMAL_SLOVAK) },
      lookup: (key) => {
        const own = siteKeyOf(key);
        return own !== null && i18n.has(own) ? i18n.t(own) : null;
      },
      icons: SURVEY_ICONS,
    };
  });
}

/**
 * The kit's shell - the theme service and switch, the language switcher of the
 * top bar - wired to the anotoki account and this site's languages:
 *
 * - the theme is the account's while somebody is signed in and the IAM sends
 *   preferences (its migration 015), saved to it with the SDK's
 *   savePreferences() - one save at a time, the latest last; the device's
 *   otherwise, and nothing saved;
 * - the languages are the site's, each by the name its speakers give it; a
 *   choice is TranslationService.setLanguage(), which saves it to the account
 *   itself. A choice of the language already on the page, with no other on
 *   its way, changes nothing - not even what the device remembers.
 */
export function shellConfig(auth: AuthService, i18n: TranslationService): AnotokiShellConfig {
  let switching = 0;
  return {
    theme: {
      storageKey: THEME_KEY,
      account: () => auth.preferences()?.theme ?? null,
      save: (theme) => auth.savePreferences({ theme }),
    },
    languages: {
      current: () => i18n.language(),
      offered: () => i18n.languages().map((language) => ({ code: language.code, name: language.nativeName })),
      choose: async (code) => {
        if (code === i18n.language() && switching === 0) {
          return true;
        }
        switching += 1;
        try {
          return await i18n.setLanguage(code);
        } finally {
          switching -= 1;
        }
      },
    },
  };
}

export function provideSiteShell(): EnvironmentProviders {
  return provideAnotokiShell(() => shellConfig(inject(AuthService), inject(TranslationService)));
}

/** The whole kit, as the app has it. */
export function provideSiteKit(): EnvironmentProviders {
  return makeEnvironmentProviders([provideSiteUi(), provideSiteShell()]);
}
