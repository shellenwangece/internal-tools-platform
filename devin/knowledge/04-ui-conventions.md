---
name: ITP — UI conventions for internal apps
trigger: When designing screens or components for an Internal Tools Platform app (itp-app-*)
---
Users are non-engineers (compliance, support, risk staff). Apps should look like one product:
- Use the `src/ui` kit and Tailwind; no other UI libraries. Neutral slate palette, one accent (indigo-600), 14px base text, generous spacing.
- Layout: `Page` with a title and one-line description, then summary `Stat` cards (counts/totals) at top, then the main `Table` or form.
- Tables: sortable columns, a search box, status shown as `Badge` (green = approved/resolved/enabled, amber = pending/in review, red = rejected/failed/disabled), pagination via `total`.
- Money: format with `Intl.NumberFormat('en-US', { style: 'currency', currency })`. Dates: `toLocaleString()` in the user's locale.
- Edits: open a side panel or modal, confirm destructive or status-changing actions, show a success toast and refresh the row.
- Plain language: "Approve refund", not "PATCH status". Empty states explain what will appear. Errors say what to do next.
- Accessible: labelled inputs, keyboard-reachable actions, sufficient contrast.
