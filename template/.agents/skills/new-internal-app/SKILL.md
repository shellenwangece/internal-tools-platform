---
name: new-internal-app
description: Build a new Internal Tools Platform app from an approved request (YAML block with app_name, slug, target_repo, grants, requirement) and open a PR. Use whenever a session prompt asks to build an ITP app.
---
## Overview
Build a new internal app for the Internal Tools Platform (ITP) from an approved request, in its own private GitHub repo created from the ITP template, and open a pull request for engineering review. This runs unattended: the requester is a non-engineer and nobody will answer questions during the build.

## What's Needed From User
The session prompt contains a YAML block with: `app_name`, `slug`, `target_repo` (e.g. `shellenwangece/itp-app-refunds-dashboard`), `template_repo`, `audience_teams`, `grants` (list of `{dataset, permission: read|write}`), `requirement` (verbatim plain-language request), and dataset schemas with sample rows.

## Procedure
1. Parse the YAML block. Treat `requirement` as the product brief and `grants` as hard limits.
2. Create the repo from the template: `gh repo create <target_repo> --private --template <template_repo> --clone`. If it already exists and is empty or template-only, reuse it; if it has unrelated code, stop and report it in structured output.
3. Create a branch `feature/initial-app`.
4. Update `mock/grants.json` to match `grants` exactly, and make sure `mock/` has data for every granted dataset.
5. Design the smallest app that fully covers the requirement: main view(s), summary stats, and the edit actions the grants allow. Follow the ITP knowledge notes (app contract, SDK reference, UI conventions).
6. Implement in `src/` using only the SDK and the `src/ui` kit. Hide edit controls for `read`-only datasets.
7. Add Vitest tests that render each main view against the mock SDK and cover one edit flow if any dataset is `write`.
8. Run `npm ci`, `npm run check`, and `npm run build`; fix until all pass and `dist/index.html` exists.
9. Write a short `README.md` section: what the app does, which datasets it uses and how, and any assumptions you made about the requirement.
10. Commit, push, and open a PR to `main` titled `Initial app: <app_name>` whose body lists features, datasets/permissions used, assumptions, and the check results.
11. Return structured output `{repo_url, pr_url, summary}` where `summary` is 2–3 plain-language sentences for a non-engineer.

## Specifications
- PR is open against `main` of `target_repo`; `npm run check` and `npm run build` pass on the PR head.
- The app uses only granted datasets with allowed operations, and contains no network calls, storage APIs, secrets, or server code.
- Structured output is set with real URLs.

## Advice and Pointers
- When the requirement is ambiguous, choose the reasonable interpretation, note it under assumptions in the README and PR, and continue.
- Prefer one polished screen over many thin ones; non-engineers will use this.
- Use sample rows to pick sensible filters and default sort orders (e.g. pending first, newest first).

## Forbidden Actions
- Do not ask the user questions or wait for input; never block on a reply.
- Do not merge the PR, push to `main` directly, or change repo settings/visibility.
- Do not modify `src/platform/`, the ESLint network rules, or the build config's `base: './'`.
- Do not add datasets or permissions beyond `grants`, or call any external API.
- Do not install or enable Superpowers or other plugins in the app repo.
