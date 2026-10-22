import { navigate } from '../../lib/router';
import { Button, Modal } from '../ui/ui';

const SHORTCUTS: [string, string][] = [
  ['Drag on screenshot', 'Draw a clickable area'],
  ['Drag area / handles', 'Move / resize'],
  ['Arrow keys', 'Nudge selected area (Shift = bigger steps)'],
  ['⌘D', 'Duplicate selected area'],
  ['Delete / Backspace', 'Delete selected area'],
  ['Esc', 'Deselect'],
  ['⌘Z / ⇧⌘Z', 'Undo / redo'],
  ['[ / ]  or  PgUp / PgDn', 'Previous / next screen'],
  ['⌘V', 'Paste a screenshot as a new screen'],
  ['P', 'Preview from the current screen'],
  ['⌘S', 'Save now (changes also save automatically)'],
  ['?', 'Show this help'],
];

export function ShortcutsHelp({ onClose }: { onClose: () => void }) {
  return (
    <Modal
      title="Keyboard shortcuts"
      onClose={onClose}
      footer={
        <>
          <Button onClick={() => navigate('/help')}>Open the full guide</Button>
          <Button onClick={onClose}>Close</Button>
        </>
      }
    >
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k} className="border-b border-slate-100 last:border-0">
              <td className="py-1.5 pr-4 font-mono text-xs whitespace-nowrap text-slate-700">{k}</td>
              <td className="py-1.5 text-slate-600">{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
