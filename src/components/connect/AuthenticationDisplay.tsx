import { KeyRound } from 'lucide-react';

interface AuthenticationDisplayProps {
  audience: string;
  authenticationOnly: boolean;
}

/** Sign-in consent appears within the existing identity and permission review. */
export function AuthenticationDisplay({ audience, authenticationOnly }: AuthenticationDisplayProps) {
  const service = new URL(audience).host;
  return (
    <section className="rounded-xl border border-border-default bg-surface-1 p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent ring-1 ring-inset ring-accent/20">
          <KeyRound className="size-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text-primary">Sign in to {service}</h2>
          <p className="mt-0.5 break-all font-mono text-[11px] text-text-tertiary">{audience}</p>
          <p className="mt-2.5 text-xs leading-relaxed text-text-secondary">
            Continue only if you started this sign-in. Your selected profile will confirm your identity.
          </p>
          <p className="mt-1 text-xs leading-relaxed text-text-tertiary">
            {authenticationOnly
              ? 'Sign-in only. This request does not grant access to your records.'
              : 'Your approval also grants the record access listed below.'}
          </p>
        </div>
      </div>
    </section>
  );
}
