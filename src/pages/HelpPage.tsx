import type { ReactNode } from 'react';
import { Icon } from '../components/ui/Icon';
import { Button } from '../components/ui/ui';
import { navigate } from '../lib/router';

// The author's guide. Written for people building simulations, not developers.
// Screenshots come from `npm run help-images` (public/help).

const SECTIONS: { id: string; title: string; body: ReactNode }[] = [
  {
    id: 'quick-start',
    title: 'Quick start (10 minutes)',
    body: (
      <>
        <p>A simulation is a set of screenshots with clickable areas drawn on top. Learners click through them as if they were using the real software.</p>
        <Steps
          items={[
            <>
              On the dashboard, click <B>New simulation</B>, give it a title and click <B>Create</B>.
            </>,
            <>
              <B>Add screenshots</B>: drag image files onto the window, paste a screenshot with <K>⌘V</K>, or click <B>Choose screenshots</B>. They’re added in file-name order (name them <code>01</code>, <code>02</code>… to control the order).
            </>,
            <>
              On each screen, <B>drag a rectangle</B> over the button, tab or field the learner should click. The first area you draw is automatically the <B>correct</B> action and is linked to the <B>next screen</B>. On the last screen it <B>finishes</B> the simulation.
            </>,
            <>
              Click a screen’s thumbnail (or empty space on the screenshot) and type an <B>instruction</B> in the right-hand panel, e.g. “Open the patient’s chart by clicking their name.”
            </>,
            <>
              Check the badge at the top right. <Pill tone="green">Ready</Pill> means everything is connected. If it shows problems, click it and choose a problem to jump to it.
            </>,
            <>
              Click <B>Preview</B> and try it as a learner. When you’re happy, click <B>Export → Standalone HTML</B> and send that one file to learners.
            </>,
          ]}
        />
        <Figure src="editor.png" caption="The editor: screens on the left, the screenshot in the middle, settings for the selected screen or area on the right." />
        <Tip>
          Your work saves automatically while you edit (“All changes saved” at the top). There’s no Save button to remember.
        </Tip>
      </>
    ),
  },
  {
    id: 'capturing',
    title: 'Taking good screenshots',
    body: (
      <>
        <ul>
          <li>
            <B>Use a training or test environment with fake patients</B> whenever you can. Then there’s no patient information to worry about.
          </li>
          <li>Keep the software window the <B>same size</B> for every screenshot so the screens feel continuous.</li>
          <li>
            On a Mac, <K>⌘⌃⇧4</K> copies a selected area to the clipboard; then click in the editor and press <K>⌘V</K>. <K>⌘⇧4</K> then <K>Space</K> captures a whole window.
          </li>
          <li>Take a screenshot of <B>every state</B> the learner sees: menus open, dialogs open, fields filled in, etc. Each becomes a screen.</li>
          <li>Large screenshots are automatically shrunk and compressed so exported files stay small enough to email.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'areas',
    title: 'Clickable areas',
    body: (
      <>
        <p>
          <B>Draw</B> by dragging on the screenshot. <B>Move</B> an area by dragging it, <B>resize</B> with its handles, and use the arrow keys to nudge it. Select an area to see its settings on the right.
        </p>
        <Figure src="area-settings.png" caption="Settings for a dropdown area: the options, the correct choice, what happens next, and guidance for the learner." narrow />
        <h4>Is this the right thing to do?</h4>
        <ul>
          <li>
            <Pill tone="green">Correct</Pill> The step learners should take. Highlighted in guided practice. If a screen has several correct areas (e.g. pick a priority, <i>then</i> click Sign), learners must do them <B>in the order listed</B> in the screen panel. Use the arrows there to reorder.
          </li>
          <li>
            <Pill tone="blue">Alternative</Pill> Also allowed, like a shortcut or a “Back” button. Never highlighted and never counted as a mistake.
          </li>
          <li>
            <Pill tone="red">Incorrect</Pill> A common mistake. Counts as an error and shows your feedback (see <Jump to="mistakes">Building in mistakes</Jump>).
          </li>
        </ul>
        <p>Clicking anywhere that isn’t a clickable area also counts as a mistake.</p>
        <h4>What kind of control is this?</h4>
        <ul>
          <li>
            <B>Click</B> – buttons, tabs, links, menu items, rows, checkboxes.
          </li>
          <li>
            <B>Text entry</B> – the learner types into the area and presses Enter. List every answer you’ll accept, one per line. Capitals and extra spaces are ignored unless you tick “case-sensitive”.
          </li>
          <li>
            <B>Dropdown</B> – clicking opens a list of options you define; choose which one is correct.
          </li>
          <li>
            <B>Search box</B> – the learner types a search; your results appear when it matches one of your search words. Pick the correct result.
          </li>
        </ul>
        <Tip>Draw text, dropdown and search areas exactly over the empty field in the screenshot. What the learner types or picks appears inside that area.</Tip>
        <h4>What happens next?</h4>
        <ul>
          <li>
            <B>Go to screen</B> – the most common. Use the <B>Next</B> button beside the list to pick the following screen.
          </li>
          <li>
            <B>Show a popup message</B> – e.g. “Order signed”. Optionally go to a screen when it’s closed.
          </li>
          <li>
            <B>Show a tooltip</B> – a short note beside the area.
          </li>
          <li>
            <B>Set a field value</B> – fills text into another area on the same screen (e.g. clicking “Today” fills a date).
          </li>
          <li>
            <B>Stay on this screen</B> – used for a step that’s followed by another step on the same screen.
          </li>
          <li>
            <B>Finish the simulation</B> – shows the learner their summary. Every simulation needs at least one.
          </li>
        </ul>
        <h4>Saving time</h4>
        <ul>
          <li>
            <B>Duplicate</B> an area with <K>⌘D</K>. <B>Delete</B> with <K>Delete</K>. <B>Undo</B> with <K>⌘Z</K>.
          </li>
          <li>
            Tabs and menus that appear on every screen: select the area and use <B>Copy to other screens</B> (the stacked-layers button). Copying it as an <i>Alternative</i> means clicking it is never a mistake.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'mistakes',
    title: 'Building in mistakes',
    body: (
      <>
        <p>Real learning often comes from going to the wrong place and noticing. You can recreate that:</p>
        <Steps
          items={[
            <>Add a screenshot of the “wrong place”, for example the wrong patient’s chart.</>,
            <>
              On the screen where the mistake happens, draw an area over the tempting wrong choice and mark it <Pill tone="red">Incorrect</Pill>.
            </>,
            <>
              Set <B>After the mistake</B> to <B>Go to screen</B> → your wrong-place screenshot.
            </>,
            <>
              Tick <B>Let the learner discover the mistake</B> if you don’t want any message. It still counts as an error. Leave it unticked to show your feedback right away.
            </>,
            <>
              On the wrong-place screen, draw a way back (a Back button, a menu link) and mark it <Pill tone="blue">Alternative</Pill>, going to the right screen. Guided practice highlights it; other modes don’t.
            </>,
          ]}
        />
        <Figure src="mistake.png" caption="The wrong-patient mistake in the EHR example: it opens the other patient’s chart with no message." narrow />
      </>
    ),
  },
  {
    id: 'modes',
    title: 'Training modes',
    body: (
      <>
        <p>Learners choose a mode when they start. In <B>Details</B> (next to the title) you choose which modes they’re offered.</p>
        <table>
          <thead>
            <tr>
              <th>Mode</th>
              <th>What the learner sees</th>
              <th>Use it for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Demonstration</td>
              <td>Each step highlighted with instructions; a Next button performs it.</td>
              <td>First exposure (“watch me”).</td>
            </tr>
            <tr>
              <td>Guided practice</td>
              <td>Instructions and highlights; immediate feedback and hints on mistakes.</td>
              <td>Learning the steps.</td>
            </tr>
            <tr>
              <td>Independent practice</td>
              <td>Instructions only, no highlights. Mistakes counted.</td>
              <td>Practice before going live.</td>
            </tr>
            <tr>
              <td>Assessment</td>
              <td>No instructions, highlights, hints or feedback, just like the real software.</td>
              <td>Checking competence, or testing whether a workflow is intuitive.</td>
            </tr>
          </tbody>
        </table>
        <p>
          At the end, every mode shows a summary: steps, mistakes, accuracy, total time, and <B>time and mistakes on each screen</B> (screens where someone struggled are shaded). Learners can type their name and <B>print a certificate</B>.
        </p>
        <Figure src="modes.png" caption="What learners see first: your description and the modes you’ve offered." />
        <Tip>For an assessment, put the task in the simulation’s description (Details), e.g. “Order a STAT CBC for Alex Testpatient and discharge them.” It’s shown before they start.</Tip>
      </>
    ),
  },
  {
    id: 'workflow',
    title: 'Checking the workflow',
    body: (
      <>
        <p>
          Click <B>Workflow</B> at the top to see how screens connect. The <B>List</B> view shows every area and where it goes; you can change destinations right there. The <B>Diagram</B> view is a map: green arrows are correct steps, dashed blue are alternatives, red are mistakes that go somewhere.
        </p>
        <Figure src="workflow-list.png" caption="Workflow list: every area on every screen and its destination." />
        <Figure src="workflow-diagram.png" caption="Workflow diagram. Screens no one can reach have a dashed orange border." />
        <p>The problems badge warns you about:</p>
        <ul>
          <li>areas that go nowhere, or to a screen that was deleted (deleting a screen clears links to it so nothing breaks silently);</li>
          <li>screens no one can reach from the start screen;</li>
          <li>no way to finish;</li>
          <li>text, dropdown or search areas with no correct answer.</li>
        </ul>
        <p>You can’t export for learners until the problems (red) are fixed. Warnings (orange) are fine to ignore if they’re intentional.</p>
      </>
    ),
  },
  {
    id: 'privacy',
    title: 'Patient privacy and redaction',
    body: (
      <>
        <p>Everything stays on this computer. Screenshots are never uploaded anywhere, and exported files contain only what you put in them.</p>
        <p>
          If a screenshot shows real patient information, click <B>Redact</B> above the screenshot, drag over names, MRNs, dates of birth and so on, choose black, white or pixelated, and click <B>Apply</B>.
        </p>
        <Figure src="redact.png" caption="Redact mode: drag boxes over identifying details, then apply." />
        <ul>
          <li>Redaction is permanent: the boxes are painted into the image and the original is deleted from this computer.</li>
          <li>
            Redact <B>before</B> you duplicate, back up or export. Files you exported earlier still contain the original, so delete them.
          </li>
          <li>Black or white boxes are the safest. Pixelation uses large blocks, but solid boxes leave nothing to reconstruct.</li>
          <li>Check your organization’s policy before storing any patient information on this computer at all. Test environments with fake patients avoid the issue entirely.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'updating',
    title: 'When the software changes',
    body: (
      <>
        <p>
          After an upgrade, select the screen and click <B>Replace screenshot…</B> in the right-hand panel. The new image takes its place and all clickable areas and connections are kept. If the new screenshot is a different shape, you’ll be reminded to check that the areas still line up. Drag them into place if needed.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Exporting and sharing',
    body: (
      <>
        <Figure src="export.png" caption="The export window. Problems are listed at the top." narrow />
        <table>
          <thead>
            <tr>
              <th>Format</th>
              <th>Choose it when…</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Standalone HTML</td>
              <td>You want one file to email, put on a shared drive or intranet. Learners double-click it; it works in any modern browser, offline.</td>
            </tr>
            <tr>
              <td>ZIP package</td>
              <td>The single file is too large for email, or a web team will host it. Unzip and open <code>index.html</code>.</td>
            </tr>
            <tr>
              <td>SCORM package</td>
              <td>You need completion tracked in a learning management system (LMS). Upload the ZIP as a SCORM 1.2 course. It reports completion, score (accuracy) and time. Try it in your LMS before rolling out.</td>
            </tr>
            <tr>
              <td>Project file (JSON)</td>
              <td>A backup, or to give the editable simulation to another author. Import it from the dashboard.</td>
            </tr>
          </tbody>
        </table>
        <Tip>Before sending to learners, open the exported file yourself on the kind of computer they’ll use, and complete it once in each mode you’ve offered.</Tip>
      </>
    ),
  },
  {
    id: 'organizing',
    title: 'Organizing and backing up',
    body: (
      <>
        <ul>
          <li>Use <B>folders</B> on the dashboard (Emergency Department, Ambulatory…). Change a simulation’s folder from the menu on its card. Click the pencil beside a folder to rename or delete it.</li>
          <li>
            <B>Duplicate</B> a simulation to make a variation (e.g. the same workflow for a different department).
          </li>
          <li>
            <B>Back up regularly.</B> Simulations are stored in this browser only. Clearing browsing data, or a private window, would lose them. When the dashboard shows the backup reminder, click <B>Back up all</B> and keep the ZIP on a shared or backed-up drive. To restore, click <B>Import project</B> and choose that ZIP.
          </li>
          <li>
            To move to another computer or share with a colleague: back up (or export a Project file), then <B>Import project</B> on the other computer.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'shortcuts',
    title: 'Keyboard shortcuts',
    body: (
      <table>
        <tbody>
          {[
            ['Drag on screenshot', 'Draw a clickable area'],
            ['Arrow keys (⇧ for bigger steps)', 'Nudge the selected area'],
            ['⌘D / Delete', 'Duplicate / delete the selected area'],
            ['Esc', 'Deselect'],
            ['⌘Z / ⇧⌘Z', 'Undo / redo'],
            ['[ and ]', 'Previous / next screen'],
            ['⌘V', 'Paste a screenshot as a new screen'],
            ['P', 'Preview from the current screen'],
            ['?', 'Show shortcuts in the editor'],
          ].map(([k, v]) => (
            <tr key={k}>
              <td className="font-mono text-xs whitespace-nowrap">{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    ),
  },
  {
    id: 'troubleshooting',
    title: 'Troubleshooting',
    body: (
      <dl>
        <dt>Learners say clicking the right thing doesn’t work.</dt>
        <dd>
          The area may be the wrong shape, or a step must happen first. Correct areas on one screen must be done in order. Use <B>Preview from here</B> to test that screen.
        </dd>
        <dt>Export buttons are greyed out.</dt>
        <dd>There are problems to fix. They’re listed at the top of the export window; click “Show me” to jump to each one.</dd>
        <dt>The exported file is too big to email.</dt>
        <dd>
          In <B>Details</B>, click <B>Optimize existing screenshots</B>. If it’s still too large, use the ZIP package or put the file on a shared drive.
        </dd>
        <dt>“Couldn’t save — browser storage is full or unavailable.”</dt>
        <dd>You may be in a private window, or the disk is full. Use a normal browser window and back up your work.</dd>
        <dt>My simulations disappeared.</dt>
        <dd>Browsing data was probably cleared, or you’re in a different browser. Import your latest backup ZIP.</dd>
      </dl>
    ),
  },
];

export default function HelpPage() {
  const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2 print:hidden">
        <Button variant="ghost" icon="back" onClick={() => (history.length > 1 ? history.back() : navigate('/'))}>
          Back
        </Button>
        <h1 className="text-base font-semibold">SimBuilder guide</h1>
        <div className="flex-1" />
        <Button icon="download" onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </header>
      <div className="flex min-h-0 flex-1 print:block">
        <nav className="w-60 flex-none overflow-auto border-r border-slate-200 bg-white p-3 print:hidden" aria-label="Guide sections">
          {SECTIONS.map((s) => (
            <button key={s.id} className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100" onClick={() => jump(s.id)}>
              {s.title}
            </button>
          ))}
        </nav>
        <main className="help min-w-0 flex-1 overflow-auto px-8 py-8 print:overflow-visible print:p-0" id="help-scroll">
          <div className="mx-auto max-w-3xl">
            <h1 className="mb-1 text-2xl font-semibold">How to build a training simulation</h1>
            <p className="mb-8 text-slate-600">For anyone creating simulations in SimBuilder. No technical knowledge needed.</p>
            {SECTIONS.map((s) => (
              <section key={s.id} id={s.id} className="mb-12 scroll-mt-4 break-inside-avoid-page">
                <h2>{s.title}</h2>
                {s.body}
              </section>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}

function B({ children }: { children: ReactNode }) {
  return <strong className="font-semibold text-slate-900">{children}</strong>;
}

function K({ children }: { children: ReactNode }) {
  return <kbd className="rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono text-xs">{children}</kbd>;
}

function Pill({ tone, children }: { tone: 'green' | 'blue' | 'red'; children: ReactNode }) {
  const c = { green: 'bg-emerald-100 text-emerald-800', blue: 'bg-blue-100 text-blue-800', red: 'bg-red-100 text-red-800' }[tone];
  return <span className={`rounded px-1.5 py-0.5 text-xs font-semibold ${c}`}>{children}</span>;
}

function Steps({ items }: { items: ReactNode[] }) {
  return (
    <ol className="my-4 space-y-3">
      {items.map((it, i) => (
        <li key={i} className="flex gap-3">
          <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-blue-600 text-xs font-semibold text-white">{i + 1}</span>
          <span className="pt-0.5">{it}</span>
        </li>
      ))}
    </ol>
  );
}

function Figure({ src, caption, narrow }: { src: string; caption: string; narrow?: boolean }) {
  return (
    <figure className={`my-5 break-inside-avoid ${narrow ? 'max-w-xs' : ''}`}>
      <img src={`${import.meta.env.BASE_URL}help/${src}`} alt={caption} className="w-full rounded-lg border border-slate-200 shadow-sm" loading="lazy" />
      <figcaption className="mt-2 text-xs text-slate-500">{caption}</figcaption>
    </figure>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <div className="my-4 flex gap-2 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
      <Icon name="sparkle" className="mt-0.5 h-4 w-4 flex-none" />
      <div>{children}</div>
    </div>
  );
}

function Jump({ to, children }: { to: string; children: ReactNode }) {
  return (
    <button className="font-medium text-blue-700 underline" onClick={() => document.getElementById(to)?.scrollIntoView({ behavior: 'smooth' })}>
      {children}
    </button>
  );
}
