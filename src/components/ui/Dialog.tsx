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

  // Enter: opacity-0 scale-95 -> opacity-100 scale-100  (200ms ease-out)
  // Exit:  opacity-100 scale-100 -> opacity-0 scale-95   (150ms ease-in)
  const entering = open && !animating;
  const exiting = !open && animating;

  const backdropClasses = cn(
    'absolute inset-0 bg-black/60 transition-opacity',
    entering ? 'opacity-100 duration-200 ease-out' : '',
    exiting ? 'opacity-0 duration-150 ease-in' : '',
    animating && open ? 'opacity-0' : '',
  );

  const panelClasses = cn(
    'relative w-full max-w-lg rounded-xl bg-surface-2 p-6 shadow-lg transition-all',
    entering ? 'opacity-100 scale-100 duration-200 ease-out' : '',
    exiting ? 'opacity-0 scale-95 duration-150 ease-in' : '',
    animating && open ? 'opacity-0 scale-95' : '',
    className,
  );

  const portalTarget = document.getElementById('root') ?? document.body;

  return createPortal(
    <div
      ref={dialogRef}
      className="fixed inset-0 z-[var(--z-modal)] flex items-start justify-center overflow-y-auto p-4 pt-[15vh] sm:items-center sm:pt-4"
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
        {title && (
          <h2
            id={titleId}
            className="mb-4 text-lg font-semibold text-text-primary"
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
