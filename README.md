# SimBuilder

Build interactive, screenshot-based software training simulations (e.g. EHR
workflows) without writing code, and export them as offline HTML files.

Everything stays on your computer: screenshots are stored in the browser's
local database (IndexedDB) and are never uploaded.

## Run it (macOS)

Requires Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:5173
```

`npm run build` produces a static build in `dist/` (`npm run preview` serves it).

## Teaching people to use it

The builder has a built-in **Guide** (button on the dashboard and in the editor, or `#/help`)
written for non-technical authors, with screenshots. It covers quick start, clickable areas,
building in mistakes, training modes, privacy/redaction, exporting and backups, and has a
**Print / Save as PDF** button so you can hand it out. New simulations also show a
**Getting started** checklist that ticks itself off as the author works.

If the UI changes, refresh the guide's screenshots with `npm run dev` then `npm run help-images`.

## Make a simulation in five minutes

1. **New simulation** → give it a title.
2. **Drop screenshots** onto the window (or paste one with ⌘V). They're added in file-name order.
3. On each screen, **drag a rectangle** over the button/tab/field the learner should click.
   The first area on a screen is automatically the *correct* action and links to the next screen;
   on the last screen it finishes the simulation.
4. Use the right-hand panel to add **instructions**, feedback, tooltips, or turn an area into a
   **text field**, **dropdown** or **search box**. Mark common mistakes as **Incorrect** with feedback.
5. Check the **Workflow** tab (list or diagram) for branches; the **Ready / problems** badge lists
   anything broken (missing destinations, unreachable screens, no way to finish…).
6. **Preview**, then **Export → Standalone HTML**. Send that single file to learners — it opens in any
   modern browser, offline, with no server.

Click **Load EHR example** on the dashboard for a complete synthetic ED workflow
(open chart → Workup → order composer → STAT CBC → Disposition).

### Training modes (choose which ones learners see in **Details**)

| Mode | Behaviour |
|---|---|
| Demonstration | Highlights each step; *Next* performs it |
| Guided practice | Learner acts; next step highlighted; feedback + hints on mistakes |
| Independent practice | Instructions only, no highlights; mistakes tracked |
| Assessment | No instructions, hints or feedback. Records mistakes and time per screen — shows whether a workflow is intuitive |

The end-of-run summary shows time and mistakes per screen, and can be printed as a certificate.

### Built-in mistakes

Mark an area **Incorrect** and set it to **Go to screen** → a "wrong place" screenshot (e.g. the
wrong patient's chart). Tick **Let the learner discover the mistake** to count it without any message.
Give the wrong screen an **Alternative** area (e.g. Back) that returns to the right path; guided mode
highlights it. The EHR example includes one: clicking the wrong patient on the Track Board.

### Privacy and maintenance tools

* **Redact** (canvas toolbar): drag over names, MRNs, dates → black, white or pixelated boxes are
  painted into the image and the original is deleted.
* **Replace screenshot** (screen panel): swap in an updated screenshot after a software upgrade and
  keep all clickable areas.
* **Copy to other screens** (area panel): repeat tabs/menus that appear on every screen.
* Screenshots are **optimized** on upload (max 1920px wide, WebP) to keep exports small.
* The dashboard reminds you to **Back up all** — projects live only in this browser.

### Keyboard shortcuts (editor)

Drag = draw · ⌘D duplicate · ⌫ delete · arrows nudge (⇧ = more) · ⌘Z / ⇧⌘Z undo/redo ·
`[` `]` switch screens · P preview · ? help

## Exports

* **Standalone HTML** — one file with the player, data and screenshots inlined.
* **ZIP** — `index.html`, `player.js`, `data.js`, `assets/`, plus `project.json`.
* **SCORM 1.2** — upload to an LMS; reports completion, score (accuracy) and time.
* **Project JSON** — portable backup; import it from the dashboard to keep editing.
  Import also accepts ZIP files (backups and export packages).

## Development

```bash
npm run typecheck
npm test             # Playwright end-to-end tests (starts the dev server)
npm run example      # regenerate the synthetic EHR screenshots in public/example
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for the design. The player in `src/player/` is
framework-free and is bundled into every export, so preview and exports behave identically.

> Note: the project is a git repository partly because Tailwind's file scanner walks up
> parent folders looking for ignore files; macOS restricts reading `~/Documents`, and a git
> root stops that walk. Keep the `.git` folder if the project lives under `~/Documents`.
