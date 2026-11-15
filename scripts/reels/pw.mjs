// Finds Playwright: a local install first, then the global one of the cloud container.
import { createRequire } from 'node:module';
let pw;
try { pw = await import('playwright'); } catch (_) { pw = createRequire('/opt/node22/lib/node_modules/')('playwright'); }
// On NixOS, Playwright's own Chromium does not start: REELS_CHROMIUM (or KB_CHROMIUM, which the dev shell of tiny-train
// sets) names a Nix Chromium. It links its own libraries, so an LD_LIBRARY_PATH from the host must not reach it.
export const CHROMIUM_PATH = process.env.REELS_CHROMIUM || process.env.KB_CHROMIUM || undefined;
if (CHROMIUM_PATH) { process.env.KB_CHROMIUM = CHROMIUM_PATH; delete process.env.LD_LIBRARY_PATH; }
const pwChromium = pw.chromium || pw.default.chromium;
export const chromium = CHROMIUM_PATH ? { launch: (o = {}) => pwChromium.launch({ executablePath: CHROMIUM_PATH, ...o }) } : pwChromium;
export const WORK = process.env.REELS_WORK || new URL('../../.reels/', import.meta.url).pathname.replace(/\/$/, '');
