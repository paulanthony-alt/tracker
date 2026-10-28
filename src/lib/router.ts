import { useSyncExternalStore } from 'react';

export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

function read(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const [p, q = ''] = hash.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q), raw: hash };
}

let current = typeof window !== 'undefined' ? read() : { path: [], query: new URLSearchParams(), raw: '/' };
const listeners = new Set<() => void>();
if (typeof window !== 'undefined') {
  window.addEventListener('hashchange', () => {
    current = read();
    listeners.forEach((l) => l());
  });
}

export function useRoute(): Route {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current,
  );
}

/** Navigate to a hash route like "#/school?tab=grades" or "/school". */
export function navigate(href: string, opts: { replace?: boolean } = {}) {
  const target = href.startsWith('#') ? href : `#${href.startsWith('/') ? href : `/${href}`}`;
  if (opts.replace) {
    history.replaceState(null, '', target);
    current = read();
    listeners.forEach((l) => l());
  } else if (window.location.hash !== target) {
    window.location.hash = target;
  }
}

/** Update one query parameter on the current route (replaces history entry). */
export function setQuery(key: string, value: string | null) {
  const r = read();
  if (value === null) r.query.delete(key);
  else r.query.set(key, value);
  const qs = r.query.toString();
  navigate(`#/${r.path.map(encodeURIComponent).join('/')}${qs ? `?${qs}` : ''}`, { replace: true });
}
