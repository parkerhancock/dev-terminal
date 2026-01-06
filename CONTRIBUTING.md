# Contributing to dev-terminal

## Getting Started

1. Fork the repository
2. Clone your fork
3. Install dependencies: `npm install`
4. Create a branch: `git checkout -b feature/your-feature`

## Development Workflow

1. **Open an issue first** - Discuss changes before implementing
2. **Make changes** - Keep commits focused and atomic
3. **Run checks** - `npm run typecheck && npm run format:check`
4. **Submit PR** - Reference the issue in your PR description

## Code Style

- TypeScript with strict mode
- Prettier for formatting (auto-runs on commit)
- Use path aliases (`@/`) for imports

## Pull Requests

- PRs require passing CI (typecheck + format)
- Keep changes focused - one feature/fix per PR
- Update documentation if adding new features

## Questions?

Open an issue for discussion.
