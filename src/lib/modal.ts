// Port of js/app.js's modal system (auth-overhaul branch): body scroll lock,
// focus trap, opener-tracking so closing a modal returns focus to whatever
// opened it (keyboard users used to get dumped at the top of the document),
// and the global [data-modal-open]/[data-modal-close]/[data-modal-switch]
// click delegation plus the Escape-key handler.
//
// Phase 5: the login/signup/reset modals moved to Modal.tsx (Radix Dialog)
// and are no longer opened/closed through this module — but initModals()
// keeps running from Base.astro because practice.astro's #end-session-modal,
// flashcard.astro's #fixit/#report/#writer stubs, and course-one's modals
// are all still vanilla and still depend on this file's global Escape/
// backdrop-click delegation (practice.spec.ts pins Escape hiding
// #end-session-modal on exactly this handler). Every element Radix's
// Dialog.Content renders carries `data-state="open"|"closed"` — used below
// to make this module a no-op on any modal React already owns, so the two
// don't fight over the same node (a real bug: this module's lockBody()/
// unlockBody() track scroll position in a variable that's only ever set by
// its own openModalElement(), so acting on a Radix-opened modal it never
// opened would restore scroll to 0 instead of the position at open time).

const MODAL_FOCUSABLE = 'a, button, textarea, input, select, [tabindex]:not([tabindex="-1"])';

let modalScrollY = 0;

// Remember which control opened each modal so closing it can hand focus back.
const modalOpeners = new WeakMap<HTMLElement, HTMLElement>();

function lockBody(): void {
  if (document.body.classList.contains('no-scroll')) return;
  modalScrollY = window.scrollY || 0;
  document.body.classList.add('no-scroll');
  document.body.style.position = 'fixed';
  document.body.style.top = `-${modalScrollY}px`;
  document.body.style.width = '100%';
}

function unlockBody(): void {
  if (!document.body.classList.contains('no-scroll')) return;
  document.body.classList.remove('no-scroll');
  document.body.style.position = '';
  document.body.style.top = '';
  document.body.style.width = '';
  window.scrollTo(0, modalScrollY);
}

// Stale validation/auth errors must never survive an open, close, or switch.
function clearFormErrors(modal: HTMLElement): void {
  modal.querySelectorAll<HTMLElement>('.form-error').forEach((el) => {
    el.textContent = '';
    el.hidden = true;
  });
}

function trapFocus(modal: HTMLElement): void {
  // bind the Tab handler once per modal so repeated opens don't stack listeners
  if (!modal.dataset.focusTrapped) {
    modal.dataset.focusTrapped = '1';
    modal.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = modal.querySelectorAll<HTMLElement>(MODAL_FOCUSABLE);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    });
  }
  const first = modal.querySelector<HTMLElement>(MODAL_FOCUSABLE);
  first?.focus();
}

function resolveModal(target: string | HTMLElement): HTMLElement | null {
  return typeof target === 'string' ? document.getElementById(target) : target;
}

// True for any `.modal` Radix's Dialog.Content rendered (see the module
// comment above) — this module must never act on those.
function isRadixOwned(modal: HTMLElement): boolean {
  return modal.hasAttribute('data-state');
}

function openModalElement(modal: HTMLElement, opener?: HTMLElement): void {
  if (opener) modalOpeners.set(modal, opener);
  clearFormErrors(modal);
  modal.hidden = false;
  lockBody();
  trapFocus(modal);
}

function closeModalElement(modal: HTMLElement): void {
  if (modal.hidden) return;
  clearFormErrors(modal);
  modal.hidden = true;
  unlockBody();
  const opener = modalOpeners.get(modal);
  modalOpeners.delete(modal);
  if (opener && document.contains(opener)) opener.focus();
}

export function openModal(target: string | HTMLElement, opener?: HTMLElement): void {
  const modal = resolveModal(target);
  if (modal && !isRadixOwned(modal)) openModalElement(modal, opener);
}

export function closeModal(target?: string | HTMLElement): void {
  if (target === undefined) {
    // Skip past any Radix-owned modal to the next one this module actually
    // opened — relevant if a Radix dialog and a vanilla one both happen to
    // be open at once.
    const open = Array.from(document.querySelectorAll<HTMLElement>('.modal:not([hidden])')).find(
      (modal) => !isRadixOwned(modal),
    );
    if (open) closeModalElement(open);
    return;
  }
  const modal = resolveModal(target);
  if (modal && !isRadixOwned(modal)) closeModalElement(modal);
}

export function initModals(): void {
  document.addEventListener('click', (e: MouseEvent) => {
    const target = e.target;
    if (!(target instanceof Element)) return;

    const trigger = target.closest('[data-modal-open]');
    if (trigger instanceof HTMLElement) {
      e.preventDefault();
      const id = trigger.getAttribute('data-modal-open');
      if (id) openModal(id, trigger);
      return;
    }

    const closer = target.closest('[data-modal-close]');
    if (closer) {
      const modal = closer.closest('.modal');
      if (modal instanceof HTMLElement) closeModalElement(modal);
      return;
    }

    const switcher = target.closest('[data-modal-switch]');
    if (switcher instanceof HTMLElement) {
      const current = switcher.closest('.modal');
      // carry the original opener across so closing the switched-to modal
      // still restores focus
      let opener: HTMLElement | undefined;
      if (current instanceof HTMLElement) {
        opener = modalOpeners.get(current);
        modalOpeners.delete(current);
        clearFormErrors(current);
        current.hidden = true;
      }
      const nextId = switcher.getAttribute('data-modal-switch');
      if (nextId) openModal(nextId, opener);
      return;
    }

    // click on the backdrop itself closes the modal
    if (target.classList.contains('modal') && target instanceof HTMLElement && !isRadixOwned(target)) {
      closeModalElement(target);
    }
  });

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    closeModal();
  });
}
