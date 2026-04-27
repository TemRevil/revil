# Hostinger Production Setup

This repository now uses GitHub Actions for validation and an SSH-based release flow to publish `dist` directly to Hostinger.

## GitHub workflows

- `.github/workflows/ci.yml`
  - Runs on pull requests and manual dispatch.
  - Executes `npm ci`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.
- `.github/workflows/deploy-hostinger.yml`
  - Runs on pushes to `main` and manual dispatch.
  - Re-runs validation, packages the generated `dist` output, uploads it over SSH, and swaps the Hostinger `public_html` directory to the new release.

## GitHub secrets required for deploys

- `HOSTINGER_SSH_HOST`
- `HOSTINGER_SSH_PORT`
- `HOSTINGER_SSH_USERNAME`
- `HOSTINGER_SSH_PASSWORD`

## Required environment variables

Add these build-time values to GitHub Actions secrets:

- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`
- `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID`

## Hostinger runtime note

This deployment path publishes the static export into `domains/temrevil.com/public_html` and replaces the previous `public_html` directory with a timestamped backup on each release.
