import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** A circle as a path, so every icon is a list of `d` strings and nothing else. */
function circle(cx: number, cy: number, r: number): string {
  return `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0`;
}

/** A rounded rectangle as a path. */
function rect(x: number, y: number, w: number, h: number, r: number): string {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

const SHIELD = 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z';

/**
 * The icon set: 24-unit line icons in the manner of Lucide, drawn as paths.
 *
 * Paths only, bound with `[attr.d]`, so an icon is data rather than markup and
 * nothing has to get past the sanitizer. There is no icon font and no sprite
 * request - the whole set is a few kilobytes of strings.
 */
const ICONS = {
  sun: [circle(12, 12, 4), 'M12 2v2', 'M12 20v2', 'M4.93 4.93l1.41 1.41', 'M17.66 17.66l1.41 1.41', 'M2 12h2', 'M20 12h2', 'M6.34 17.66l-1.41 1.41', 'M19.07 4.93l-1.41 1.41'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'],
  monitor: [rect(2, 3, 20, 14, 2), 'M8 21h8', 'M12 17v4'],
  user: ['M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2', circle(12, 7, 4)],
  users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', circle(9, 7, 4), 'M22 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  userPlus: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', circle(9, 7, 4), 'M19 8v6', 'M22 11h-6'],
  shield: [SHIELD],
  shieldCheck: [SHIELD, 'M9 12l2 2 4-4'],
  laptop: ['M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16'],
  smartphone: [rect(5, 2, 14, 20, 2), 'M12 18h.01'],
  grid: [rect(3, 3, 7, 7, 1), rect(14, 3, 7, 7, 1), rect(14, 14, 7, 7, 1), rect(3, 14, 7, 7, 1)],
  terminal: ['M4 17l6-6-6-6', 'M12 19h8'],
  logOut: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5', 'M21 12H9'],
  chevronDown: ['M6 9l6 6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  chevronLeft: ['M15 18l-6-6 6-6'],
  menu: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  x: ['M18 6 6 18', 'M6 6l12 12'],
  check: ['M20 6 9 17l-5-5'],
  copy: [rect(8, 8, 14, 14, 2), 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  eye: ['M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0', circle(12, 12, 3)],
  eyeOff: [
    'M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68',
    'M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61',
    'M14.12 14.12a3 3 0 1 1-4.24-4.24',
    'M2 2l20 20',
  ],
  alert: ['M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  info: [circle(12, 12, 10), 'M12 16v-4', 'M12 8h.01'],
  checkCircle: [circle(12, 12, 10), 'M9 12l2 2 4-4'],
  xCircle: [circle(12, 12, 10), 'M15 9l-6 6', 'M9 9l6 6'],
  mail: [rect(2, 4, 20, 16, 2), 'M22 7l-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7'],
  lock: [rect(3, 11, 18, 11, 2), 'M7 11V7a5 5 0 0 1 10 0v4'],
  key: [circle(7.5, 15.5, 5.5), 'M21 2l-9.6 9.6', 'M15.5 7.5l3 3L22 7l-3-3'],
  activity: ['M22 12h-4l-3 9L9 3l-3 9H2'],
  sliders: ['M4 21v-7', 'M4 10V3', 'M12 21v-9', 'M12 8V3', 'M20 21v-5', 'M20 12V3', 'M1 14h6', 'M9 8h6', 'M17 16h6'],
  database: ['M3 5a9 3 0 1 0 18 0a9 3 0 1 0-18 0', 'M3 5v14a9 3 0 0 0 18 0V5', 'M3 12a9 3 0 0 0 18 0'],
  refresh: ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  plus: ['M5 12h14', 'M12 5v14'],
  trash: ['M3 6h18', 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6', 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2'],
  externalLink: ['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'],
  download: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  arrowLeft: ['M12 19l-7-7 7-7', 'M19 12H5'],
  arrowRight: ['M5 12h14', 'M12 5l7 7-7 7'],
  search: [circle(11, 11, 8), 'M21 21l-4.3-4.3'],
  sparkle: ['M12 2.5l1.9 7.6 7.6 1.9-7.6 1.9L12 21.5l-1.9-7.6L2.5 12l7.6-1.9z'],
  clock: [circle(12, 12, 10), 'M12 6v6l4 2'],
  globe: [circle(12, 12, 10), 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
  dashboard: [rect(3, 3, 7, 9, 1), rect(14, 3, 7, 5, 1), rect(14, 12, 7, 9, 1), rect(3, 16, 7, 5, 1)],
  fileText: ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4', 'M10 9H8', 'M16 13H8', 'M16 17H8'],
  layers: ['M12 2 2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  appWindow: [rect(2, 4, 20, 16, 2), 'M2 9h20', 'M6 6.5h.01', 'M9 6.5h.01'],
  pencil: ['M21.17 6.81a1 1 0 0 0-3.99-3.99L3.84 16.17a2 2 0 0 0-.5.83l-1.32 4.35a.5.5 0 0 0 .62.62l4.35-1.32a2 2 0 0 0 .83-.5z', 'M15 5l4 4'],
  ban: [circle(12, 12, 10), 'M4.9 4.9l14.2 14.2'],
  history: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5', 'M12 7v5l4 2'],
  send: ['M14.54 21.69a.5.5 0 0 0 .94-.03l6.5-19a.5.5 0 0 0-.64-.64l-19 6.5a.5.5 0 0 0-.02.94l7.93 3.18a2 2 0 0 1 1.11 1.11z', 'M21.85 2.15 10.91 13.09'],
  dice: [rect(3, 3, 18, 18, 3), 'M8 8h.01', 'M16 8h.01', 'M12 12h.01', 'M8 16h.01', 'M16 16h.01'],
  link: ['M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71', 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71'],

  // The survey's own: question types, the editor's toolbar, results.
  survey: [rect(8, 2, 8, 4, 1), 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2', 'M12 11h4', 'M12 16h4', 'M8 11h.01', 'M8 16h.01'],
  radio: [circle(12, 12, 9), circle(12, 12, 3.5)],
  checkSquare: [rect(3, 3, 18, 18, 3), 'M8.5 12l2.5 2.5 4.5-5'],
  text: ['M21 6H3', 'M17 12H3', 'M15 18H3'],
  grip: [circle(9, 5, 1), circle(9, 12, 1), circle(9, 19, 1), circle(15, 5, 1), circle(15, 12, 1), circle(15, 19, 1)],
  arrowUp: ['M12 19V5', 'M5 12l7-7 7 7'],
  arrowDown: ['M12 5v14', 'M19 12l-7 7-7-7'],
  chevronUp: ['M18 15l-6-6-6 6'],
  cornerDownRight: ['M15 10l5 5-5 5', 'M4 4v7a4 4 0 0 0 4 4h12'],
  moreHorizontal: [circle(5, 12, 1), circle(12, 12, 1), circle(19, 12, 1)],
  bold: ['M6 12h9a4 4 0 0 1 0 8H7a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h7a4 4 0 0 1 0 8'],
  italic: ['M19 4h-9', 'M14 20H5', 'M15 4 9 20'],
  underline: ['M6 4v6a6 6 0 0 0 12 0V4', 'M4 20h16'],
  strike: ['M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 0 8H6', 'M4 12h16'],
  highlighter: ['M9 11l-6 6v3h9l3-3', 'M22 12l-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4'],
  heading: ['M6 12h12', 'M6 20V4', 'M18 20V4'],
  listBullets: ['M3 6h.01', 'M3 12h.01', 'M3 18h.01', 'M8 6h13', 'M8 12h13', 'M8 18h13'],
  listOrdered: ['M10 6h11', 'M10 12h11', 'M10 18h11', 'M4 6h1v4', 'M4 10h2', 'M6 18H4c0-1 2-2 2-3s-1-1.5-2-1'],
  unlink: ['M18.84 12.25l1.72-1.71a5 5 0 0 0-.12-7.07 5 5 0 0 0-6.95 0l-1.72 1.71', 'M5.17 11.75l-1.71 1.71a5 5 0 0 0 .12 7.07 5 5 0 0 0 6.95 0l1.71-1.71', 'M8 2v3', 'M2 8h3', 'M16 19v3', 'M19 16h3'],
  eraser: ['M4 7V4h16v3', 'M5 20h6', 'M13 4 8 20', 'M15 15l5 5', 'M20 15l-5 5'],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['M15 14l5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  chart: ['M3 3v16a2 2 0 0 0 2 2h16', 'M7 16h8', 'M7 11h12', 'M7 6h3'],
  play: ['M6 3l14 9-14 9z'],
  stopCircle: [circle(12, 12, 10), rect(9, 9, 6, 6, 1)],
  filter: ['M10 20a1 1 0 0 0 .55.9l2 1A1 1 0 0 0 14 21v-7a2 2 0 0 1 .52-1.34l7.22-7.99A1 1 0 0 0 21 3H3a1 1 0 0 0-.74 1.67l7.22 7.99A2 2 0 0 1 10 14z'],
  flask: ['M14 2v6a2 2 0 0 0 .25.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.76-2.96l5.51-10.08A2 2 0 0 0 10 8V2', 'M6.45 15h11.1', 'M8.5 2h7'],
  calendar: [rect(3, 4, 18, 18, 2), 'M16 2v4', 'M8 2v4', 'M3 10h18'],
  message: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
  logIn: ['M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4', 'M10 17l5-5-5-5', 'M15 12H3'],
  rotateCcw: ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  columns: [rect(3, 3, 18, 18, 2), 'M12 3v18'],
  scale: ['M3 12h18', 'M3 8v8', 'M21 8v8', 'M12 9v6', 'M7.5 10v4', 'M16.5 10v4'],
  collapse: ['M7 20l5-5 5 5', 'M7 4l5 5 5-5'],
  expand: ['M7 15l5 5 5-5', 'M7 9l5-5 5 5'],
  image: [rect(3, 3, 18, 18, 2), circle(9, 9, 2), 'M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21'],
  imagePlus: ['M16 5h6', 'M19 2v6', 'M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5', 'M21 15l-3.09-3.09a2 2 0 0 0-2.82 0L6 21', circle(9, 9, 2)],
  imageOff: ['M2 2l20 20', 'M10.41 10.41a2 2 0 1 1-2.83-2.83', 'M13.5 13.5 6 21', 'M18 12l3 3', 'M3.59 3.59A2 2 0 0 0 3 5v14a2 2 0 0 0 2 2h14c.55 0 1.05-.22 1.41-.59', 'M21 15V5a2 2 0 0 0-2-2H9'],
  zoomIn: [circle(11, 11, 8), 'M21 21l-4.35-4.35', 'M11 8v6', 'M8 11h6'],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;

/**
 * One icon, decorative by default.
 *
 * `aria-hidden` unless a `label` is given: an icon next to a word says nothing
 * the word does not, and a screen reader reading "check" before "Confirmed"
 * is noise. An icon on its own (an icon-only button) gets its name from the
 * button's `aria-label` instead, so it stays hidden there too.
 */
@Component({
  selector: 'app-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'icon' },
  templateUrl: './icon.component.html',
  styleUrl: './icon.component.scss',
})
export class IconComponent {
  readonly name = input.required<IconName>();
  readonly size = input<number>(18);
  readonly strokeWidth = input<number>(1.75);
  readonly filled = input<boolean>(false);
  readonly label = input<string | null>(null);

  protected readonly paths = computed(() => ICONS[this.name()]);
}
