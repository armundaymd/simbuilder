# SimBuilder — Architecture

A local-first, no-backend web app for building screenshot-based software
training simulations, plus a tiny framework-free player that runs the
simulations both inside the builder (preview) and in exported files.

## Key decisions

| Concern | Choice | Why |
|---|---|---|
| App | React 19 + TypeScript + Vite + Tailwind v4 | As specified |
| Editor state | Zustand + Immer, snapshot-based undo/redo | Small, predictable; project JSON is tiny (images live elsewhere) so snapshots are cheap |
| Persistence | IndexedDB via `idb` behind a `Repository` interface | Local by default; a REST-backed repository can be swapped in later |
| Hotspot drawing | Custom pointer-event layer (~200 lines) | All geometry is in percentages; libraries like react-rnd work in pixels and would need conversion on every event. No extra dependency |
| Player | Vanilla TS, built to one IIFE (`src/player`) | The *same* code runs the in-app preview and the exported HTML, so what you preview is exactly what you export |
| Export | Standalone HTML (player + data + base64 images inlined), project JSON (images base64), ZIP (`index.html`, `player.js`, `data.js`, `assets/`) via `fflate` | Works from `file://`, offline, no server |
| Tests | Playwright | As specified |

## Data model (`src/types.ts`)

```
Project  { id, title, description, folderId, createdAt, updatedAt,
           startScreenId, screens: Screen[] }
Screen   { id, name, imageId, width, height, instruction, hotspots: Hotspot[] }
Hotspot  { id, name, x, y, w, h        // percentages 0–100 of the image
           kind:    click | text | dropdown | search
           outcome: correct | alternative | incorrect
           action:  navigate | popup | tooltip | setField | none | finish
           targetScreenId, instruction, tooltip, feedback, popupTitle/Text,
           fieldTargetId, fieldValue, answers[], options[], correctOption,
           searchResults[], correctResult }
Folder   { id, name }
ImageRecord { id, blob, width, height }   // stored separately from projects
```

* **Coordinates are percentages** of the screenshot's natural size, so hotspots
  stay aligned at any rendered size. The stage always preserves the image's
  aspect ratio.
* **Correct** hotspots on a screen are expected *in list order* (e.g. "pick
  priority", then "Sign"). **Alternative** hotspots are valid branches that are
  never highlighted and never count as errors. **Incorrect** hotspots show
  feedback and count as an error (and may still navigate, e.g. to a feedback
  screen).
* Clicking where there is no hotspot counts as an incorrect click.

## Modules

```
src/types.ts              shared model (builder + player)
src/lib/db.ts             IndexedDB repository (projects, folders, images)
src/lib/images.ts         upload/decode screenshots, object-URL cache
src/lib/validate.ts       broken links, unreachable screens, no path to finish, …
src/lib/export.ts         HTML / JSON / ZIP export + JSON import
src/lib/example.ts        loads the bundled synthetic EHR example
src/store/editor.ts       editor state, undo/redo, autosave
src/player/               framework-free player (built to player.iife.js)
src/components/dashboard  projects, folders
src/components/editor     screen list, canvas + hotspot layer, properties, flow view
scripts/generate-example.mjs  renders synthetic EHR mockups → PNG + hotspot JSON
tests/e2e                 Playwright tests
```

## Training modes (player)

* **Demonstration** — highlights the expected hotspot, shows instructions, a
  "Next" button performs the step.
* **Guided practice** — learner must act; next action is highlighted; feedback
  on incorrect clicks.
* **Independent practice** — no highlighting; incorrect clicks and time are
  tracked; summary at the end.

## Privacy

Screenshots never leave the machine: no network calls, no external services,
no CDN assets in exports. The example uses entirely synthetic patient data.

## Adding a backend later

Implement the `Repository` interface in `src/lib/db.ts` against an API and swap
it in `getRepository()`. The model is plain JSON plus image blobs keyed by id.
