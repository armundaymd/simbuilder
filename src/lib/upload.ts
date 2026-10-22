import { useEditor } from '../store/editor';
import { fileNameFromLabel, isAcceptedImage, storeImage } from './images';

/** Store dropped/picked/pasted files locally and append them as screens. */
export async function addImageFiles(files: File[]) {
  const images = files.filter(isAcceptedImage).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const skipped = files.length - images.length;
  const recs = [];
  for (const f of images) {
    try {
      recs.push({ rec: await storeImage(f, { optimize: useEditor.getState().project!.settings.optimizeImages }), name: f.name && f.name !== 'image.png' ? fileNameFromLabel(f.name) : `Screen ${useEditor.getState().project!.screens.length + recs.length + 1}` });
    } catch (e) {
      const storage = e instanceof DOMException || (e as Error)?.name === 'QuotaExceededError';
      useEditor
        .getState()
        .setNotice(storage ? `“${f.name}” couldn’t be saved — browser storage is full or unavailable.` : `“${f.name}” couldn’t be read as an image.`);
    }
  }
  useEditor.getState().addScreens(recs);
  if (skipped) useEditor.getState().setNotice(`${skipped} file${skipped > 1 ? 's were' : ' was'} skipped — only PNG, JPG, WebP, GIF and BMP images are supported.`);
}

