interface AuthenticationDisplayProps {
  audience: string;
  authenticationOnly: boolean;
}

/** Sign-in consent appears within the existing identity and permission review. */
export function AuthenticationDisplay({ audience, authenticationOnly }: AuthenticationDisplayProps) {
  const service = new URL(audience).host;
  return (
    <section className="rounded-xl border border-border-default bg-surface-2 p-4">
      <h2 className="text-sm font-semibold text-text-primary">Sign in to {service}</h2>
      <p className="mt-1.5 break-all font-mono text-xs text-text-primary">{audience}</p>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
        Continue only if you started this sign-in. Your selected profile will confirm your identity.
      </p>
      <p className="mt-1.5 text-xs leading-relaxed text-text-secondary">
        {authenticationOnly
          ? 'Sign-in only. This request does not grant access to your records.'
          : 'Your approval also grants the record access listed below.'}
      </p>
    </section>
  );
}
