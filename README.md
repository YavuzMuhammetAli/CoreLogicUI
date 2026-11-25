# CoreLogicUI

CoreLogicUI is the tenant-facing Angular application of the CoreLogic platform. Company users sign
in, design data models without code, manage records, build reports and dashboards, and run
workflows. All data and logic live in the [CoreLogic](https://github.com/YavuzMuhammetAli/CoreLogic)
backend.

Part of the CoreLogic platform:

| Repository | Role |
|---|---|
| [CoreLogic](https://github.com/YavuzMuhammetAli/CoreLogic) | ASP.NET Core Web API, migrations, deployment |
| **CoreLogicUI** (this repo) | Tenant-facing Angular app |
| [CoreLogic-PlatformConsole](https://github.com/YavuzMuhammetAli/CoreLogic-PlatformConsole) | Operator console for the platform |

## Features

- **Model builder.** Define entity schemas (columns, types, rules, relationships, icons, auto-value
  formulas), preview them, and publish them so the backend compiles them.
- **Records.** Dynamic list and detail screens for every published model, with master-detail
  sub-records, lookups, files and images, and search, sort and filter.
- **Reports and dashboards.** A report builder (filters, grouping, aggregates, charts) with Excel and
  PDF export, and dashboards made of report widgets.
- **Workflows.** A visual designer (approval, task, parallel, condition, field update, notify, timer,
  end), with simulation, versioning and diffs, import and export, and instance monitoring. Users see
  their own tasks under "My tasks".
- **Screen and navigation design.** Drag-and-drop layouts for record forms, list columns and the
  sidebar menu, including separate designs per role.
- **AI assistant.** Describe the business in plain text to get proposed models, reports and
  dashboards. Proposals are imported only through the regular endpoints.
- **Administration.** Users, roles and permissions, column visibility, and the audit log. A
  Parameters page covers backups, SMTP, notification templates and subscription. Deleted items can be
  restored.
- **General.** TR/EN interface, light and dark theme, in-app notifications, and layouts that work on
  phones.

## Tech stack

| Area | Technology |
|---|---|
| Framework | Angular 22 (standalone components, signals, OnPush, zone.js) |
| Language | TypeScript 6.0 |
| Build | Angular CLI 22 / `@angular/build` (esbuild); client-side only, no SSR |
| Styling | Custom token-based SCSS design system, with no Bootstrap or UI kit |
| Charts | ApexCharts **4.7.0**. It is pinned on purpose: later versions need a commercial licence, so do not upgrade |
| Icons | Material Symbols, inlined as SVG via `npm run icons` |
| Tests | Karma + Jasmine |

## Getting started

### Prerequisites

- Node.js `^22.22.3 || ^24.15.0`
- The [CoreLogic backend](https://github.com/YavuzMuhammetAli/CoreLogic) running on
  `http://localhost:5245`

### Run

```bash
npm install
npm start          # http://localhost:4200
```

`ng serve` uses [proxy.conf.json](proxy.conf.json) to forward `/api` to `http://localhost:5245`.
The session is an HttpOnly cookie, so the UI and the API must share an origin. The proxy gives local
development the same layout as production.

## Scripts

| Command | Description |
|---|---|
| `npm start` | Dev server on port 4200 |
| `npm run build` | Production build into `dist/core-logic-ui/` |
| `npm run watch` | Development build in watch mode |
| `npm test` | Unit tests in watch mode (Chrome) |
| `npm run test:ci` | Single headless test run. Run this before committing |
| `npm run icons` | Regenerates the icon sets from the icon manifests |

## Project structure

```
src/
├── index.html, main.ts, styles.scss   # entry point and global design tokens
└── app/
    ├── components/     # screens, plus shared/ for reusable building blocks
    ├── services/       # one service per backend controller, plus app-level services
    ├── utils/          # pure, unit-tested logic (workflow, screen and nav layouts, formulas, lists)
    ├── guards/         # auth, admin, per-model permission, unsaved changes
    ├── interceptors/   # Accept-Language and HTTP error handling
    ├── i18n/           # TR/EN dictionaries (some are lazy-loaded per screen)
    ├── pipes/          # translate (`| t`) and model label pipes
    ├── models/         # DTOs that mirror the backend
    └── environments/   # apiBaseUrl ('/api')
```

Some rules are implemented in both the UI and the backend and must behave identically: auto-value
formulas, and screen-layout and navigation-layout validation. They are tested against `*.vectors.json`
files that are kept identical in both repositories. When you change a rule, change both sides and add
a vector.

## Conventions

- All user-facing text goes through i18n (`'key' | t` or `LanguageService.t()`).
  `translations.spec.ts` fails if a key is missing its TR or EN text.
- Code, comments, identifiers and test titles are in English.
- Use `shared/confirm-dialog` instead of `confirm()`, and `<app-icon>` instead of hand-written SVG
  or icon fonts.
- Format numbers and dates through `utils/locale-format.ts`, never with a hard-coded locale.
- The production Content Security Policy blocks inline scripts. Do not add `<script>` tags to
  `index.html` or `on*` attributes.

## Deployment

The production build uses `environment.prod.ts` (`apiBaseUrl: '/api'`). The app is built and served
by the `web` nginx image defined in the backend repository. See the backend
[deploy/README.md](https://github.com/YavuzMuhammetAli/CoreLogic/blob/main/deploy/README.md).

## Further documentation

- [CLAUDE.md](CLAUDE.md): detailed architecture, routing, services and feature notes (Turkish)
- [.claude/skills/](.claude/skills/): component, API service and design system guides
