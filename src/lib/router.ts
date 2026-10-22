import { useEffect, useState } from 'react';

export type Route = { name: 'dashboard' } | { name: 'help' } | { name: 'edit'; id: string } | { name: 'preview'; id: string; screen?: string };

function parse(hash: string): Route {
  const [path, query] = hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const params = new URLSearchParams(query);
  if (parts[0] === 'help') return { name: 'help' };
  if (parts[0] === 'edit' && parts[1]) return { name: 'edit', id: parts[1] };
  if (parts[0] === 'preview' && parts[1]) return { name: 'preview', id: parts[1], screen: params.get('screen') ?? undefined };
  return { name: 'dashboard' };
}

export function navigate(to: string) {
  window.location.hash = to;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(window.location.hash));
  useEffect(() => {
    const on = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
