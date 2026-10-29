import type { ContentBundle } from '@qanunhub/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app';
import { httpApi } from './api/http';
import type { Api } from './api/types';
import { applyTheme, savedTheme } from './screens/Profile';
import { Spinner } from './ui/components';
import './styles.css';


applyTheme(savedTheme());

/** The demo build embeds the content bundle as gzip+base64 and decompresses it in the browser. */
async function demoBundle(): Promise<ContentBundle> {
  const { default: b64 } = await import('virtual:demo-content');
  const bin = Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0));
  const stream = new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'));
  return JSON.parse(await new Response(stream).text()) as ContentBundle;
}

async function createApi(): Promise<Api> {
  if (__DEMO__) {
    const { localApi } = await import('./api/local');
    return localApi(demoBundle);
  }
  return httpApi();
}

const root = createRoot(document.getElementById('root')!);
root.render(<Spinner />);
createApi().then(
  (api) => root.render(<StrictMode><App api={api} /></StrictMode>),
  (e) => root.render(<div className="shell"><div className="page no-tabs"><p>Tətbiq yüklənmədi: {String(e)}</p></div></div>),
);

if (!__DEMO__ && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
