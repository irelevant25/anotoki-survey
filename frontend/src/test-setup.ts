/*
 * The unit tests' setup (angular.json: test.options.setupFiles); not part of the app.
 *
 * jsdom lacks a few things a browser has that the anotoki family's kit
 * (@anotoki/lib) uses - the same shims as the library's own tests:
 * - <dialog>'s showModal() and close(): the open attribute, the close event, and
 *   the focus going back where it was;
 * - matchMedia (the top bar's widths, the theme's "as the device is set"): a
 *   window that matches no query, unless a spec puts its own in place
 *   (vi.stubGlobal, undone by vi.unstubAllGlobals());
 * - checkVisibility() (which elements a dialog's Tab cycles through): drawn
 *   unless hidden or in a closed dialog;
 * - the popover API (the kit's menus are drawn in the top layer): shown in place.
 */

const dialogs = HTMLDialogElement.prototype;

if (typeof dialogs.showModal !== 'function') {
  const focusBefore = new WeakMap<HTMLDialogElement, Element | null>();

  dialogs.showModal = function (this: HTMLDialogElement): void {
    if (this.hasAttribute('open')) {
      throw new DOMException('The dialog is already open.', 'InvalidStateError');
    }
    focusBefore.set(this, this.ownerDocument.activeElement);
    this.setAttribute('open', '');
  };

  dialogs.show = dialogs.showModal;

  dialogs.close = function (this: HTMLDialogElement, returnValue?: string): void {
    if (!this.hasAttribute('open')) {
      return;
    }
    this.removeAttribute('open');
    if (returnValue !== undefined) {
      this.returnValue = returnValue;
    }
    const before = focusBefore.get(this);
    if (before instanceof HTMLElement) {
      before.focus();
    }
    this.dispatchEvent(new Event('close'));
  };
}

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

if (typeof Element.prototype.checkVisibility !== 'function') {
  Element.prototype.checkVisibility = function (this: Element): boolean {
    return !this.closest('[hidden], dialog:not([open])');
  };
}

const elements = HTMLElement.prototype as HTMLElement & { showPopover?: () => void; hidePopover?: () => void };
if (typeof elements.showPopover !== 'function') {
  elements.showPopover = function (): void {};
  elements.hidePopover = function (): void {};
}
