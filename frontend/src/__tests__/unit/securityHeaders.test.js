import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

// FE-04 mitigation: the bearer token lives in localStorage, so script injection must be blocked.
const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../../../vercel.json'), 'utf8'));
const headers = Object.fromEntries(config.headers.find((h) => h.source === '/(.*)').headers.map((h) => [h.key, h.value]));
const csp = Object.fromEntries(headers['Content-Security-Policy'].split(';').map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v]));

describe('vercel.json security headers', () => {
  it('scripts: only our own bundle and Google sign-in — no inline, no eval', () => {
    expect(csp['script-src']).toEqual(["'self'", 'https://accounts.google.com/gsi/client']);
    expect(headers['Content-Security-Policy']).not.toMatch(/unsafe-eval/);
  });
  it('no plugins, no framing, no base-tag tricks', () => {
    expect(csp['object-src']).toEqual(["'none'"]);
    expect(csp['frame-ancestors']).toEqual(["'none'"]);
    expect(csp['base-uri']).toEqual(["'self'"]);
  });
  it('deep links are served by the SPA', () => {
    expect(config.rewrites[0].destination).toBe('/index.html');
  });
});
