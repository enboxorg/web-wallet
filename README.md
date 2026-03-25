# Enbox Web Wallet

A decentralised identity wallet for managing DIDs, profiles, protocols, and permissions on the Enbox network.

**Live:** [enbox-wallet.pages.dev](https://enbox-wallet.pages.dev)

## Features

- **Identity management** -- create, edit, delete, import, and export decentralised identities (DID:DHT)
- **Profile** -- display name, tagline, bio, avatar, and hero images with auto-generation from DID
- **Protocol management** -- view installed protocols per identity
- **Permission grants** -- view and revoke permission grants from connected apps
- **DID search** -- look up any DID to view its public profile
- **App Connect** -- scan QR codes to connect with Enbox-compatible applications
- **DWeb Connect** -- handle connection requests from decentralised web apps (popup flow)
- **Seed phrase recovery** -- restore wallet vault from BIP-39 recovery phrase
- **Identity export/import** -- portable JSON backup and restore of full identity data
- **Light and dark themes** -- follows system preference, manually toggleable
- **Responsive** -- desktop sidebar + mobile bottom tab bar
- **PWA** -- installable with offline service worker support
- **Session persistence** -- PIN cached in sessionStorage (survives refresh, clears on tab close)
- **Auto-lock** -- configurable inactivity timeout (5m / 10m / 30m / 1h / never)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | [Tailwind CSS v4](https://tailwindcss.com/) + `@enbox/ui` design tokens |
| Framework | [React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) |
| Client state | [Zustand](https://zustand.docs.pmnd.rs/) |
| Async state | [TanStack Query v5](https://tanstack.com/query) |
| Routing | [React Router v7](https://reactrouter.com/) |
| Build | [Vite 6](https://vite.dev/) |
| Testing | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) (388 tests) |
| Deployment | [Cloudflare Pages](https://pages.cloudflare.com/) |
| SDK | `@enbox/agent`, `@enbox/api`, `@enbox/auth`, `@enbox/protocols` |

## Getting Started

```bash
# Install dependencies
bun install

# Start dev server
bun run dev

# Run tests
bun run test

# Run tests with coverage
bun run test:coverage

# Lint
bun run lint

# Type check
bun run build
```

## Project Structure

```
src/
  app.css                   # Tailwind v4 config + @enbox/ui design tokens
  App.tsx                   # Root: providers + auth gate + routing
  main.tsx                  # Entry point + service worker registration
  routes.tsx                # Route definitions (lazy-loaded)
  nav-items.tsx             # Sidebar + bottom tab nav configuration

  components/
    ui/                     # Shared UI primitives (Button, Dialog, Tabs, etc.)
    identity/               # Identity card components
    layout/                 # AppShell, Sidebar, BottomNav, AppBar

  features/
    auth/                   # Unlock, setup, restore, onboarding identity step
    identities/             # List, create, edit, import, details + tabs
    connect/                # App Connect (QR), DWeb Connect (popup)
    search/                 # DID lookup
    settings/               # Security, backup, settings hub

  enbox/                    # SDK integration layer (designed for @enbox/react extraction)
    provider.tsx            # EnboxAuthProvider (AuthManager lifecycle)
    hooks/                  # useAuth, useIdentities, useProfile, usePermissions, etc.
    queries/                # TanStack Query functions + key factories
    mutations/              # Identity CRUD mutation functions
    protocols.ts            # Protocol installation helper
    registration.ts         # DWN tenant registration

  stores/                   # Zustand stores (auth, UI, backup seed, etc.)
  lib/                      # Pure utilities (utils, constants, generators, etc.)
```

## CI/CD

CI runs on every push to `main` and on pull requests:

1. **Lint** -- ESLint with TypeScript + React hooks rules
2. **Typecheck** -- `tsc --noEmit`
3. **Test with coverage** -- Vitest + v8 coverage with enforced thresholds
4. **Build** -- Vite production build
5. **Deploy** -- Cloudflare Pages (matrix: default + blue theme variant)

### Required Secrets

| Secret | Description |
|--------|------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages:Edit + Account Settings:Read |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

## Theme Variants

The wallet supports build-time theme variants via the `VITE_PRODUCT_THEME` environment variable:

| Variant | Accent | URL |
|---------|--------|-----|
| Default (authd) | Rose/pink | [enbox-wallet.pages.dev](https://enbox-wallet.pages.dev) |
| Blue | Blue | [blue-enbox-wallet.pages.dev](https://blue-enbox-wallet.pages.dev) |

```bash
# Build blue variant
VITE_PRODUCT_THEME=blue bun run build
```

## Architecture Notes

The `src/enbox/` directory is designed so it can later be extracted into a shared `@enbox/react` library. It has zero imports from `src/components/`, `src/features/`, or `src/stores/` (except `auth-store` for the auth gate). All SDK interactions go through this layer.

The wallet lets the SDK manage sync (no `sync: 'off'`). The only manual sync intervention is during seed phrase restore, where a controlled two-pull pattern recovers identity metadata and profile data.

## License

See [LICENSE](LICENSE).
