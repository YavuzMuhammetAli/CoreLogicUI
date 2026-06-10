# CoreLogicUI — Angular Frontend for CoreLogic Platform

## Project Overview

CoreLogicUI is the Angular 18 frontend for the **CoreLogic** dynamic model publishing platform. The backend is an ASP.NET Core 8.0 Web API (`C:\CoreLogic\CoreLogic-master`) that compiles C# entity code at runtime via Roslyn and exposes dynamic CRUD endpoints.

This UI is in an **early but functional stage**. The primary goal is to provide a metadata-driven interface where users can:

- Build dynamic entity schemas (define columns with names, types, and nullable flags)
- Trigger database operations (create DB, check schema, create tables)
- Publish C# model code to the backend
- Interact with dynamically created table data via CRUD forms

The frontend maps directly to the backend's Result pattern and API surface.

## Tech Stack

| Component | Technology |
|---|---|
| **Framework** | Angular 18.1 (standalone components) |
| **Language** | TypeScript 5.5 |
| **Styling** | Bootstrap 5.3.3, SCSS |
| **Rendering** | Angular SSR (`@angular/ssr`, prerender enabled) |
| **Forms** | Angular Reactive Forms |
| **Testing** | Karma + Jasmine |
| **Build Tool** | Angular CLI 18 / `@angular-devkit/build-angular` |
| **SSR Server** | Express 4.x |

## Project Structure

```
CoreLogicUI-master/
├── angular.json                     # Angular CLI config (project name: CoreLogicUI)
├── package.json                     # npm dependencies & scripts
├── tsconfig.json                    # Base TypeScript config
├── tsconfig.app.json                # Browser build TS config
├── tsconfig.spec.json               # Test TS config
├── server.ts                        # Express SSR server entry point
└── src/
    ├── index.html                   # App shell HTML
    ├── main.ts                      # Browser bootstrap (AppComponent + appConfig)
    ├── main.server.ts               # SSR bootstrap
    ├── styles.scss                  # Global styles (Bootstrap imported here)
    └── app/
        ├── app.component.ts         # Root shell — selector: app-root, uses RouterOutlet
        ├── app.component.html
        ├── app.component.scss
        ├── app.routes.ts            # Route table: '' → FormBuildComponent
        ├── app.config.ts            # Browser providers: provideRouter, provideClientHydration
        ├── app.config.server.ts     # SSR-specific providers (merges with appConfig)
        ├── components/
        │   ├── form-build/          # Dynamic column builder (ReactiveForms)
        │   │   ├── form-build.component.ts
        │   │   ├── form-build.component.html
        │   │   └── form-build.component.scss
        │   └── database-proccess/   # DB operations stub (not yet routed)
        │       ├── database-proccess.component.ts
        │       ├── database-proccess.component.html
        │       └── database-proccess.component.scss
        └── models/
            ├── responseModel.ts     # ResponseModel { success: boolean, message: string }
            └── responseModelList.ts # ListResponseModel<T> extends ResponseModel { data: T[] }
```

## Components

### `FormBuildComponent` (src/app/components/form-build/)
A reactive form that lets users define a dynamic table schema column by column.

- `tableForm`: `FormGroup` containing a `FormArray` named `columns`
- Each column group has: `columnName` (string), `dataType` (string), `isNullable` (boolean)
- Available data types: `string`, `int`, `float`, `datetime`, `boolean`
- `addColumn()` / `removeColumn(index)` for managing the column list
- `onSubmit()` currently only `console.log`s the form value — **not yet wired to the backend**

**Current status:** UI is complete; needs `HttpClient` integration to call `/Published/addTable` + `/Published/addMember`.

### `DatabaseProccessComponent` (src/app/components/database-proccess/)
Empty stub component. Intended to wrap `/Database` endpoint operations (`createdatabase`, `checkdatabase`, `createtable`).

**Current status:** Not routed, no logic. Add to `app.routes.ts` and implement when backend calls are ready.

## Models

### `ResponseModel` (src/app/models/responseModel.ts)
```typescript
export interface ResponseModel {
    success: boolean;
    message: string;
}
```
Maps to backend `IResult` → `{ Success, Message }`.

### `ListResponseModel<T>` (src/app/models/responseModelList.ts)
```typescript
export interface ListResponseModel<T> extends ResponseModel {
    data: T[];
}
```
Maps to backend `IDataResult<T>` → `{ Success, Message, Data }`.

## Backend Integration

| Backend | Value |
|---------|-------|
| HTTP port | `http://localhost:5245` |
| HTTPS port | `https://localhost:7254` |
| CORS policy | `AllowAll` — direct calls from `localhost:4200` work without proxy |
| Swagger | `http://localhost:5245/swagger` |

### To enable HTTP calls — add `provideHttpClient` to `app.config.ts`:
```typescript
import { provideHttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideClientHydration(),
    provideHttpClient()   // ← add this
  ]
};
```

### Key backend endpoints to integrate

| UI Component | Backend Endpoint | Description |
|---|---|---|
| `FormBuildComponent` | `POST /Published/addTable` | Register table metadata |
| `FormBuildComponent` | `POST /Published/addMember` | Add column metadata |
| `DatabaseProccessComponent` | `GET /Database/createdatabase` | Init DB schema |
| `DatabaseProccessComponent` | `GET /Database/checkdatabase` | Sync schema |
| `DatabaseProccessComponent` | `GET /Database/createtable` | Create dynamic tables |
| (future) | `POST /PublishModel` | Submit C# entity code |
| (future) | `GET /PublishedModel/getall` | List dynamic records |

## Development

### Prerequisites
- Node.js 18+
- Angular CLI 18: `npm install -g @angular/cli`

### Running the App
```bash
# Install dependencies (first time or after changes to package.json)
npm install

# Start dev server → http://localhost:4200 (hot-reload)
npm start

# Or equivalently:
ng serve
```

### Other Scripts
```bash
npm run build                    # Production build → dist/core-logic-ui/
npm run watch                    # Dev build with file watching
npm test                         # Run Karma/Jasmine unit tests
npm run serve:ssr:CoreLogicUI    # Run SSR production server (after npm run build)
```

### Adding a New Component
```bash
ng generate component components/<name>
```
Then register the route in `src/app/app.routes.ts`.

## Conventions & Patterns

- **Standalone components** — no NgModules; all components use `standalone: true`
- **SCSS** — all component styles use `.scss`; `inlineStyleLanguage: scss` is set globally
- **Selector prefix** — `app` (e.g., `app-form-build`, `app-database-proccess`)
- **Reactive Forms** — use `FormBuilder` + `FormGroup`/`FormArray`; no template-driven forms
- **Response types** — always use `ResponseModel` or `ListResponseModel<T>` for backend calls
- **Turkish comments & messages** — consistent with backend codebase (e.g., `// Kolon adı`, `// Veri tipi`)
- **No services yet** — HTTP calls will go into injectable Angular services in `src/app/services/`

## Known Gaps & TODOs

1. **`provideHttpClient()` missing** — add to `app.config.ts` before any HTTP calls
2. **`FormBuildComponent.onSubmit()` not connected** — needs service calls to `/Published/addTable` + `/Published/addMember`
3. **`DatabaseProccessComponent` is empty** — implement and add to routes
4. **No routing beyond `''`** — add routes for database ops, published model CRUD, etc.
5. **No auth UI** — backend has `/Auth/register` and `/Auth/login` but JWT is not active yet
6. **No environment files** — create `src/environments/environment.ts` with `apiUrl` pointing to backend
7. **No Angular services** — create `src/app/services/` with `HttpClient`-based service classes
