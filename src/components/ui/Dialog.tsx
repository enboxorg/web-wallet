import { useEffect, useRef, useState, useId } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const [visible, setVisible] = useState(false);
  const [animating, setAnimating] = useState(false);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  // Visibility & animation state machine
  useEffect(() => {
    if (open) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      setVisible(true);
      setAnimating(true);
      requestAnimationFrame(() => setAnimating(false));
    } else if (visible) {
      setAnimating(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setAnimating(false);
        previousFocusRef.current?.focus();
      }, 200); // match CSS exit duration
      return () => clearTimeout(timer);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lock body scroll while visible
  useEffect(() => {
    if (!visible) return;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [visible]);

  // Focus first focusable element on open
  useEffect(() => {
    if (open && visible && !animating) {
      const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      first?.focus();
    }
  }, [open, visible, animating]);

  // Focus trap + Escape key
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
    if (!focusable?.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!visible) return null;

  // Phones get a bottom sheet (thumb-reachable actions); larger screens a
  // centred modal.
  // Enter: sheet slides up / modal scales in (200ms ease-out)
  // Exit:  reverse (150ms ease-in)
  const entering = open && !animating;
  const exiting = !open && animating;

  const backdropClasses = cn(
    'absolute inset-0 bg-scrim backdrop-blur-md transition-opacity',
    entering ? 'opacity-100 duration-200 ease-out' : '',
    exiting ? 'opacity-0 duration-150 ease-in' : '',
    animating && open ? 'opacity-0' : '',
  );

  const panelClasses = cn(
    'surface-card relative w-full max-w-lg border border-border-default bg-surface-1 shadow-pop transition-all',
    'rounded-t-3xl px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom,0px))]',
    'sm:rounded-3xl sm:p-7',
    entering ? 'opacity-100 translate-y-0 sm:scale-100 duration-200 ease-out' : '',
    exiting ? 'opacity-0 translate-y-6 sm:translate-y-0 sm:scale-95 duration-150 ease-in' : '',
    animating && open ? 'opacity-0 translate-y-6 sm:translate-y-0 sm:scale-95' : '',
    className,
  );

  const portalTarget = document.getElementById('root') ?? document.body;

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center overflow-y-auto sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
      aria-label={title ? undefined : 'Dialog'}
      onKeyDown={handleKeyDown}
    >
      {/* Backdrop */}
      <div
        className={backdropClasses}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div className={panelClasses}>
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border-strong sm:hidden" aria-hidden="true" />
        {title && (
          <h2
            id={titleId}
            className="mb-3 text-xl font-semibold tracking-tight text-text-primary"
          >
            {title}
          </h2>
        )}
        {children}
      </div>
    </div>,
    portalTarget,
  );
}
