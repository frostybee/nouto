# Developer docs

Contributor-facing documentation for the Nouto desktop app (`packages/desktop`). These docs explain how the code is built, not how to use the app. For user-facing feature docs, see `packages/website/src/content/docs/`. For the high-level monorepo overview, see `CLAUDE.md` at the repo root.

- [architecture-guide.md](./architecture-guide.md) — the multi-platform split, the message bus, and how a UI action reaches Rust.
- [persistence-and-recovery.md](./persistence-and-recovery.md) — how data is saved to disk, corrupt-file recovery, the close handshake, and crash dumps.
- [releases.md](./releases.md) — how a desktop release is cut, tagged, and shipped.
- [error-handling.md](./error-handling.md) — the Rust error type, logging, and the render-error boundary.
- [commands-and-shortcuts.md](./commands-and-shortcuts.md) — the full list of Tauri commands and the shortcut systems.
- [cross-platform.md](./cross-platform.md) — per-OS differences in window chrome, tray, and theme sync.
- [quality.md](./quality.md) — the local and CI quality gate.
