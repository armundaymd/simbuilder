// Shared data model for the builder and the player.
// All hotspot geometry is stored as percentages (0–100) of the screenshot's
// natural width/height so it stays aligned at any rendered size.

export type HotspotKind = 'click' | 'text' | 'dropdown' | 'search';
export type HotspotOutcome = 'correct' | 'alternative' | 'incorrect';
export type HotspotAction = 'navigate' | 'popup' | 'tooltip' | 'setField' | 'none' | 'finish';
export type TrainingMode = 'demo' | 'guided' | 'independent' | 'assessment';
export const ALL_MODES: TrainingMode[] = ['demo', 'guided', 'independent', 'assessment'];

export interface SearchResult {
  id: string;
  label: string;
  detail?: string;
}

export interface Hotspot {
  id: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  kind: HotspotKind;
  outcome: HotspotOutcome;
  action: HotspotAction;
  /** navigate: screen to go to after this action succeeds. */
  targetScreenId: string | null;
  /** Shown to the learner when this is the next expected step (falls back to the screen instruction). */
  instruction: string;
  /** Short hint shown on hover. */
  tooltip: string;
  /** Feedback shown after the action (for incorrect hotspots: the error message). */
  feedback: string;
  /** Incorrect hotspots: count the mistake but say nothing, so the learner must notice it themselves. */
  silent: boolean;
  popupTitle: string;
  popupText: string;
  /** setField: which text/dropdown hotspot on this screen receives the value. */
  fieldTargetId: string | null;
  fieldValue: string;
  /** text: accepted answers (any match is correct). */
  answers: string[];
  caseSensitive: boolean;
  placeholder: string;
  /** dropdown: available options and the correct one. */
  options: string[];
  correctOption: string;
  /** search: predefined results, the correct result id. Results show when the query matches `searchTerms`. */
  searchTerms: string[];
  searchResults: SearchResult[];
  correctResultId: string | null;
}

export interface Screen {
  id: string;
  name: string;
  imageId: string;
  width: number;
  height: number;
  instruction: string;
  hotspots: Hotspot[];
}

export interface Project {
  id: string;
  title: string;
  description: string;
  folderId: string | null;
  createdAt: number;
  updatedAt: number;
  startScreenId: string | null;
  screens: Screen[];
  settings: ProjectSettings;
}

export interface ProjectSettings {
  /** Training modes offered to learners (at least one). */
  modes: TrainingMode[];
  /** Downscale/compress screenshots when they're added. */
  optimizeImages: boolean;
}

export interface Folder {
  id: string;
  name: string;
  createdAt: number;
}

export interface ImageRecord {
  id: string;
  blob: Blob;
  width: number;
  height: number;
}

/** The self-contained payload consumed by the player. */
export interface PlayerData {
  project: Project;
  /** imageId → URL (object URL, data URI or relative path). */
  images: Record<string, string>;
}

export interface ScreenResult {
  screenId: string;
  name: string;
  incorrect: number;
  timeMs: number;
}

export interface CompletionResult {
  mode: TrainingMode;
  learnerName: string;
  steps: number;
  incorrect: number;
  /** 0–100 */
  accuracy: number;
  timeMs: number;
  screens: ScreenResult[];
}

export interface PlayerOptions {
  mode?: TrainingMode;
  /** Show the start screen with the mode picker (default true). */
  showIntro?: boolean;
  startScreenId?: string;
  onExit?: () => void;
  /** Called when the learner finishes (used by SCORM exports). */
  onComplete?: (result: CompletionResult) => void;
  /** Pre-fills the learner name (e.g. from an LMS). */
  learnerName?: string;
}
