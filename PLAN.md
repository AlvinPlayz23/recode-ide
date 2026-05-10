# Recode IDE Remake Plan

## Product Direction
Recode is a fresh Tauri-based AI code editor inspired by Athas’s architecture and product behavior, with CodeEdit used only as UX direction for native-feeling layout, density, sidebars, tabs, and editor chrome.

The implementation should be original to Recode, but Athas is the primary reference for what a complete product needs: project/session management, filesystem operations, custom editor layers, terminal PTY, source control, LSP, diagnostics, command/keymap infrastructure, AI agent workflows, settings, runtime/tooling, and release readiness.

Standing instruction: before implementing or changing any sizeable feature, inspect the corresponding Athas source first. Directly adapt, copy small structural patterns, or closely mirror Athas code when it improves correctness and fits Recode's architecture. CodeEdit remains UX direction only; Athas is the engineering reference.

## Athas Reference Map
Use these Athas areas heavily when designing equivalent Recode systems:

- App wiring and native services: `refs/athas/src-tauri/src/main.rs`, `refs/athas/src-tauri/src/app_setup.rs`, `refs/athas/src-tauri/src/commands/mod.rs`.
- Filesystem and workspace: `refs/athas/src/features/file-system/controllers/store.ts`, `platform.ts`, `file-operations.ts`, `file-tree-utils.ts`, `workspace-session.ts`, `workspace-project-transition.ts`.
- File explorer UX: `refs/athas/src/features/file-explorer/`, especially tree utilities, git decorations, editing rows, context actions, and active-buffer targeting.
- Editor core: `refs/athas/src/features/editor/components/editor.tsx`, `layers/`, `hooks/`, `stores/`, `history/`, `view-model/`, `lsp/`, `formatter/`, `context-menu/`.
- Terminal: `refs/athas/crates/terminal/`, `refs/athas/src-tauri/src/terminal.rs`, `refs/athas/src/features/terminal/`.
- Git/source control: `refs/athas/crates/version-control/`, `refs/athas/src-tauri/src/commands/version_control/git.rs`, `refs/athas/src/features/git/`.
- LSP/diagnostics/outline: `refs/athas/crates/lsp/`, `refs/athas/src-tauri/src/commands/development/lsp/`, `refs/athas/src/features/diagnostics/`, `refs/athas/src/features/outline/`.
- AI/agent: `refs/athas/crates/ai/`, `refs/athas/src-tauri/src/commands/ai/`, `refs/athas/src/features/ai/`.
- Command/keymaps/menu: `refs/athas/src/features/command-palette/`, `refs/athas/src/features/keymaps/`, `refs/athas/src-tauri/src/menu.rs`.
- Window/session/panes/tabs: `refs/athas/src/features/window/`, `refs/athas/src/features/panes/`, `refs/athas/src/features/tabs/`, `refs/athas/src/features/layout/`.
- Search/quick-open: `refs/athas/crates/fff-search/`, `refs/athas/src/features/global-search/`, `refs/athas/src/features/quick-open/`.
- Settings/themes/extensions: `refs/athas/src/features/settings/`, `refs/athas/src/extensions/`, `refs/athas/src/features/onboarding/`.
- Later advanced surfaces: `database`, `debugger`, `github`, `remote`, `runtime`, `tooling`, `local-history`, `image/pdf/binary/web viewers`.

## Architecture Rules
- Keep frontend feature code under `src/features/[feature]/` with `components`, `stores`, `services`, `types`, `utils`, and `tests` as needed.
- Keep Rust command handlers thin over feature modules/crates. Athas keeps heavy logic in crates like `terminal`, `version-control`, `lsp`, `ai`, `project`, `runtime`, and `remote`; Recode should move toward the same shape instead of growing one large `lib.rs`.
- Use Tauri plugins first where they fit: fs, dialog, opener, clipboard, shell/process, http, os, store, log, single-instance, window-state, deep-link.
- Prefer native-backed behavior over frontend-only demos once a feature leaves prototype stage.
- Use stores for domain state and actions. Avoid cross-component ad hoc state for core workflows.
- Preserve CodeEdit-like UI restraint: compact rows, panes, separators, native density, minimal cards.

## Current State
- Tauri/React app shell exists.
- Folder open, file tree, tabs, editor buffer, save, search, status bar, command palette shell exist.
- Hybrid editor exists with textarea input and custom render/search/selection layers.
- Tree-sitter worker path exists for tokenization fallback.
- Git status, basic diff, recent workspace restore, and simple command terminal exist.
- Basic file operations exist: create file/folder, inline rename/create rows, delete, refresh, and tab reconciliation.

## Milestones

### Milestone 1: App Shell And Native Foundation
Goal: make the app boot reliably and establish Athas-like native wiring.

- Tauri plugin setup, capabilities, logging, window-state, single-instance, deep-link, store.
- App/window shell: titlebar, activity rail, explorer, editor column, terminal area, inspector/AI panel, status bar.
- Command invocation conventions and error surfaces.
- App startup restore path and safe fallback demo state.
- Basic smoke checks: app launches, web build passes, typecheck passes.

### Milestone 2: Workspace And Filesystem Basics
Goal: complete core IDE file/project behavior before adding advanced editor features.

- Open folder, reopen recent workspace, refresh tree, collapse/expand tree.
- Create file, create folder, inline rename, delete, duplicate/copy path/reveal in folder.
- Save, save as, revert file, close dirty files with confirmation.
- Workspace file watcher and external-change handling.
- Git-aware file decorations in explorer.
- Ignore rules and large workspace limits.
- Recent files/folders and missing-folder handling.
- Local history baseline before destructive writes/deletes.

### Milestone 3: Editor Core Reliability
Goal: make editing stable enough to use daily.

- Buffer model with dirty state, saved state, language id, cursor, selection, scroll, search state.
- Real undo/redo grouping and redo invalidation.
- Custom selection, cursor, search highlights, gutter, line numbers.
- Keyboard handling: Tab/outdent, duplicate line, move line, delete line, toggle comment, select all.
- Clipboard integration and context menu.
- Save failure toasts/status and dirty close prompts.
- Large-file behavior: read-only thresholds, tokenization limits, viewport rendering.
- Editor session restore: scroll, cursor, selection, folds, search.

### Milestone 4: Tabs, Panes, Layout, And Sessions
Goal: move from single-editor prototype to real workbench.

- Tab lifecycle: close, close others, close all, reopen closed, pin/preview tabs.
- Pane model: split editor, move tab between panes, active surface tracking.
- Persist/restore workspace UI state.
- Terminal/editor/web/binary viewer tab types.
- Project tabs/multi-root workspace model.
- Unsaved-buffer guard when switching/closing projects.

### Milestone 5: Command Palette, Menus, And Keymaps
Goal: centralize all user actions.

- Command registry with command ids and executable actions.
- Keybinding registry and keyboard shortcut settings.
- Command palette categories: file, editor, view, git, terminal, AI, settings.
- Native menu events mapped to command ids.
- Quick action history/recent commands.
- Command routing for sidebar/activity views.

### Milestone 6: Terminal PTY
Goal: replace the interim shell-session terminal with real interactive PTY terminals.

Current notice: Recode now has a persistent shell-session terminal backed by Tauri events. This is useful enough for basic commands, but it is not a full PTY/xterm implementation yet. Full terminal work is intentionally deferred until after LSP diagnostics/completions.

- Rust terminal manager with create/write/resize/close.
- Shell detection/listing.
- Xterm frontend with fit, search, clipboard, web links, unicode, serialize.
- Terminal tabs/splits and session state.
- Workspace cwd and per-terminal cwd.
- Restore terminal sessions with workspace.
- Later: remote terminal support.

### Milestone 7: Git And Source Control
Goal: bring source control from status count to usable workflow.

- Discover repo, init repo, status, branches, commits, remotes.
- Source control panel with staged/unstaged/untracked groups.
- Stage/unstage file and all files.
- Diff viewer using editor/diff layers.
- Commit, pull, push, fetch.
- Discard changes with confirmation and local-history safety.
- Stash list/apply/pop/drop.
- Branch checkout/create/delete.
- Gutter changed-line indicators and inline diff/revert.
- Later: tags, worktrees, GitHub PR/issues/actions.

### Milestone 8: Search, Quick Open, And Navigation
Goal: make project navigation fast.

- Fuzzy file search and quick open.
- Workspace text search with include/exclude filters.
- Recent files and frecency scoring.
- Go to line, go to symbol, breadcrumbs.
- Outline panel from parser/LSP symbols. Initial Recode LSP-facade outline is implemented; later it should read from real LSP document symbols.
- References panel and search result previews. Initial workspace reference scanning is implemented for text files; later replace reference resolution with real LSP results.

### Milestone 9: Tree-Sitter, LSP, Diagnostics, And Formatting
Goal: move from text editor to code editor.

- Editor stability pass: shared editor geometry constants, horizontal scroll/render alignment, large-file guardrails, programmatic content synchronization, and content+selection undo snapshots are implemented. Continue hardening custom editor edge cases before real LSP replacement.
- Tree-sitter parser asset pipeline for common languages.
- Incremental/viewport tokenization worker.
- Fold regions and folding gutter.
- LSP manager: start/stop per workspace/file, document open/change/save/close.
- Current LSP backend is a Recode facade for diagnostics/completions/document symbols/hover/definition. Later, swap it to a real external LSP manager using Athas' `LspManager` pattern while keeping the frontend service API stable.
- Hover, completions, signature help, go to definition, references. Initial hover and same-file definition navigation are implemented with facade heuristics. Signature help is intentionally disabled in the frontend until the real LSP manager is available; the backend API shape remains dormant for that phase.
- Rename symbol and workspace edits. Initial same-file facade rename and shared workspace edit application are implemented.
- Diagnostics store and diagnostics panel. Initial filtering, severity scope, current-file scope, and click-to-location navigation are implemented.
- Code actions, format document, lint hooks. Initial quick-fix code actions and document formatting are implemented; later replace with real LSP formatting/code actions.
- Inlay hints, semantic tokens, code lens. Initial inlay hints and semantic token rendering are implemented with facade heuristics; code lens remains pending.

### Milestone 10: AI Chat And Provider Settings
Goal: build the AI cockpit layer.

- Provider registry: OpenAI-compatible first, then Anthropic/OpenRouter/Ollama/custom.
- Secure token storage using Tauri commands.
- Chat sessions, history persistence, streaming responses.
- File mentions, selected buffers/files context, pasted images.
- Quick question flow separate from agent mode.
- Model/provider selectors and settings.
- Inline edit entry point and edit proposal preview.

### Milestone 11: Agent Mode And Tool Safety
Goal: build Athas-style agent workflows.

- Agent session abstraction, tool call state, timeline/activity grouping.
- Filesystem tools: read, list, search, propose edit.
- Terminal tool proposals with explicit user approval.
- Permission requests, approve/deny flow, cancellation.
- Apply-edit preview and rollback/local-history safety.
- Multi-step task display and plan updates.
- Optional ACP bridge/CLI agent support after local provider path works.

### Milestone 12: Settings, Themes, Extensions, And Product Polish
Goal: make the app configurable and cohesive.

- Settings store backed by Tauri store.
- Settings UI for editor, terminal, AI, keymaps, git, UI behavior.
- Theme tokens, icon themes, font settings.
- Onboarding/welcome screen and empty states.
- Notifications/toasts/dialog primitives.
- Extension/runtime scaffolding for themes, syntax assets, and commands.
- Accessibility pass: focus, labels, keyboard-only workflows.

### Milestone 13: Advanced Workbench Surfaces
Goal: add Athas-adjacent power features once core IDE behavior is stable.

- Local history browser and restore.
- Remote SSH/SFTP workspace operations.
- Runtime/tool installer status.
- Database connections and viewers.
- Debugger sessions.
- Markdown preview, HTML/web viewer, image/PDF/binary viewers.
- GitHub PR/issues/actions.
- Telemetry/log viewer if needed.

### Milestone 14: Quality, Packaging, And Release Readiness
Goal: prevent the app from regressing as it grows.

- Unit tests for stores, editor utilities, filesystem operations, git parsers, search, AI context.
- Rust tests for path safety, git wrappers, terminal manager, LSP process lifecycle.
- Manual smoke tests: launch, open folder, create/rename/delete, edit/save, terminal, git, search, AI.
- Build profiles and release config.
- Updater/signing only when real release channels exist.
- Crash/log capture and user-facing failure states.

## Near-Term Priority
The next work should not jump directly to AI. Finish the basic IDE foundation first:

1. File watcher and external file changes.
2. Dirty close/save-as/revert protections.
3. Command/keymap registry.
4. Source control panel.
5. LSP diagnostics/completions.
6. Real PTY terminal.
7. Quick open and workspace search.

AI becomes much more useful after these primitives are reliable because agent workflows depend on safe file edits, command execution, search, git diff, and diagnostics.

## Validation Plan
- Run `pnpm typecheck` for frontend changes.
- Run `pnpm web:build` after UI/editor changes.
- Run Rust checks when Rust command signatures or dependencies change.
- Smoke test in Tauri for anything touching plugins, filesystem, terminal, git, or app startup.
- Every milestone should include at least one manual test path and one automated test target where practical.
