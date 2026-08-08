// Replaces src/lib/modal.ts's hand-rolled focus trap, Escape handling, and
// body scroll lock with Radix Dialog's built-in equivalents. Radix gives us,
// for free, on every <Modal>: focus trap + focus restore to the opener,
// Escape-to-close, and body scroll lock while any instance is open.
//
// The one thing NOT delegated to Radix is backdrop-click-to-dismiss — see the
// comment on `handleBackdropPointerDown` below for why, and what's still
// hand-written as a result.
//
// SCROLL LOCK STILL COEXISTS WITH Nav.tsx: the mobile drawer there has its
// own, separate scroll-lock mechanism, ported unchanged from the old
// nav.ts (it toggles `no-scroll` + inline body styles itself, independent
// of this component's Radix-managed lock). Not consolidated as of Phase 5 —
// opening a <Modal> while the drawer is open (or vice versa) can involve two
// scroll-lock mechanisms at once. Known, documented, not exercised by any
// current spec (which test drawer and modal scroll-lock separately).
import { Dialog } from 'radix-ui';
import type { ComponentPropsWithoutRef, PointerEvent, ReactNode } from 'react';

export interface ModalProps {
  /** Modal is fully controlled — no internal open state. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Accessible name, rendered via Dialog.Title (an <h2> by default). Radix
   * requires a Title for every Dialog.Content for a11y; if the design has no
   * visible heading, pass `hideTitle` rather than omitting this.
   */
  title: string;
  /** Visually hide the title with `.sr-only` while keeping it announced. Default false. */
  hideTitle?: boolean;
  /**
   * Placed on the outer `.modal` element (Dialog.Content). Preserves the
   * existing per-modal CSS scoping in legacy.css (e.g. `#login-modal .dialog`
   * width overrides) and gives e2e tests a stable selector matching today's
   * markup (`#login-modal`, `#signup-modal`, `#reset-modal`, ...).
   */
  id?: string;
  children: ReactNode;
}

/**
 * Reusable modal dialog on top of Radix's Dialog primitive. Renders the
 * legacy `.modal` (fixed, dimmed backdrop) / `.dialog` (centered panel) class
 * pair so legacy.css's existing visual rules keep applying unchanged — this
 * component only replaces the *behavior* modal.ts used to hand-roll.
 *
 * Structural note: legacy.css styles `.modal .dialog` as a descendant
 * selector, which requires `.dialog` to be an actual DOM child of `.modal`.
 * Radix's conventional layout puts Dialog.Overlay and Dialog.Content as
 * *siblings* (both direct children of Dialog.Portal), which would break that
 * coupling. So `.modal` is applied to Dialog.Content itself (the single
 * full-viewport layer) with a plain `<div class="dialog">` nested inside it
 * as the visible panel — Dialog.Overlay is not rendered at all, it would
 * just be a redundant second backdrop.
 */
export function Modal({ open, onOpenChange, title, hideTitle, id, children }: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Content
          id={id}
          className="modal"
          // This version of @radix-ui/react-dialog sets role="dialog" on
          // Content automatically but does not add aria-modal itself — set
          // it explicitly to match what every existing modal's markup
          // declared (`role="dialog" aria-modal="true"`).
          aria-modal="true"
          // Opt out of Radix's "every Dialog.Content should have a
          // Description" dev warning — none of the ported modals have one,
          // and inventing empty descriptions would be pure noise.
          aria-describedby={undefined}
          onPointerDown={handleBackdropPointerDown(onOpenChange)}
        >
          <div className="dialog">
            <Dialog.Title className={hideTitle ? 'sr-only' : undefined}>{title}</Dialog.Title>
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Backdrop-click-to-dismiss, done by hand. Because `.modal` lives on
// Dialog.Content (see the structural note above), Content's own bounding box
// IS the whole viewport, so Radix's built-in onPointerDownOutside /
// onInteractOutside can never fire — nothing is ever "outside" a
// full-viewport element. A target-equality check reproduces modal.ts's old
// `target.classList.contains('modal')` backdrop check in three lines instead
// of a document-level click-delegation listener. Everything else (focus
// trap, Escape, scroll lock) is genuinely Radix's default behavior,
// untouched.
function handleBackdropPointerDown(onOpenChange: (open: boolean) => void) {
  return (e: PointerEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onOpenChange(false);
  };
}

/**
 * Pre-classed `Dialog.Close`, matching the `.modal-close` styling/positioning
 * already in legacy.css. Not rendered automatically by `<Modal>` — some
 * modals (e.g. the practice end-session modal, O7) need their close button
 * to run extra logic before dismissing, and some don't need one at all.
 * Place it wherever the old markup put `.modal-close` (first child of
 * `.dialog`, before the title, per auth-ui.ts). Pass `onClick` for the extra
 * logic; Radix runs it before closing, and `event.preventDefault()` inside
 * it cancels the close.
 */
export function ModalClose({
  children = '×',
  className,
  'aria-label': ariaLabel = 'Close',
  ...props
}: ComponentPropsWithoutRef<typeof Dialog.Close>) {
  return (
    <Dialog.Close
      className={className ? `modal-close ${className}` : 'modal-close'}
      aria-label={ariaLabel}
      {...props}
    >
      {children}
    </Dialog.Close>
  );
}
