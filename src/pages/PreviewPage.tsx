import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/ui/ui';
import { getRepository } from '../lib/db';
import { imageUrlsFor } from '../lib/images';
import { navigate } from '../lib/router';
import { mount } from '../player/player';

/** Runs the exact same player that exported files use. */
export default function PreviewPage({ id, screenId }: { id: string; screenId?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let handle: { destroy(): void } | undefined;
    let live = true;
    (async () => {
      const project = await getRepository().getProject(id);
      if (!live) return;
      if (!project) return setError('This simulation couldn’t be found.');
      if (!project.screens.length) return setError('Add at least one screenshot before previewing.');
      const images = await imageUrlsFor(project);
      if (!live || !ref.current) return;
      handle = mount(ref.current, { project, images }, { startScreenId: screenId, showIntro: !screenId, onExit: () => (history.length > 1 ? history.back() : navigate(`/edit/${id}`)) });
    })();
    return () => {
      live = false;
      handle?.destroy();
    };
  }, [id, screenId]);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 bg-slate-800 px-4 py-1.5 text-xs text-slate-200">
        <span className="font-semibold tracking-wide uppercase">Preview</span>
        <span className="text-slate-400">This is exactly what learners will see in the exported file.</span>
        <div className="flex-1" />
        <Button size="sm" variant="secondary" onClick={() => navigate(`/edit/${id}`)}>
          Back to editor
        </Button>
      </div>
      {error ? <p className="p-8 text-center">{error}</p> : <div ref={ref} className="min-h-0 flex-1" />}
    </div>
  );
}
