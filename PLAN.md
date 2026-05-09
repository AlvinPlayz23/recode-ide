# Recode IDE Remake Plan

## Summary
Build a fresh Tauri-based AI code editor inspired by Athas’s product capabilities and CodeEdit’s macOS-style UX. The app will use the same broad stack as Athas: Tauri 2, Rust, React, TypeScript, Bun, Vite, Zustand, Tailwind, tree-sitter/WASM, xterm, and Rust feature crates. The editor core will be a hybrid custom editor: native textarea for input, custom React layers for rendering.

The first milestone is an **AI coding cockpit**: open a folder, browse files, edit code, use terminal, view git state, and interact with an AI agent/chat panel that can read/edit files and run commands with confirmation.

## Key Changes
- Create a new app, assumed name: `recode`, with Tauri 2 + React 19 + TypeScript + Rust 2024 + Bun.
- Use CodeEdit only for UX direction: native-feeling window chrome, navigator/sidebar, editor tabs, inspector/right panel, status bar, command palette, source-control feel, and refined spacing.
- Use Athas only as behavioral/architecture reference: AI chat, custom editor layering, LSP bridge, terminal integration, git operations, file explorer, settings, and agent workflow.
- Organize Rust as a workspace with feature crates:
  `app`, `filesystem`, `project`, `editor-core`, `terminal`, `git`, `lsp`, `ai`, `settings`, `search`.
- Organize frontend by feature:
  `window`, `layout`, `file-explorer`, `editor`, `tabs`, `terminal`, `git`, `ai`, `command-palette`, `settings`.

## Implementation Plan
- App shell:
  Build a CodeEdit-inspired layout with titlebar, left navigator, center editor area, bottom terminal panel, right AI/inspector panel, status bar, tab bar, and command palette.
- Hybrid editor:
  Use a transparent/native textarea for input, selection, keyboard, IME, clipboard, and scroll. Render visible code through custom React layers: text, gutter, line numbers, syntax highlights, cursor, selection, search matches, diagnostics, git indicators, and inline AI edits.
- Editor data model:
  Start with a TypeScript buffer store for open buffers, dirty state, file path, language id, cursor, selection, scroll position, and undo grouping. Keep the API shaped so `editor-core` can move to Rust later without redesigning the UI.
- Syntax and large files:
  Use tree-sitter/WASM in a worker for tokenization. Render only viewport lines plus buffer lines. Defer minimap and advanced folding until after basic editing is stable.
- Rust backend:
  Implement Tauri commands for opening folders, reading/writing files, watching workspace changes, spawning terminals, git status/diff/stage/commit basics, and LSP process lifecycle.
- AI cockpit:
  Add provider abstraction for OpenAI-compatible APIs first, then extend to Anthropic/OpenRouter/Ollama. Add chat history, file mentions, selected-code context, apply-edit previews, and command execution with explicit user approval.
- UI identity:
  Use a refined native-mac/editor aesthetic: calm translucent panels where supported, crisp separators, compact density, expressive but restrained typography, CodeEdit-like navigator/inspector mental model, and distinct AI panel treatment that does not look like a generic chat widget.

## Milestones
- Milestone 1: project scaffold, Tauri window, app layout, command palette shell, folder open, file tree, tab opening.
- Milestone 2: hybrid editor MVP with textarea input, custom rendered lines, line numbers, selection/cursor sync, save file, dirty tabs, basic search.
- Milestone 3: terminal panel, git status/diff indicators, status bar metadata, recent workspace restore.
- Milestone 4: tree-sitter worker syntax highlighting, viewport rendering, diagnostics layer, basic LSP hover/completion hooks.
- Milestone 5: AI chat panel with provider settings, file mentions, selected-code context, streaming responses, edit proposal/apply flow.
- Milestone 6: agent mode with filesystem tools, terminal command proposals, multi-step task display, and safety confirmations.

## Public Interfaces
- Frontend editor API:
  `openBuffer(path)`, `closeBuffer(id)`, `saveBuffer(id)`, `applyEdit(bufferId, range, text)`, `getSelection(bufferId)`, `setCursor(bufferId, position)`.
- Rust Tauri commands:
  `project_open_folder`, `fs_read_file`, `fs_write_file`, `fs_watch_start`, `terminal_spawn`, `terminal_write`, `git_status`, `git_diff`, `lsp_start`, `lsp_request`, `ai_get_token`, `ai_set_token`.
- AI tool interface:
  Tools expose `read_file`, `list_files`, `search_workspace`, `propose_file_edit`, and `propose_terminal_command`. File edits and terminal commands require confirmation before execution.

## Test Plan
- TypeScript checks for stores, editor utilities, AI provider adapters, and command palette routing.
- Rust checks for filesystem commands, path safety, git wrappers, terminal lifecycle, and LSP process management.
- Editor interaction tests for typing, multiline selection, save/dirty state, tab switching, search highlights, and viewport rendering.
- AI tests with mocked streaming providers, file mention context, edit proposal parsing, and denied/accepted tool calls.
- Manual smoke test: launch app, open folder, open/edit/save file, use terminal, view git status, ask AI to explain selected code, apply an AI edit preview.

## Assumptions
- Product name is `Recode` unless changed later.
- First platform target is desktop Tauri with Windows development support and macOS-style visual inspiration.
- The editor strategy is hybrid custom textarea plus custom React-rendered layers.
- The first milestone optimizes for an AI coding cockpit, not a complete VS Code replacement.
- We will build fresh source structure and implementation while using Athas and CodeEdit as references for behavior and UX.
