# Feature code and Firebase data boundary

Firebase SDK calls are centralized in `js/firebase-data.js`. Feature files may
call `firebaseRead`, `firebaseTransaction`, `firebasePushKey`,
`auditedFirebaseUpdate`, and `appendFirebaseAudit`; they must not call
`window.firebaseDb.ref(...)` directly.

`index.html` contains page markup and declarative `data-view-*` event
attributes. Event dispatch lives in `js/views/app-events.view.js`. Shared
styles live in `css/style.css`; page-specific rendering belongs in
`js/views/`; data normalization and business-facing operations belong in
`js/services/` or feature services.

Keep these responsibilities separate when changing a feature:

- UI and rendering: feature templates, DOM updates, and event handlers.
- Business behavior: validation, permissions, record transformations, and
  transaction update callbacks.
- Data access: Firebase SDK calls and audit persistence in
  `js/firebase-data.js`.

Design-only work should stay in CSS and the rendering portions of a feature.
Do not change database paths, record keys, field names, transaction conditions,
soft-delete behavior, or audit events as part of a visual change. Any future
schema or migration work must be reviewed separately and verified against a
backup in staging before production use.

The core Members, Rentals, Attendance, Agenda, and Activity Reports feature
files still contain both view/controller behavior and parts of their business
workflows. Their raw Firebase SDK access is now centralized, but they have not
all been migrated into separate `*.view.js` and `*.service.js` files yet. Keep
new work within the boundaries above until each feature can be split and
reviewed independently.
