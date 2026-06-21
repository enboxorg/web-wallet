<p align="center">
  <strong>en</strong><span style="color: #ff6b8a">b</span><strong>ox</strong>
</p>

<h1 align="center">Enbox Web Wallet</h1>

<p align="center">
  A decentralised identity wallet for managing DIDs, profiles, protocols, and permissions on the Enbox network.
</p>

<p align="center">
  <a href="https://github.com/enboxorg/web-wallet/actions/workflows/ci.yml"><img src="https://github.com/enboxorg/web-wallet/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI"></a>
  <a href="https://enbox-wallet.pages.dev"><img src="https://img.shields.io/badge/demo-live-brightgreen" alt="Live Demo"></a>
  <a href="https://github.com/enboxorg/web-wallet/blob/main/LICENSE"><img src="https://img.shields.io/github/license/enboxorg/web-wallet" alt="License"></a>
  <img src="https://img.shields.io/badge/tests-509-blue" alt="Tests">
  <img src="https://img.shields.io/badge/coverage-26%25-yellow" alt="Coverage">
</p>

<p align="center">
  <a href="https://enbox-wallet.pages.dev">Live Demo</a> &bull;
  <a href="https://blue-enbox-wallet.pages.dev">Blue Variant</a> &bull;
  <a href="#getting-started">Getting Started</a> &bull;
  <a href="#testing">Testing</a> &bull;
  <a href="#architecture">Architecture</a>
</p>

---

> [!WARNING]
> **This software is experimental and under active development.** It has not been independently audited for security. The cryptographic primitives and key management are provided by the underlying `@enbox/*` SDK, which is also pre-release. **Do not use this wallet to manage sensitive or high-value credentials in production.** APIs, storage formats, and recovery mechanisms may change without notice between versions.

---

## Features

- **Identity Management** -- Create, edit, delete, import, and export decentralised identities (DID:DHT) with auto-generated avatars, banners, and friendly names
- **Profile** -- Display name, tagline, bio, avatar, and hero images stored on your personal DWN
- **App Connect** -- Scan QR codes to connect with Enbox-compatible applications
- **Permission Control** -- View and revoke permission grants from connected apps
- **DID Search** -- Look up any DID to view its public profile, with recent search history
- **Seed Phrase Recovery** -- Restore wallet vault from BIP-39 recovery phrase
- **Identity Export/Import** -- Portable JSON backup and restore of full identity data with export timestamps
- **Responsive** -- Desktop sidebar + native-feeling mobile bottom tab bar with safe area support
- **Themes** -- Dark and light modes with build-time product theme variants
- **PWA** -- Installable with offline service worker support
- **Security** -- PIN-locked vault, configurable auto-lock (5m / 10m / 30m / 1h / never), session persistence across tab refresh

## Tech Stack

| Layer | Technology |
|-------|-----------|
| UI | [Tailwind CSS v4](https://tailwindcss.com/) + [@enbox/ui](https://github.com/enboxorg/design) design tokens |
| Framework | [React 18](https://react.dev/) + [TypeScript 5](https://www.typescriptlang.org/) |
| Effects | [Effect 3](https://effect.website/) for Enbox/DWN side effects, typed failures, and service layers |
| Client State | [Zustand 5](https://zustand.docs.pmnd.rs/) |
| Server State | [TanStack Query v5](https://tanstack.com/query) |
| Routing | [React Router v7](https://reactrouter.com/) |
| Build | [Vite 6](https://vite.dev/) |
| Unit Testing | [Vitest](https://vitest.dev/) + [Testing Library](https://testing-library.com/) |
| E2E Testing | [Playwright](https://playwright.dev/) + [axe-core](https://www.deque.com/axe/) |
| CI/CD | [GitHub Actions](https://github.com/features/actions) + [Codecov](https://codecov.io/) |
| Deployment | [Cloudflare Pages](https://pages.cloudflare.com/) |
| SDK | `@enbox/agent` `@enbox/api` `@enbox/auth` `@enbox/protocols` |

## Getting Started

```bash
# Prerequisites: Bun (https://bun.sh)

# Install dependencies
bun install

# Start dev server (http://localhost:5173)
bun run dev

# Run unit tests
bun run test

# Run unit tests with coverage
bun run test:coverage

# Run E2E tests (requires Chromium)
npx playwright install chromium
bun run test:e2e

# Lint + type check
bun run lint
npx tsc --noEmit

# Production build
bun run build
```

## Testing

The wallet uses a comprehensive testing pyramid:

```
         /\
        /  \      E2E — Playwright + real Chromium
       / 26 \     Real browser, real CSS, accessibility audits
      /------\
     /        \
    /   509    \  Unit/Integration — Vitest + Testing Library
   /            \ Components, hooks, stores, user flows
  /______________\
```

### Unit & Integration Tests (509 tests; 499 passing, 10 skipped)

Run with [Vitest](https://vitest.dev/) + [happy-dom](https://github.com/nicedayfor/happy-dom) + [Testing Library](https://testing-library.com/):

- **Pure logic**: identity generators, protocol names, constants, query keys
- **UI components**: Button, Dialog, Tabs, PinInput, Avatar, Card, etc.
- **User flows**: identity list filtering, tab navigation, backup confirmation
- **Stores**: auth, UI, backup seed, drag-drop state transitions
- **Best practices enforced** via [eslint-plugin-testing-library](https://github.com/testing-library/eslint-plugin-testing-library)

```bash
bun run test              # Run once
bun run test:watch        # Watch mode
bun run test:coverage     # With v8 coverage report
```

### E2E Tests (26 tests)

Run with [Playwright](https://playwright.dev/) in real Chromium at desktop and mobile viewports:

- **Setup flow**: PIN creation, confirmation, mismatch rejection, keyboard capture
- **Accessibility**: [axe-core](https://www.deque.com/axe/) WCAG 2.0/2.1 AA audits at both viewports
- **Responsive**: Desktop (1280px) and mobile (375px) smoke tests
- **Screenshots**: Captured automatically on failure

```bash
npx playwright install chromium   # First time only
bun run test:e2e                  # Run all
npx playwright test --ui          # Interactive mode
```

### Coverage

Coverage is enforced in CI via thresholds and reported as PR comments via [vitest-coverage-report-action](https://github.com/davelosert/vitest-coverage-report-action):

| Metric | Threshold | Current |
|--------|-----------|---------|
| Statements | 25% | ~26% |
| Branches | 29% | ~31% |
| Functions | 30% | ~32% |
| Lines | 25% | ~27% |

## Project Structure

```
src/
  app.css                   # Tailwind v4 + @enbox/ui design tokens (dark + light)
  App.tsx                   # Auth gate + routing + provider hierarchy
  main.tsx                  # Entry point + PWA service worker
  routes.tsx                # Lazy-loaded route definitions
  test-utils.tsx            # Test rendering helpers (renderWithProviders)

  components/
    ui/                     # Shared primitives (Button, Dialog, Tabs, Card, etc.)
    identity/               # Identity card, avatar, public card
    layout/                 # AppShell, Sidebar, BottomNav, AppBar, OfflineBanner

  features/
    auth/                   # Unlock, setup, restore, onboarding identity step
    identities/             # List, create, edit, import, details + 5 tabs
    connect/                # App Connect (QR scanner), DWeb Connect (popup)
    search/                 # DID lookup with search history
    settings/               # Security, backup, settings hub

  enbox/                    # SDK integration (designed for Effect helper extraction)
    effect/                 # Shared Effect runtime, typed errors, services, and layers
    auth-effects.ts         # AuthManager creation/session Effect programs
    provider.tsx            # EnboxAuthProvider (AuthManager lifecycle + sync)
    hooks/                  # useAuth, useIdentities, useProfile, usePermissions
    queries/                # TanStack Query functions + key factories
    mutations/              # Identity CRUD mutations
    protocols.ts            # Protocol installation (dependency-ordered)
    registration.ts         # DWN tenant registration

  stores/                   # Zustand (auth, UI, backup seed, drag-drop)
  lib/                      # Utilities, browser Effect adapters, passkeys
  __mocks__/                # Test mock factories (identities, profiles, agents)
  e2e/                      # Playwright E2E + accessibility specs
```

## Architecture

### Effect Integration

This fork keeps React, TanStack Query, and Zustand at the UI boundary, but moves Enbox SDK and DWN side effects into Effect programs. Public async functions remain available for existing hooks, while `*Effect` variants provide a future extraction path for an Enbox/Effect helper package.

Current Effect boundaries:

- `src/enbox/effect/errors.ts` defines typed failures for SDK, storage, DWN registration, protocol installation, and identity validation.
- `src/enbox/effect/services.ts` defines `CurrentAgent` and `RegistrationTokenStore` services plus browser and memory-backed layers.
- `src/enbox/auth-effects.ts` wraps AuthManager create/connect/unlock/restore/lock flows.
- `src/enbox/registration.ts`, `protocols.ts`, `identity-sync.ts`, `queries/identity-queries.ts`, and `mutations/identity-mutations.ts` expose composable Effect programs with Promise adapters for React Query.
- `src/features/connect/connect-effects.ts`, `protocol-install.ts`, and `src/features/search/public-profile.ts` keep feature-level Enbox/DWN side effects behind Effect adapters.
- `src/lib/passkeys.ts` wraps WebAuthn, PRF, WebCrypto, IndexedDB, and passkey credential persistence behind Effect programs while preserving the existing public async API.
- `src/lib/browser-effects.ts` centralizes browser storage, clipboard/share, endpoint health, random UUID, and service worker registration effects used by stores, settings, search history, provider session cache, and bootstrap code.

The intended pattern is:

```ts
import { Effect } from 'effect'

const program = createIdentityEffect(params)
const result = await runEnboxPromise(
  program.pipe(Effect.provide(enboxLiveLayer(agent))),
)
```

Tests can swap the browser layer for `memoryRegistrationTokenStoreLayer` or direct service layers, which keeps DWN registration and token-refresh behavior deterministic.

### State Management

| Type | Tool | Examples |
|------|------|---------|
| Client state | Zustand | Auth status, UI preferences, sidebar state |
| Server/DWN state | TanStack Query over Effect adapters | Identities, profiles, protocols, permissions |
| URL state | React Router v7 | Current page, identity DID params |

### SDK Integration Layer

The `src/enbox/` directory is designed for future extraction into an Enbox/Effect helper library. It has zero imports from UI components or feature pages. All Enbox SDK interactions go through this layer:

```
App.tsx
  └─ EnboxAuthProvider         ← manages AuthManager lifecycle
       └─ useAuth()            ← connect / unlock / restore / lock
       └─ useIdentities()      ← TanStack Query → agent.identity.list()
       └─ useProfile(did)      ← TanStack Query → ProfileProtocol
       └─ usePermissions(did)  ← TanStack Query → DwnApi.permissions
```

### Sync Management

The wallet lets the SDK manage sync automatically. Manual sync intervention only happens during seed phrase restore (controlled two-pull pattern to recover identity metadata then profile data).

## Theme Variants

Build-time product themes via `VITE_PRODUCT_THEME`:

| Variant | Accent | Demo |
|---------|--------|------|
| Default | Rose / Pink | [enbox-wallet.pages.dev](https://enbox-wallet.pages.dev) |
| Blue | Blue | [blue-enbox-wallet.pages.dev](https://blue-enbox-wallet.pages.dev) |

```bash
VITE_PRODUCT_THEME=blue bun run build
```

## CI/CD

Every push triggers:

1. **Lint** -- ESLint + testing-library plugin
2. **Typecheck** -- `tsc --noEmit`
3. **Unit tests** -- Vitest with v8 coverage (PR comments with per-file breakdown)
4. **E2E tests** -- Playwright in real Chromium (with failure screenshots)
5. **Build** -- Vite production build
6. **Deploy** -- Cloudflare Pages (main branch only, both theme variants)

### Required Secrets

| Secret | Description |
|--------|------------|
| `CLOUDFLARE_API_TOKEN` | Cloudflare API token with Pages:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run tests (`bun run test && bun run test:e2e`)
4. Commit your changes (`git commit -m 'feat: add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

All PRs must pass CI (lint + typecheck + unit tests + E2E tests + build).

## License

See [LICENSE](LICENSE).
