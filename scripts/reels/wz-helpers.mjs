// Helpers of the Wortzauber films (wortzauber-takes.mjs, timeline-wz.mjs).
// a soft dot that follows the pointer, so the viewer sees the finger
export const FINGER = `(() => { const d = document.createElement('div'); d.id = '__finger';
  d.style.cssText = 'position:fixed;z-index:99999;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,.55);border:3px solid rgba(30,30,60,.55);pointer-events:none;left:-100px;top:-100px;transition:transform .12s;';
  const add = () => document.body ? document.body.appendChild(d) : setTimeout(add, 50); add();
  addEventListener('pointermove', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; }, true);
  addEventListener('pointerdown', e => { d.style.left = e.clientX + 'px'; d.style.top = e.clientY + 'px'; d.style.transform = 'scale(.75)'; }, true);
  addEventListener('pointerup', () => { d.style.transform = 'scale(1)'; }, true); })();`;

// Trace every stroke of the word on the trace page with the real pointer.
export async function traceWord(page, { stepMs = 8 } = {}) {
  for (let guard = 0; guard < 900; guard++) {
    const d = await page.evaluate(() => WZ.st.view === 'viewTrace' ? WZ.tracer.debug() : null);
    if (!d || d.phase === 'done') break;
    if (d.phase !== 'trace' || !d.pts || !d.pts.length) { await page.waitForTimeout(120); continue; }
    const pts = d.pts;
    await page.mouse.move(pts[0][0], pts[0][1], { steps: 8 });
    await page.mouse.down();
    for (const q of pts.slice(1)) { await page.mouse.move(q[0], q[1]); await page.waitForTimeout(stepMs); }
    await page.mouse.up();
    await page.waitForTimeout(160);
  }
}
