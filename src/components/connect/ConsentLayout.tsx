/**
 * Shared building blocks for the two consent ceremonies (DWeb popup and
 * relay / QR). Presentational only: the pages own request state and policy.
 *
 * Reading order follows the decision a person makes:
 *   who is asking → as which profile → what access → for how long → decide.
 */
import { useEffect, useId, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronsUpDown,
  Info,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Monogram } from '@/components/ui/Monogram';
import { SiteIcon } from '@/components/ui/SiteIcon';
import { PinInput } from '@/components/ui/PinInput';
import { PIN_LENGTH } from '@/lib/constants';
import { cn, truncateDid } from '@/lib/utils';

// ── Brand ────────────────────────────────────────────────────────────

/**
 * Compact wallet identity for ceremony screens: people should always know
 * which wallet is asking them to decide, without the brand eating the fold.
 */
export function ConsentBrandBar({ className }: { className?: string }) {
  return (
    <div className={cn('flex select-none items-center justify-center gap-2.5', className)}>
      <span className="text-lg font-semibold tracking-tight">
        <span className="text-text-primary">en</span>
        <span className="font-bold text-accent">b</span>
        <span className="text-text-primary">ox</span>
      </span>
      <span className="h-3.5 w-px bg-border-strong" aria-hidden="true" />
      <span className="text-xs font-medium text-text-tertiary">Identity Wallet</span>
    </div>
  );
}

// ── Requester ────────────────────────────────────────────────────────

interface ConsentRequesterProps {
  /** The app's name as it reports it, or its address when it gives none. */
  title: string;
  /** Full value for the tooltip, e.g. the complete origin. */
  titleHint?: string;
  /**
   * The verified website address (host). Shown on its own line with a shield
   * so the address, not the self-reported name, is what earns trust.
   */
  identifier?: string;
  /** Verified origin to load the site's own icon from. Never a reported one. */
  iconOrigin?: string;
  /** Stable seed for the fallback tile tint (origin or client DID). */
  seed: string;
  trust: 'verified-origin' | 'reported';
  trustLabel: string;
  /** Supplementary self-reported facts, rendered quietly under the trust line. */
  details?: React.ReactNode;
  /** One-line purpose, e.g. "wants to connect to your profile". */
  summary: string;
  /** Quiet context after the purpose, e.g. that this is a first connection. */
  footnote?: React.ReactNode;
}

/**
 * Who is asking. The name leads because people recognise apps by name; the
 * verified address sits right under it with a shield and no "verified" word,
 * so a borrowed name never reads as vouched for.
 */
export function ConsentRequester({
  title,
  titleHint,
  identifier,
  iconOrigin,
  seed,
  trust,
  trustLabel,
  details,
  summary,
  footnote,
}: ConsentRequesterProps) {
  const verified = trust === 'verified-origin';

  return (
    <header className="flex flex-col items-center text-center">
      <SiteIcon origin={verified ? iconOrigin : undefined} label={title} seed={seed} />
      {/* One line: a self-reported name gets no room to stage a second
          line that looks like wallet copy. The full name is in the tooltip. */}
      <h1
        className="mt-4 max-w-full truncate text-xl font-semibold tracking-tight text-text-primary"
        title={titleHint ?? title}
      >
        {title}
      </h1>
      <p
        className={cn(
          'mt-1.5 inline-flex max-w-full items-center gap-1.5 text-sm',
          // The verified address is what earns trust, so it reads at full contrast.
          verified ? 'font-medium text-text-primary' : 'font-medium text-warning',
        )}
        title={verified ? 'Your wallet confirmed this request comes from this website.' : undefined}
      >
        {verified
          ? <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
          : <ShieldAlert className="size-4 shrink-0" aria-hidden="true" />}
        <span className="min-w-0 break-all">{verified ? identifier ?? trustLabel : trustLabel}</span>
        {verified && <span className="sr-only">({trustLabel})</span>}
      </p>
      {details && (
        <div className="mt-1.5 max-w-full space-y-0.5 text-xs text-text-tertiary">{details}</div>
      )}
      <p className="mt-4 text-sm text-text-secondary">{summary}</p>
      {footnote && <div className="mt-1 text-xs text-text-tertiary">{footnote}</div>}
    </header>
  );
}

// ── Profile picker ───────────────────────────────────────────────────

interface ProfileOption {
  value: string;
  label: string;
}

interface ConsentProfilePickerProps {
  id: string;
  options: ProfileOption[];
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  heading?: string;
}

/**
 * The chosen profile as a readable row, with the native select layered on
 * top so the platform picker (and its accessibility) still does the work.
 */
export function ConsentProfilePicker({
  id,
  options,
  value,
  onChange,
  disabled,
  heading = 'Approve as',
}: ConsentProfilePickerProps) {
  const headingId = useId();
  const selected = options.find((option) => option.value === value) ?? options[0];
  const canChange = !disabled && options.length > 1;

  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h2 id={headingId} className="text-[13px] font-medium text-text-secondary">{heading}</h2>
      <div
        className={cn(
          'relative flex items-center gap-3 rounded-xl border border-border-default bg-surface-1 px-3 py-2.5',
          'transition-colors focus-within:border-accent focus-within:ring-4 focus-within:ring-accent/15',
          canChange && 'hover:border-border-strong',
        )}
      >
        <Monogram label={selected?.label ?? '?'} seed={selected?.value ?? ''} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-text-primary">{selected?.label}</p>
          {selected && (
            <p className="truncate font-mono text-[11px] text-text-ghost" title={selected.value}>
              {truncateDid(selected.value)}
            </p>
          )}
        </div>
        {canChange && (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-text-tertiary" aria-hidden="true">
            Switch
            <ChevronsUpDown className="size-3.5" />
          </span>
        )}
        <select
          id={id}
          aria-label="Approve as profile"
          className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 disabled:cursor-default"
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
    </section>
  );
}

// ── Notices ──────────────────────────────────────────────────────────

type NoticeTone = 'info' | 'warning' | 'error';

const NOTICE_TONES: Record<NoticeTone, { box: string; icon: string; Icon: typeof Info }> = {
  info    : { box: 'border-border-default bg-surface-1', icon: 'text-text-tertiary', Icon: Info },
  warning : { box: 'border-warning/30 bg-warning/[0.06]', icon: 'text-warning', Icon: AlertTriangle },
  error   : { box: 'border-error/30 bg-error/[0.06]', icon: 'text-error', Icon: AlertTriangle },
};

export function ConsentNotice({
  tone = 'info',
  title,
  icon,
  role,
  className,
  children,
}: {
  tone?: NoticeTone;
  title?: React.ReactNode;
  icon?: React.ReactNode;
  role?: 'alert' | 'status';
  className?: string;
  children?: React.ReactNode;
}) {
  const style = NOTICE_TONES[tone];
  return (
    <section
      role={role}
      className={cn('flex items-start gap-3 rounded-xl border px-4 py-3', style.box, className)}
    >
      <span className={cn('mt-0.5 shrink-0 [&>svg]:size-4', style.icon)}>
        {icon ?? <style.Icon />}
      </span>
      <div className="min-w-0 flex-1 text-xs leading-relaxed text-text-secondary">
        {title && <p className="text-sm font-medium text-text-primary">{title}</p>}
        {children && <div className={cn(title && 'mt-1')}>{children}</div>}
      </div>
    </section>
  );
}

// ── Inline onboarding ────────────────────────────────────────────────

export function ConsentOnboardingIntro({ children }: { children: React.ReactNode }) {
  return (
    <ConsentNotice
      icon={<Sparkles className="text-accent" />}
      title="No wallet here yet — we'll make one"
    >
      {children}
    </ConsentNotice>
  );
}

export function ConsentPinSetup({
  step,
  error,
  busy,
  onComplete,
  onBack,
}: {
  step: 'pin-create' | 'pin-confirm';
  error: string | null;
  busy: boolean;
  onComplete: (pin: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border border-border-default bg-surface-1 p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-4 text-accent" />
        <p className="text-sm font-semibold text-text-primary">
          {step === 'pin-create' ? 'Create a PIN for your new wallet' : 'Confirm your PIN'}
        </p>
      </div>
      <PinInput
        key={step}
        length={PIN_LENGTH}
        onComplete={onComplete}
        error={step === 'pin-confirm' && !!error}
        disabled={busy}
        autoFocus
      />
      {error && <p className="text-sm text-error" role="alert">{error}</p>}
      <Button variant="ghost" size="sm" disabled={busy} onClick={onBack}>
        Back
      </Button>
    </div>
  );
}

// ── Outcomes ─────────────────────────────────────────────────────────

/** Terminal / transitional states: done, failed, not applicable. */
export function ConsentOutcome({
  tone = 'neutral',
  icon,
  title,
  message,
  action,
  className,
}: {
  tone?: 'neutral' | 'success' | 'error';
  icon: React.ReactNode;
  title: React.ReactNode;
  message?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-1 flex-col items-center justify-center gap-2 px-2 py-10 text-center', className)}>
      <span
        className={cn(
          'mb-2 flex size-16 items-center justify-center rounded-full [&>svg]:size-7',
          tone === 'success' && 'bg-success/10 text-success ring-1 ring-inset ring-success/20',
          tone === 'error' && 'bg-error/10 text-error ring-1 ring-inset ring-error/20',
          tone === 'neutral' && 'bg-surface-2 text-text-tertiary ring-1 ring-inset ring-border-subtle',
        )}
      >
        {icon}
      </span>
      <p className="text-base font-semibold text-text-primary">{title}</p>
      {message && <div className="max-w-xs text-sm leading-relaxed text-text-secondary">{message}</div>}
      {action && <div className="mt-4 w-full max-w-xs">{action}</div>}
    </div>
  );
}

// ── Decision ─────────────────────────────────────────────────────────

/** The element that scrolls this page: a scrolling ancestor, else the document. */
function scrollParentOf(element: HTMLElement): HTMLElement {
  for (let node = element.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

/**
 * Deny + primary decision, at the end of the request so people scroll past
 * everything they're agreeing to before they can decide. Until the buttons
 * are in view, a cue at the bottom edge says there is more below.
 */
export function ConsentDecisionBar({
  onDeny,
  denyDisabled,
  primary,
  hint,
  className,
}: {
  onDeny: () => void;
  denyDisabled?: boolean;
  primary: React.ReactNode;
  hint?: React.ReactNode;
  className?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [belowFold, setBelowFold] = useState(false);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      ([entry]) => setBelowFold(!entry.isIntersecting),
      { threshold: 0.5 },
    );
    observer.observe(bar);
    return () => observer.disconnect();
  }, []);

  function scrollOn() {
    const bar = barRef.current;
    if (!bar) return;
    const scroller = scrollParentOf(bar);
    const isDocument = scroller === document.scrollingElement || scroller === document.documentElement;
    const behavior: ScrollBehavior = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    // A page at a time: it moves people along without skipping the content.
    const top = (isDocument ? window.innerHeight : scroller.clientHeight) * 0.75;
    if (isDocument) window.scrollBy({ top, behavior });
    else scroller.scrollBy({ top, behavior });
  }

  return (
    <>
      {/* Zero-height sticky anchor: the cue rides the bottom edge of the
          scroll area until the decision itself scrolls into view. */}
      <div className="pointer-events-none sticky bottom-0 z-20 h-0">
        {belowFold && (
          <div className="absolute inset-x-0 bottom-0 flex justify-center bg-gradient-to-t from-surface-0 via-surface-0/85 to-transparent pt-14 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] animate-[fadeIn_0.2s_ease-out]">
            <button
              type="button"
              onClick={scrollOn}
              className="pointer-events-auto inline-flex items-center gap-1.5 rounded-full border border-border-default bg-surface-1 px-4 py-2 text-xs font-medium text-text-secondary shadow-lg shadow-black/20 transition-colors hover:border-border-strong hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              Scroll to review
              <ChevronDown className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <div
        ref={barRef}
        data-testid="connect-action-area"
        className={cn('pt-2 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]', className)}
      >
        <div className="mx-auto flex w-full max-w-lg gap-3">
          <Button variant="secondary" className="min-w-0 flex-1" onClick={onDeny} disabled={denyDisabled}>
            <X className="size-4 max-[359px]:hidden" />
            Deny
          </Button>
          {primary}
        </div>
        {hint && (
          <p className="mx-auto mt-2.5 max-w-xs text-center text-xs leading-relaxed text-text-tertiary">{hint}</p>
        )}
      </div>
    </>
  );
}
