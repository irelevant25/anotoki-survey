import { EnvironmentProviders, Injector, inject, makeEnvironmentProviders } from '@angular/core';
import { type AnotokiShellConfig, provideAnotokiShell } from '@anotoki/lib/shell';
import { TranslationService } from '@anotoki/lib/translations';
import { type IconSet, provideAnotokiUi } from '@anotoki/lib/ui/config';
import { type KitIconName } from '@anotoki/lib/ui/icon';
import {
  iconArrowDown,
  iconArrowRight,
  iconArrowUp,
  iconCalendar,
  iconChart,
  iconCheckSquare,
  iconChevronUp,
  iconClipboardList,
  iconClock,
  iconCollapse,
  iconColumns,
  iconCornerDownRight,
  iconDatabase,
  iconDownload,
  iconExpand,
  iconFileText,
  iconFilter,
  iconGlobe,
  iconGrip,
  iconHistory,
  iconImage,
  iconImageOff,
  iconImagePlus,
  iconLayers,
  iconListBullets,
  iconListOrdered,
  iconLock,
  iconMessage,
  iconPencil,
  iconPlay,
  iconRadio,
  iconRotateCcw,
  iconScale,
  iconSend,
  iconSliders,
  iconStopCircle,
  iconText,
  iconTrash,
  iconUsers,
  iconZoomIn,
} from '@anotoki/lib/ui/icons';
import { AuthService } from './auth/auth.service';

/**
 * The anotoki family's UI kit (anotoki-lib 0.3.0: each piece from its own
 * entry point - @anotoki/lib/ui/button, ui/icon, ...; @anotoki/lib/shell)
 * wired to this site: its icons, its words, its theme and its languages. The
 * kit itself is the library's and is never changed here; what is the site's
 * meets it in this file.
 */

/**
 * The icons this site's own templates name beyond the kit's own (sun, moon,
 * menu, x, check, alert, search, ...): every other one it draws. The
 * question types, the results and the admin panel's System links
 * (database, history, layers) are the survey's own; `survey` is the family's
 * clipboard. The text editor's toolbar is the family's, with its own icons.
 */
export const SURVEY_ICONS = {
  arrowDown: iconArrowDown,
  arrowRight: iconArrowRight,
  arrowUp: iconArrowUp,
  calendar: iconCalendar,
  chart: iconChart,
  checkSquare: iconCheckSquare,
  chevronUp: iconChevronUp,
  clock: iconClock,
  collapse: iconCollapse,
  columns: iconColumns,
  cornerDownRight: iconCornerDownRight,
  database: iconDatabase,
  download: iconDownload,
  expand: iconExpand,
  fileText: iconFileText,
  filter: iconFilter,
  globe: iconGlobe,
  grip: iconGrip,
  history: iconHistory,
  image: iconImage,
  imageOff: iconImageOff,
  imagePlus: iconImagePlus,
  layers: iconLayers,
  listBullets: iconListBullets,
  listOrdered: iconListOrdered,
  lock: iconLock,
  message: iconMessage,
  pencil: iconPencil,
  play: iconPlay,
  radio: iconRadio,
  rotateCcw: iconRotateCcw,
  scale: iconScale,
  send: iconSend,
  sliders: iconSliders,
  stopCircle: iconStopCircle,
  survey: iconClipboardList,
  text: iconText,
  trash: iconTrash,
  users: iconUsers,
  zoomIn: iconZoomIn,
} satisfies IconSet;

/** An icon this site can draw: one of the kit's, or one of SURVEY_ICONS. */
export type SurveyIconName = KitIconName | keyof typeof SURVEY_ICONS;

/** The localStorage key of the theme shown last - the one the kit's theme-boot.js reads (index.html says it too). */
export const THEME_KEY = 'anotoki-survey:theme';

/**
 * The kit's words, icons and language: the language on the page ('en' in the
 * admin panel - `effectiveLanguage`) and the kit's words from the site's
 * database - the library's keys, `anotoki.<word>` (TranslationService.forKit()):
 * what the bar, the switches, a dialog's X and a notification say is reworded
 * on the Translations page like any other string, and reads in this site's
 * formal Slovak (migration 010; shared/translations.ts for the moments there are
 * no strings) - never the kit's informal built-in ty. And the survey's icons.
 *
 * The family's dates (anotoki-lib 0.11.0, @anotoki/lib/ui/dates: the pipes
 * anotokiDate and anotokiAgo on the pages people take surveys on) write in the
 * page's locale (forKit()'s: en-GB, sk-SK - English in the admin panel) and in
 * the anotoki account's date order and clock where it chose them
 * (AuthService.preferences(): null signed out, or from an IAM before its 015) -
 * asked when a date is written, never before (a spec of a page with no dates
 * needs no sign-in).
 */
export function provideSiteUi(): EnvironmentProviders {
  return provideAnotokiUi(() => {
    const injector = inject(Injector);
    return { ...inject(TranslationService).forKit(), icons: SURVEY_ICONS, dateChoices: () => injector.get(AuthService).preferences() };
  });
}

/**
 * The kit's shell - the theme service and its switch (the top bar's and the admin panel's frame's), the language switcher of the
 * top bar - wired to the anotoki account and this site's languages:
 *
 * - the theme is the account's while somebody is signed in and the IAM sends
 *   preferences (its migration 015), saved to it with the anotoki library's
 *   savePreferences() (AuthService) - one save at a time, the latest last;
 *   the device's otherwise, and nothing saved;
 * - the languages are the site's, each by the name its speakers give it
 *   (TranslationService.forShell()); a choice is the service's setLanguage(),
 *   which saves it to the account itself, and a refusal is said under the
 *   switcher. A choice of the language already on the page, with no other on
 *   its way, changes nothing - not even what the device remembers.
 */
export function shellConfig(auth: AuthService, i18n: TranslationService): AnotokiShellConfig {
  const languages = i18n.forShell();
  let switching = 0;
  return {
    theme: {
      storageKey: THEME_KEY,
      account: () => auth.preferences()?.theme ?? null,
      save: (theme) => auth.savePreferences({ theme }),
    },
    languages: {
      ...languages,
      choose: async (code) => {
        if (code === i18n.language() && switching === 0) {
          return true;
        }
        switching += 1;
        try {
          return await languages.choose(code);
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
