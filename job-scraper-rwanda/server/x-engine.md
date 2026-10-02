# X Engine workbook service

Mount the default router from `./server/x-engine.ts` at `/api/x-engine`, before the frontend fallback. It performs no workbook reads on startup, uses no database, and executes workbook work in a separate Python process only when requested. Scraper routes and workers do not use this service.

## Configuration

- `X_ENGINE_WORKBOOK_PATH`: absolute path to the Excel workbook. The local default is `C:/Users/user/Downloads/Founder_Content_Engine_150_Conversation_Questions.xlsx`.
- `X_ENGINE_PYTHON`: optional Python executable. On Windows, the service uses the bundled Codex Python under the current user's home when available, otherwise `python`. On other platforms the fallback is `python3`.
- The server account needs permission to read the workbook and create, replace and delete files in its directory. Keep the workbook closed in Excel when marking or undoing use.

## API

`GET /api/x-engine` reads the current workbook. `POST /api/x-engine/questions/:id/used` marks a question used with the server's local calendar date. `POST /api/x-engine/questions/:id/unused` restores it and clears its date. All successful responses contain `{ questions, categories, workbookName }`. There is no polling or dependency on scraper state.

Questions use their `Q-ID` values, not their position in the sheet. Each question contains `id`, `question`, `category`, `mechanic`, `audience`, `replyGoal`, `showOff`, `debatePotential`, `platform`, `freshness`, `status`, and `usedOn`.

Errors contain `{ error }` with a readable message. Missing questions return 404, incompatible workbook layouts/statuses return 409, locked or inaccessible files return 423, and missing/unreadable workbooks or an unavailable Python runtime return 503. A failed save never returns an updated payload.

## Save behavior

Requests are serialized independently of scraper execution. An exclusive `.x-engine.lock` file also coordinates multiple server processes. The helper reads the latest workbook, validates IDs and statuses, and patches only K/L cells on the matching row. Other cells remain byte-identical in the worksheet XML; every unrelated ZIP member's content and metadata are retained.

The new workbook is written to a temporary file in the same folder and flushed before replacement. The helper validates it and checks that the original has not changed. The previous workbook is copied to `<workbook>.x-engine.bak` before atomic replacement. This backup stores the most recent pre-save version and is replaced on each successful save attempt. Excel's owner file and OS file locks cause a retryable failure. A concurrent external edit detected before replacement also fails safely; close Excel while using this feature.

A forced process termination can leave a lock file. After confirming no X Engine save process is running, remove that workbook's `.x-engine.lock` file and retry. Normal failures clean up lock and temporary files.

## Validation

Run `python server/x-engine-workbook.test.py` using the configured Python executable. Tests use temporary generated workbooks only; they never modify the linked user workbook. They cover used/undo, preservation, unsupported IDs/actions/statuses, locks, failed atomic replacement, idempotency, and missing files.

This service uses local filesystem access. Hosting it on another machine requires configuring a workbook accessible to that server. The browser cannot update an arbitrary workbook on the user's computer through a hosted server.
