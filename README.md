# SPARTA Input — VS Code Extension

Language support for [SPARTA](https://sparta.github.io) (Stochastic PArallel Rarefied-gas Time-accurate Analyzer) input scripts.

## Features

- **Syntax highlighting** for SPARTA input scripts (`in.*`, `.sparta`)
- **Language Server** with:
  - Command and style autocompletion (`fix`, `compute`, `collide`, …)
  - Snippet-style completions for common commands
  - Hover tooltips with links to the SPARTA manual
  - Diagnostics: unknown commands, ordering errors, undefined variables, duplicate IDs

## File associations

SPARTA input scripts conventionally use the pattern `in.<casename>` (e.g. `in.circle`). This extension registers:

- `in.*` and `**/in.*` → SPARTA language
- `.sparta` extension

## Getting started

### Prerequisites

- Node.js 18+
- VS Code 1.85+

### Build

```bash
cd vscode-sparta
npm install
npm run compile
```

### Debug

1. Open the `vscode-sparta` folder in VS Code
2. Run **Run Extension** from the Debug panel (F5)
3. In the Extension Development Host, open a folder containing SPARTA examples (e.g. `../sparta/examples/circle`)

### Package

```bash
npm run package
```

Produces a `.vsix` file installable via **Extensions: Install from VSIX**.

## Settings

| Setting | Description |
|---------|-------------|
| `sparta.validateOrdering` | Warn when commands appear before required simulation state (default: `true`) |
| `sparta.docBaseUrl` | Base URL for manual links in hover tooltips |
| `sparta.executablePath` | Path to SPARTA executable (for future run integration) |
| `sparta.workingDirectory` | Working directory for SPARTA runs |
| `sparta.trace.server` | LSP trace level (`off`, `messages`, `verbose`) |

## Project structure

```
vscode-sparta/
  client/           VS Code extension host (activates LSP)
  server/           Language server (lexer, parser, providers)
  syntaxes/         TextMate grammar
  snippets/         User snippets
  test/             Unit tests (planned)
```

## License

GPL-2.0-or-later (consistent with SPARTA)
