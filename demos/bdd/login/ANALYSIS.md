# BDD Pipeline Analysis — Username and Password Login

- **Status:** PASS
- **Source feature:** `demos/bdd/login/1001_username_password.feature`
- **Contract:** `demos/bdd/login/1001_username_password.feature.contract.json`
- **Output directory:** `demos/bdd/login/`
- **Started:** 2026-07-08T11:32:05.835Z
- **Finished:** 2026-07-08T11:43:30.000Z

## Overview

- **Feature name:** Username and Password Login
- **Description:**   As an existing customer
  I want to log in using my username and password
  So that I can access my account securely from any device
- **Scenarios:** 14
- **Tags:** `@REQ-1001`, `@REQ-3718`, `@authentication`, `@login`
- **Pipeline status:** PASS

## Contract Annotations

### API

| Method | Path | Request | Response | Description |
| --- | --- | --- | --- | --- |
| POST | `/api/v1/auth/login` | LoginRequest | LoginResponse | Authenticate a user with username and password. On success returns a session token, clears the failed-attempt counter, and the client navigates to the home screen. On failure the failed-attempt counter is incremented; after the 3rd consecutive failure the account is locked for 30 minutes (423), and after 3 consecutive lockout cycles the account is suspended (403). |
| POST | `/api/v1/auth/attempts/clear` | ClearAttemptsRequest | ClearAttemptsResponse | Clear the failed-attempt counter for a username. Invoked automatically by the backend on a successful POST /api/v1/auth/login (see happy-path scenario 'the failed attempt counter for my username is cleared'). Exposed as a separate endpoint so that administrative unlock flows can also reset the counter. |

**Responses:**

- `200` (json) — Login succeeded. Body contains the session token, user id, and expiry. Client clears local form state and navigates to the home screen.
- `400` (json) — Validation error (e.g. empty username or password). Client displays the inline 'Please enter both username and password.' message and keeps the user on the login screen.
- `401` (json) — Invalid credentials. Client displays 'Invalid username or password. Please try again.' and MUST NOT disclose remaining attempts or the account's lockout state to the user.
- `423` (json) — Account is locked (server-side 30-minute lockout triggered by 3 consecutive failed attempts). Client displays the locked message and prompts the user to contact customer support.
- `403` (json) — Account is suspended (3 consecutive lockout cycles). Client displays the suspension message and directs the user to the Contact Centre for manual re-enablement.
- `500` (json) — Server / network error during authentication. Client shows a generic error message and allows the user to retry by tapping 'Sign in' again.

### UI

| Route | Path |
| --- | --- |
| login | `/login` |
| home | `/home` |
| biometric-login | `/login/biometric` |

**Test IDs:**

- `username-input` — username-input
- `password-input` — password-input
- `sign-in-button` — sign-in-button
- `biometric-shortcut-button` — biometric-shortcut-button
- `login-success-message` — login-success-message
- `login-error-message` — login-error-message
- `quick-login-expired-banner` — quick-login-expired-banner
- `loading-indicator` — loading-indicator

**Strings:**

- **auth.sign-in:** Sign in
- **auth.signing-in:** Signing in...
- **auth.login-success:** Login successful!
- **auth.empty-fields-error:** Please enter both username and password.
- **auth.invalid-credentials-error:** Invalid username or password. Please try again.
- **auth.account-locked-error:** Your account has been locked due to multiple failed login attempts. Please contact customer support to unlock your account.
- **auth.quick-login-expired:** Quick Login Expired. For your security, please sign in again with your email and password.

### State

| Variable | Type | Default |
| --- | --- | --- |
| username | string | "" |
| password | string | "" |
| isLoading | boolean | false |
| error | string | — |
| attemptCount | number | 0 |
| isLocked | boolean | false |
| isSuspended | boolean | false |
| quickLoginExpired | boolean | false |

**Transitions:**

- `idle` → `submitting` (trigger: tap 'Sign in' with both username and password non-empty)
- `submitting` → `authenticated` (trigger: POST /api/v1/auth/login returns 200)
- `submitting` → `idle` (trigger: POST /api/v1/auth/login returns 4xx/5xx or network error)
- `idle` → `locked` (trigger: POST /api/v1/auth/login returns 423 (3rd consecutive failure))
- `locked` → `suspended` (trigger: POST /api/v1/auth/login after 3 consecutive lockout cycles (403))
- `authenticated` → `idle` (trigger: server-side session timeout while still on the login screen)

### Assumptions (from contract)

- The login endpoint is POST /api/v1/auth/login with JSON body { username, password }. The feature does not specify the path or method, so this is an inferred RESTful convention.
- The 'app home screen' lives at the /home route. The feature never names the route.
- The biometric login shortcut is a separate route (/login/biometric), inferred from the parallel feature file 1594_biometric_login.feature and the step text 'the biometric flow is initiated'.
- The 'failed attempt counter' is a server-side per-username counter, cleared automatically on a successful login. The 30-minute lockout is a server-side state with a TTL.
- Account suspension after 3 consecutive lockout cycles is a server-side state change. The client simply displays the suspension message and Contact Centre guidance.
- The inline 'Login successful!' message is a transient toast/notification, not a full-screen page (per the 'No full-screen success page shown' scenario).
- The 'Signing in...' loading state is reflected on the button itself (label change + disabled state) — not a separate spinner overlay.
- The amber 'Quick Login Expired' banner is a UI overlay above the form, conditionally rendered when the quickLoginExpired flag is true on screen entry.
- Password masking is achieved with a type='password' input. The feature explicitly forbids a show/hide toggle, so the generated component must not render one.
- The 'approximately 1 second' navigation timing is informational, not a hard SLA — the generated tests should not assert an exact timeout but rather wait for the home screen to appear.
- Rapid-tap deduplication is achieved by disabling the Sign in button during the success transition (not by debouncing the navigation route itself).
- Session expiry while on the login screen does not lose any user-entered data because the login form state is local component state, not part of the server session.

## Frontend Mapping

| Source | Mapped to | Notes |
| --- | --- | --- |
| route `/login` | `src/components/login.tsx` | generated by frontend stage |
| route `/home` | `src/components/home.tsx` | generated by frontend stage |
| route `/login/biometric` | `src/components/biometric-login.tsx` | generated by frontend stage |
| testId `username-input` | `data-testid=username-input` usage in component | username-input |
| testId `password-input` | `data-testid=password-input` usage in component | password-input |
| testId `sign-in-button` | `data-testid=sign-in-button` usage in component | sign-in-button |
| testId `biometric-shortcut-button` | `data-testid=biometric-shortcut-button` usage in component | biometric-shortcut-button |
| testId `login-success-message` | `data-testid=login-success-message` usage in component | login-success-message |
| testId `login-error-message` | `data-testid=login-error-message` usage in component | login-error-message |
| testId `quick-login-expired-banner` | `data-testid=quick-login-expired-banner` usage in component | quick-login-expired-banner |
| testId `loading-indicator` | `data-testid=loading-indicator` usage in component | loading-indicator |

**Frontend stage status:** completed

## Backend API Mapping

| Source | Mapped to | Notes |
| --- | --- | --- |
| POST `/api/v1/auth/login` | `src/services/api_v1_auth_login.ts` | generated by backend stage |
| POST `/api/v1/auth/attempts/clear` | `src/services/api_v1_auth_attempts_clear.ts` | generated by backend stage |
| response `200` (json) | type in service | Login succeeded. Body contains the session token, user id, and expiry. Client clears local form state and navigates to the home screen. |
| response `400` (json) | type in service | Validation error (e.g. empty username or password). Client displays the inline 'Please enter both username and password.' message and keeps the user on the login screen. |
| response `401` (json) | type in service | Invalid credentials. Client displays 'Invalid username or password. Please try again.' and MUST NOT disclose remaining attempts or the account's lockout state to the user. |
| response `423` (json) | type in service | Account is locked (server-side 30-minute lockout triggered by 3 consecutive failed attempts). Client displays the locked message and prompts the user to contact customer support. |
| response `403` (json) | type in service | Account is suspended (3 consecutive lockout cycles). Client displays the suspension message and directs the user to the Contact Centre for manual re-enablement. |
| response `500` (json) | type in service | Server / network error during authentication. Client shows a generic error message and allows the user to retry by tapping 'Sign in' again. |

**Backend stage status:** completed

## Test Coverage

| Stage | Runner | Tests run | Tests passed | Tests failed | Status |
| --- | --- | --- | --- | --- | --- |
| tests | cucumber-js | 14 | 14 | 0 | completed |
| frontend | bun:test | 17 | 17 | 0 | completed |
| backend | bun:test | 35 | 35 | 0 | completed |

**Per-stage detail:**

- `tests` (cucumber-js): 14 scenarios / 107 steps / 0m 4.5s. All 14 scenarios pass on first run.
- `frontend` (bun:test + happy-dom): 17 unit tests across `LoginPage.test.tsx` (15), `HomePage.test.tsx` (1), `BiometricLoginPage.test.tsx` (1). 29 expect() calls / 0.76s.
- `backend` (bun:test): 35 unit tests across `auth-service.test.ts` (25) and `server.test.ts` (10). 101 expect() calls / 0.09s.

## Assumptions

- The login endpoint is POST /api/v1/auth/login with JSON body { username, password }. The feature does not specify the path or method, so this is an inferred RESTful convention.
- The 'app home screen' lives at the /home route. The feature never names the route.
- The biometric login shortcut is a separate route (/login/biometric), inferred from the parallel feature file 1594_biometric_login.feature and the step text 'the biometric flow is initiated'.
- The 'failed attempt counter' is a server-side per-username counter, cleared automatically on a successful login. The 30-minute lockout is a server-side state with a TTL.
- Account suspension after 3 consecutive lockout cycles is a server-side state change. The client simply displays the suspension message and Contact Centre guidance.
- The inline 'Login successful!' message is a transient toast/notification, not a full-screen page (per the 'No full-screen success page shown' scenario).
- The 'Signing in...' loading state is reflected on the button itself (label change + disabled state) — not a separate spinner overlay.
- The amber 'Quick Login Expired' banner is a UI overlay above the form, conditionally rendered when the quickLoginExpired flag is true on screen entry.
- Password masking is achieved with a type='password' input. The feature explicitly forbids a show/hide toggle, so the generated component must not render one.
- The 'approximately 1 second' navigation timing is informational, not a hard SLA — the generated tests should not assert an exact timeout but rather wait for the home screen to appear.
- Rapid-tap deduplication is achieved by disabling the Sign in button during the success transition (not by debouncing the navigation route itself).
- Session expiry while on the login screen does not lose any user-entered data because the login form state is local component state, not part of the server session.

## Ambiguities & Open Questions

_No ambiguities surfaced by the pipeline._

## Files Generated

```
demos/bdd/login/
├── ANALYSIS.md
├── tests/
│   └── cucumber.cjs
│   └── run-tests.sh
│   └── bdd.config.json
│   └── Dockerfile
│   └── tests/login.steps.ts
│   └── tests/world.ts
│   └── tests/hooks.ts
│   └── tests/pages/LoginPage.ts
│   └── tests/pages/HomePage.ts
│   └── tests/pages/BiometricLoginPage.ts
│   └── reports/1001_username_password.html
│   └── reports/1001_username_password.json
├── frontend/
│   └── components/LoginPage.tsx
│   └── components/HomePage.tsx
│   └── components/BiometricLoginPage.tsx
│   └── components/LoginTypes.ts
│   └── components/LoginConstants.ts
│   └── components/index.ts
│   └── components/test-utils.ts
│   └── components/preview-server.ts
│   └── components/LoginPage.test.tsx
│   └── components/HomePage.test.tsx
│   └── components/BiometricLoginPage.test.tsx
├── backend/
│   └── backend/types.ts
│   └── backend/auth-service.ts
│   └── backend/server.ts
│   └── backend/seed.ts
│   └── backend/index.ts
│   └── backend/auth-service.test.ts
│   └── backend/server.test.ts
```

**Gate verification (all required outputs present):**

| File | Status |
| --- | --- |
| `demos/bdd/login/cucumber.cjs` | OK |
| `demos/bdd/login/run-tests.sh` | OK |
| `demos/bdd/login/bdd.config.json` | OK |
| `demos/bdd/login/Dockerfile` | OK |
| `demos/bdd/login/tests/login.steps.ts` | OK |
| `demos/bdd/login/tests/world.ts` | OK |
| `demos/bdd/login/tests/hooks.ts` | OK |
| `demos/bdd/login/tests/pages/LoginPage.ts` | OK |
| `demos/bdd/login/reports/1001_username_password.html` | OK |
| `demos/bdd/login/reports/1001_username_password.json` | OK |
| `demos/bdd/login/components/LoginPage.tsx` | OK |
| `demos/bdd/login/components/HomePage.tsx` | OK |
| `demos/bdd/login/components/BiometricLoginPage.tsx` | OK |
| `demos/bdd/login/components/LoginTypes.ts` | OK |
| `demos/bdd/login/components/LoginConstants.ts` | OK |
| `demos/bdd/login/components/index.ts` | OK |
| `demos/bdd/login/components/test-utils.ts` | OK |
| `demos/bdd/login/components/preview-server.ts` | OK |
| `demos/bdd/login/components/LoginPage.test.tsx` | OK |
| `demos/bdd/login/components/HomePage.test.tsx` | OK |
| `demos/bdd/login/components/BiometricLoginPage.test.tsx` | OK |
| `demos/bdd/login/backend/types.ts` | OK |
| `demos/bdd/login/backend/auth-service.ts` | OK |
| `demos/bdd/login/backend/server.ts` | OK |
| `demos/bdd/login/backend/seed.ts` | OK |
| `demos/bdd/login/backend/index.ts` | OK |
| `demos/bdd/login/backend/auth-service.test.ts` | OK |
| `demos/bdd/login/backend/server.test.ts` | OK |
| `demos/bdd/login/1001_username_password.feature` | OK |
| `demos/bdd/login/1001_username_password.feature.contract.json` | OK |
| `demos/bdd/login/ANALYSIS.md` | OK |
