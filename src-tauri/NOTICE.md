# Backend Structure Notice

Recode's Tauri backend should follow Athas' domain-oriented structure. Do not add new commands or business logic directly to `src-tauri/src/lib.rs`.

## Required Shape

`src-tauri/src/lib.rs` is app wiring only:
- plugin registration
- managed state registration
- `invoke_handler`
- app startup/run

Command code belongs under `src-tauri/src/commands/`, grouped by domain:
- `commands/project/` for filesystem, workspace, watcher, local history, remote workspace, path safety.
- `commands/version_control/` for Git, GitHub, branches, commits, diffs, stashes, worktrees.
- `commands/development/` for LSP, runtime/tooling, debugger, CLI helpers.
- `commands/development/lsp/` for LSP process lifecycle, document sync, diagnostics, completions, hover, symbols, rename, code actions.
- `commands/editor/` for search, format, lint, editorconfig, execution guards.
- `commands/ui/` for window, theme, font, and UI-native commands.
- `commands/ai/` for tokens, auth, chat history, ACP/agent integration.
- `commands/database/` for future database sidecars and connection managers.

Root-level modules are allowed only for app-wide services matching Athas' shape:
- `terminal.rs` for terminal manager/session primitives until it becomes a dedicated crate/module.
- `app_setup.rs`, `app_runtime.rs`, `menu.rs`, `logger.rs`, `secure_storage.rs` when those systems are added.

## Current Recode Mapping

- `commands/project/fs.rs`: folder open and filesystem operations.
- `commands/project/watcher.rs`: file watcher and external-change events.
- `commands/version_control/git.rs`: Git status and diff commands.
- `commands/development/lsp/commands.rs`: temporary Recode LSP facade.
- `terminal.rs`: interim shell-session terminal. Full PTY work is deferred.

## Rules For Future Work

- Match Athas' folder names and module boundaries unless there is a concrete reason not to.
- Keep command functions thin. Put reusable logic in sibling helpers/modules or future crates.
- Public command payloads should live next to the command module that owns them.
- If a feature grows beyond one file, split it before adding more logic.
- If adding a future-only domain, update this notice and `commands/mod.rs` at the same time.
