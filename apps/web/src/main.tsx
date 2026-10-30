import type { ContentBundle } from '@qanunhub/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { httpApi } from './api/http';
import type { Api } from './api/types';
import type { AuthBackend } from './auth/types';
import { applyTheme, savedTheme } from './screens/Profile';
import { Splash } from './ui/components';
import './styles.css';


const theme = savedTheme();
if (theme !== 'auto') applyTheme(theme);

/** The demo build embeds the content bundle as gzip+base64 and decompresses it in the browser. */
async function demoBundle(): Promise<ContentBundle> {
  const { default: b64 } = await import('virtual:demo-content');
  const bin = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as ContentBundle;
}

/** Production: Supabase Auth (settings from the server) + the HTTP API. Demo: both simulated in the browser. */
async function createBackends(): Promise<{ api: Api; auth: AuthBackend }> {
  if (__DEMO__) {
    const { localApi } = await import('./api/local');
    return localApi(demoBundle);
  }
  const { loadSupabaseSettings, supabaseAuth } = await import('./auth/supabase');
  const auth = supabaseAuth(await loadSupabaseSettings());
  return { api: httpApi(auth), auth };
}

const root = createRoot(document.getElementById('root')!);
root.render(<Splash />);
createBackends().then(
  ({ api, auth }) => root.render(<StrictMode><App api={api} auth={auth} /></StrictMode>),
  (e) => root.render(<div className="shell"><div className="page no-tabs"><p>Tətbiq yüklənmədi: {String(e)}</p></div></div>),
);

if (!__DEMO__ && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
