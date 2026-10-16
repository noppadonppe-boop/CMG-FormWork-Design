# AI source upload: setup and verified status

## Live analysis stages

The upload screen consumes Firebase callable streaming responses from
`extractGeometry`: authorizing, preparing, analyzing, validating and saving.
Connecting and complete are client states; complete is shown only after the
final response contains a draft. An elapsed timer and failed-stage indicator
remain visible. There are no invented percentages or automatic retries that
could cause a second paid request. Streaming has an explicit 370-second abort
deadline; legacy non-streaming callers still work. Unit tests cover stage order,
display, failure, final-result handling, timeout and no duplicate requests.
Live browser verification on 14 October showed authorizing/preparing completed
and analyzing active with an elapsed timer. This provider request exceeded the
existing 90-second deadline; the UI correctly marked analyzing failed, and Cloud
Logs confirmed TimeoutError. Provider timeout is now mapped to deadline-exceeded
so the UI explains the timeout rather than suggesting a connectivity failure.
The later timeout repair increases provider time to 300 seconds, Function time
to 360 seconds and client time to 370 seconds using shared constants. The active
configuration at diagnosis was gpt-5.6-luna, max effort, with a 4,776-character
additional prompt. No model, effort or prompt settings were changed. Screenshot:
`artifacts/ai-progress-live.png`. The completion path is covered by automated tests.
After deploying the extended deadline, the same file and unchanged max-effort
configuration completed successfully in 96 seconds. All stages reached complete,
the draft was saved and shown in the UI. Evidence: `artifacts/ai-timeout-fixed.png`.

## Additional analysis prompt

Manage API includes a shared optional prompt (up to 10,000 characters) stored
as `settings/ai.prompt`. Saving an empty string clears it; older settings without
the field continue to work. The backend sends this text with the image as user
content for OpenAI, Gemini and Claude, while retaining the base system prompt and
geometry JSON contract. Changing provider/model does not discard the prompt.

Prompt persistence, empty/omitted values, key preservation and all three provider
payloads are tested. Local Firestore rules support this field and passed 80
emulator checks. The active cloud Firestore rules were read before deployment
and are a pre-existing unrestricted `allow read, write: if true` ruleset; this task
does not replace that ruleset, since doing so would change unrelated access and
break legacy email-less accounts. Hosting and extractGeometry are deployed for
the prompt feature; hardening the production rules remains separate work.

## Update: 14 October 2026

The historical setup notes below are superseded by the current source and this
diagnosis. `extractGeometry` is deployed in `asia-southeast1`; it reads provider
keys/models from `RC-FormWork-App/root/settings/ai`, not `OPENAI_VISION_MODEL`
or an `OPENAI_API_KEY` secret binding.

An authenticated browser call returned HTTP 403 with `Managed account required`.
The uploaded file's project metadata matched the project, and the managed account
was approved. Both the callable email claim and the Firebase Auth account email
were missing. The backend now resolves missing email claims through Firebase Auth
using the verified UID and rejects disabled accounts. If Auth also has no email,
it requires exactly one managed profile matching that UID, with its email matching
the profile document ID. Missing, ambiguous or mismatched profiles are rejected. Explicit
view-only access cannot fall back to legacy assigned-project edit access.

The client now distinguishes profile, project, source-path and file-scope errors.
Its timeout is now 370 seconds, exceeding the 360-second server limit. Provider
calls allow 300 seconds. No permission grants or API keys were changed.

Verification: local tests passed, including missing-email authorization,
UID mismatch, disabled accounts, project edit access, cross-project files,
provider response validation and saved analysis. Frontend and Functions builds
passed (167 tests). Deployed the repaired `extractGeometry` and Hosting site
`rc-formwork` on 14 October 2026. A live browser call using the existing uploaded
`Test App.pdf` succeeded with OpenAI `gpt-6.1-sol`: the UI showed the dimension
table and persisted-analysis badge. The model returned `unit: UNKNOWN`; applying
the draft correctly refused automatic unit conversion and requested manual input.
Reloading the browser and reopening the uploaded file restored the saved analysis
without a second provider request. Screenshot: `artifacts/ai-analysis-verified.png`.

Checked on 13 October 2026 (Asia/Bangkok). This records read-only diagnostics;
no Firebase provisioning, deployment, billing change, file upload, or AI provider
request was performed during the check.

## Current configuration

- Frontend project: `calculationeng`.
- Frontend Storage bucket: `calculationeng.firebasestorage.app`.
- Firebase production mode is enabled; emulators are disabled in the local `.env`.
- Callable functions used by the current browser flow: `extractGeometry` and
  `deleteProject`, region `asia-southeast1`.
- File deletion is performed directly by the Firebase Client SDK: the browser deletes
  the selected image, optional original, and Firestore upload record after Storage and
  Firestore Rules authorize the same approved project edit/manage access. The legacy
  `deleteUpload` callable remains in the Functions source only for older clients; the
  current upload screen does not depend on it.
- The server source defaults `OPENAI_VISION_MODEL` to `DISABLED`.
  Only example environment files exist under `functions/` in this checkout.
  Remote secret/model configuration has not been inspected.

Do not substitute `calculationeng.appspot.com` merely to change the suffix.
Use the actual bucket shown in Firebase Console, and ensure the Admin SDK's
default bucket used by the function matches the frontend bucket.

## Read-only evidence

The following requests sent no credentials, file contents, or user data. The
synthetic object name `codex-readonly-probe` was only used in GET/OPTIONS URLs;
no such object was created.

| Request | Result |
| --- | --- |
| GET `https://firebasestorage.googleapis.com/v0/b/calculationeng.firebasestorage.app/o/RC-FormWork-App%2Froot%2Fuploads%2Fcodex-readonly-probe` | HTTP 404; JSON error `Not Found.`; `Access-Control-Allow-Origin: *` |
| OPTIONS `https://firebasestorage.googleapis.com/v0/b/calculationeng.firebasestorage.app/o?name=RC-FormWork-App%2Froot%2Fuploads%2Fcodex-readonly-probe` | HTTP 404; JSON error `Not Found.`; `Access-Control-Allow-Origin: *` |
| GET `https://firebasestorage.googleapis.com/v0/b/calculationeng.appspot.com/o/RC-FormWork-App%2Froot%2Fuploads%2Fcodex-readonly-probe` | HTTP 404; JSON error `Not Found.`; `Access-Control-Allow-Origin: *` |
| GET `https://asia-southeast1-calculationeng.cloudfunctions.net/extractGeometry` | HTTP 404; HTML `Page not found`; no `Access-Control-Allow-Origin` header |

The OPTIONS request used `Origin: http://localhost:5173`,
`Access-Control-Request-Method: POST`, and requested headers
`authorization,content-type,x-firebase-storage-version`.

The missing synthetic object alone cannot prove a bucket is absent. The failed
bucket upload preflight additionally indicates that this endpoint is not ready
for the browser upload. These unauthenticated checks do not distinguish every
provisioning, billing, permission, or service-configuration condition. They do
not establish that changing CORS settings alone will fix the issue.

Existing `firebase-debug.log` gives independent backend evidence:

- Lines 54–56: at `2026-10-13T09:18:04Z` (16:18 Bangkok), the authenticated
  `functions:list` operation requested
  `https://cloudfunctions.googleapis.com/v1/projects/calculationeng/locations/-/functions`.
- The response was HTTP 403 with reason `SERVICE_DISABLED` and service
  `cloudfunctions.googleapis.com`.
- Lines 57–64 report the failed listing. The log states the Cloud Functions API
  had not been used in the project or was disabled at that time.

These log line numbers refer to the diagnostic log as it existed during the
check; later CLI commands may append to or replace it. No authentication tokens
or secrets are reproduced here.

## Required project setup

1. Open [Storage for calculationeng](https://console.firebase.google.com/project/calculationeng/storage).
   Verify Storage has been provisioned and is accessible; copy the actual bucket
   name to `VITE_FIREBASE_STORAGE_BUCKET`. Review any console requirement for
   billing before enabling a paid service. Restart Vite after changing `.env`.
2. Verify `storage.rules` is deployed to that bucket. The current rules require
   an approved account with matching UID/email and project access. Objects must
   carry `projectId` in custom metadata. The upload client already supplies it.
3. Verify the uploaded project's document exists under
   `RC-FormWork-App/root/projects/{projectId}` and that the user's approved
   project assignment/permission is present. Direct file deletion is authorized
   independently by both Storage Rules and Firestore Rules.
4. Enable the Cloud Functions API as appropriate for the project, build the
   Functions workspace, and deploy the `formwork` codebase's `extractGeometry`
   and `deleteProject` functions in `asia-southeast1`. Deploy the legacy
   `deleteUpload` export only when older browser clients still need it. This is
   a required administrator setup action, not an action performed by this repair.
5. Configure a supported server-side `OPENAI_VISION_MODEL` and the Secret Manager
   secret `OPENAI_API_KEY` bound to the function. Keep the key out of Vite
   environment variables, source control, and browser code. The model must
   support the image input and structured output schema used in
   `functions/src/index.ts`.
6. With authorized test content and any paid provider use approved, verify the
   full sequence: select a page/image, upload, analyze, review extracted values,
   and confirm geometry manually. A missing server or provider configuration
   should display a recoverable error and retain the local source preview.

## Client behavior after this repair

- PDF pages are prepared as images before AI upload. The API adapter accepts
  PNG/JPEG up to 5 MiB for analysis and optional originals up to 20 MiB.
- Transfers use the Firebase resumable upload API and report combined byte
  progress for the selected image and original. Cancellation stops the active
  Storage task. SDK retries are limited to 15 seconds and each transfer has a
  60-second overall limit.
- Metadata writes stop blocking the UI after 20 seconds. Firestore does not
  expose cancellation of a queued write, so a previously queued metadata write
  can still complete later. A retry starts a new upload identifier.
- No download URL lookup follows upload; AI receives the stored object path.
- The AI callable client timeout is 130 seconds to allow the 120-second server
  execution limit. Errors identify missing setup, permissions, connectivity,
  and timeouts in Thai. Browser CORS/network failures can appear as
  `functions/internal`; this message asks the administrator to verify the
  service without claiming that any one cause is proven.

Local adapter tests exercise progress, cancellation, stalled transfer/metadata
timeouts, file validation, error handling, and the AI callable timeout. They do
not prove production bucket access, a deployed function, or provider success.
