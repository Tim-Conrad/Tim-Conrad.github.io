// Finds Playwright: a local install first, then the global one of the cloud container.
import { createRequire } from 'node:module';
let pw;
try { pw = await import('playwright'); } catch (_) { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
export const chromium = pw.chromium || pw.default.chromium;
export const WORK = process.env.REELS_WORK || new URL('../../.reels/', import.meta.url).pathname.replace(/\/$/, '');
