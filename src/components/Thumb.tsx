import { useEffect, useState } from 'react';
import { imageUrl } from '../lib/images';

export function useImageUrl(id: string | undefined) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let live = true;
    if (id) imageUrl(id).then((u) => live && setUrl(u));
    else setUrl('');
    return () => {
      live = false;
    };
  }, [id]);
  return url;
}

export function Thumb({ imageId, className = '' }: { imageId?: string; className?: string }) {
  const url = useImageUrl(imageId);
  return (
    <div className={`overflow-hidden bg-slate-100 ${className}`}>
      {url && <img src={url} alt="" className="h-full w-full object-cover object-top" draggable={false} />}
    </div>
  );
}
