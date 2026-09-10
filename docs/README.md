# Marky documentation

Read in this order when starting work:

| Document | Purpose | Update when |
| --- | --- | --- |
| [`PRODUCT_VISION.md`](./PRODUCT_VISION.md) | What Marky is for: the personalization goal, core loop, and guiding principle. The north star every change is judged against. | The product direction itself changes. |
| [`MARKY_PROJECT_SPEC.md`](./MARKY_PROJECT_SPEC.md) | The V1 engineering baseline: scope, ranking formulas, schema, API contract, security rules, UX, and acceptance tests. Its opening status note lists where the implementation has diverged. | A requirement is added, removed, or intentionally changed. Add the divergence to the status note if the body is not rewritten. |
| [`PROGRESS.md`](./PROGRESS.md) | Current state: what is built per milestone, the latest verification results, the gap against the vision, and required external setup. | After any material change, and whenever the verification commands are run for a handoff. |
| [`NEW_UPDATES.md`](./NEW_UPDATES.md) | Dated change log, newest first, in a fixed Added / Changed / Fixed / Security / Known limitations format. | Every material product or engineering change. |
| [`SOURCE_INGESTION.md`](./SOURCE_INGESTION.md) | Actual source-access record: configured endpoints, adapter behavior, topic mapping, update strategy, official verification sources, and limitations. | A source, endpoint, access method, or ingestion behavior changes. |

## Maintenance rules

- Keep project documentation in this folder. Root-level Markdown files are reserved for repository guidance (`README.md`, `AGENTS.md`, and tool-specific instruction files such as `Codex/agent.md`).
- Do not restate one document inside another. Link to it instead.
- Use absolute dates (`2026-09-04`), never "today" or "last week".
- Never record secrets, tokens, Vault values, or private user data in any document.
- When a document and the code disagree, fix the document in the same change that touched the code, or note the divergence in the spec's status note.
