
# Complete Codebase Audit & Documentation Generation

This document outlines the rigorous, multi-pass plan to execute a massive, file-by-file, feature-by-feature codebase audit for the Ultron3 project, producing an exhaustive **AI Codebase Context Package**.

## Goal

To construct a highly detailed, interconnected documentation suite that acts as an authoritative source of truth for any external AI agent. The documentation will rely *exclusively* on the actual source code, rejecting assumptions or outdated high-level summaries.

## Core Directives

- **Evidence Trail**: Every claim must be backed by a file path, function name, and line range.
- **Categorization**: Every file must be classified (ACTIVE / LEGACY / EXPERIMENTAL / UNUSED / UNKNOWN).
- **Contradiction Detection**: Explicitly document where existing documentation (like `INVIGILATOR_MODE.md` or `AGENTS.md`) contradicts the actual code.
- **Exhaustive Scanning**: Do not stop after discovering obvious files/features. Recursively inspect the *entire* repository, including hidden configuration files, scripts, assets, native binaries/source, test files, generated files, and documentation. Maintain a coverage checklist and do not declare Pass 1 or the overall audit complete until *every* repository item has a classification and an audit status.
- **Entry Point**: `AI-QUICK-CONTEXT.md` will serve as the directory map, telling the external AI which document to read for specific tasks.

## Proposed Execution Strategy (The Workflow)

The audit will be performed in iterative passes to ensure absolute accuracy:

### Pass 1: Complete Inventory & Architecture Discovery

- Recursively scan the entire repository (`src/`, `docs/`, `proctor-rounds/`, `VoiceImplementation/`, `tests`, etc.).
- Maintain a strict coverage checklist to ensure zero files are missed.
- Categorize every file and identify cross-file dependencies.
- Map the application architecture and platform branches.

### Pass 2: File/Function/Reference Analysis & Feature Tracing

- Trace features end-to-end (from UI → IPC → Main Process → External API → Storage).
- Document data flow, IPC registries, and state management.

### Pass 3: Documentation Generation

- Generate the markdown files in the `docs/ai-context/` structure based on gathered evidence.
- Create dependency graphs and feature-to-file mappings.

### Pass 4: Independent Verification & Correction

- **Re-scan the repository after documentation generation.**
- For every documented file path, function, IPC channel, shortcut, API, model, configuration key, and feature, verify that it *still exists* and *matches the documentation*.
- Flag anything that cannot be verified rather than guessing.
- Correct any discrepancies between the generated docs and the current codebase.

### Pass 5: Finalization

- Generate `AI-QUICK-CONTEXT.md`.

## Proposed Output Structure

The output will be placed in the root `docs/ai-context/` directory:

```text
docs/ai-context/
├── 00-INDEX.md
├── 01-PROJECT-OVERVIEW.md
├── 02-ARCHITECTURE.md
├── 03-REPOSITORY-STRUCTURE.md
├── 04-FILE-CATALOG.md
├── 05-MAIN-PROCESS.md
├── 06-PRELOAD-IPC.md
├── 07-RENDERER-UI.md
├── 08-AI-SYSTEM.md
├── 09-AUDIO-SYSTEM.md
├── 10-SCREEN-VISION.md
├── 11-STORAGE-DATA-MODELS.md
├── 12-CONFIGURATION.md
├── 13-KEYBOARD-SHORTCUTS.md
├── 14-WINDOW-SYSTEM.md
├── 15-NATIVE-OS-INTEGRATION.md
├── 16-FEATURES.md
├── 17-STATE-MANAGEMENT.md
├── 18-BUILD-RUNTIME.md
├── 19-DEPENDENCIES.md
├── 20-SECURITY.md
├── 21-PERFORMANCE.md
├── 22-LEGACY-EXPERIMENTAL.md
├── 23-CROSS-FILE-DEPENDENCIES.md
├── 24-MODIFICATION-GUIDE.md
├── 25-UNKNOWN-UNVERIFIED.md
├── 26-API-INTEGRATIONS.md
├── 27-ENVIRONMENT-AND-PLATFORM-MATRIX.md
├── AI-QUICK-CONTEXT.md (The primary entry point)
└── diagrams/
    ├── architecture.md
    ├── ai-flow.md
    ├── audio-flow.md
    ├── ipc-flow.md
    └── feature-dependencies.md
```

## User Review Required

> [!IMPORTANT]
> The plan is finalized with strict recursive coverage checklists and explicit re-scanning verification directives.
>
> Please give the final approval, and I will begin Pass 1.
