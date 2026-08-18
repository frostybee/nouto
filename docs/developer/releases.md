# Releases

## `prepare-desktop-release.mjs`

`pnpm run release:desktop <version> [--dry-run] [--skip-checks] [--allow-empty-changelog]` runs `scripts/prepare-desktop-release.mjs`, which:

1. Checks the version is valid semver and that the tag `desktop-v<version>` doesn't already exist.
2. Requires a clean working tree (unless skipped).
3. Runs the quality gate (unless `--skip-checks`).
4. Bumps the version in `packages/desktop/package.json`, `packages/desktop/src-tauri/Cargo.toml`, and `packages/desktop/src-tauri/tauri.conf.json`, then runs `cargo update -p nouto --offline` so `Cargo.lock` picks up the new version.
5. Promotes the `[Unreleased]` section of `packages/desktop/CHANGELOG.md` to `## [<version>] - <date>`.
6. Commits as `release(desktop): v<version>`, tags `desktop-v<version>`, and prints the `git push` command. It never pushes on its own.

`--dry-run` prints what it would do without writing anything or creating a commit or tag.

## CHANGELOG convention

`packages/desktop/CHANGELOG.md` follows Keep a Changelog style. New entries go under `[Unreleased]` as they land; the release script promotes that section to a dated version heading when a release is cut.

## `release.yml`

Pushing a `desktop-v*` tag (or a manual `workflow_dispatch` with a `tag` input) triggers `.github/workflows/release.yml`:

1. `create-release` creates a draft GitHub release for the tag (with the `desktop-` prefix stripped for the release name).
2. A build matrix (Linux x86_64, Windows, macOS aarch64, macOS x86_64) builds and uploads platform bundles via `tauri-apps/tauri-action`.

## Updater signing

The desktop app uses `tauri-plugin-updater`. Signed release artifacts are produced using the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` secrets configured on the repository; the updater's public key lives in `tauri.conf.json`. A `latest.json` manifest is generated alongside the release artifacts for the updater to check against.
