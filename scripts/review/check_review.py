#!/usr/bin/env python3
"""Browser check of the review bar: the version picker and the marks of a round.

    uv run -q --no-project --with playwright==1.63.0 python3 scripts/review/check_review.py [--shots DIR]

Makes a temporary git repo (master and the worktree t/a with two rounds), starts devserver.py on a free port and
opens the pages in Chromium at 1440, 390 and 320 px, in the light and the dark theme. Exit code 1 if a check fails.
Round 1 changes the heading. Round 2 changes one word, removes one paragraph, adds one and adds the page /new/.
"""
import argparse
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request

from playwright.sync_api import sync_playwright

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.normpath(os.path.join(HERE, "..", ".."))
CSP = ("default-src 'none'; style-src 'self'; script-src 'self'; img-src 'self'; font-src 'self'; "
       "base-uri 'none'; form-action 'none'")
P1_OLD = "The first paragraph has a quick word in it."
P1_NEW = "The first paragraph has a slow word in it."
P2 = "This second paragraph goes away in round two."
P3 = "The third paragraph stays the same."
P4 = "Round two adds this closing text."
SIZES = ((1440, 900), (390, 844), (320, 640))
MARKS = "ins.rv-add, del.rv-del, .rv-gone, .rv-newpage"


def page(title, paras):
    body = "\n".join("<p>%s</p>" % p for p in paras)
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<meta http-equiv="Content-Security-Policy" content="%s"><title>%s</title>'
            '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">'
            '<link rel="stylesheet" href="/assets/site.css"><script src="/assets/theme.js"></script></head>'
            '<body><main class="wrap prose"><h1>%s</h1>\n%s\n</main></body></html>') % (CSP, title, title, body)


def git(cwd, *args):
    subprocess.run(["git", "-c", "user.name=t", "-c", "user.email=t@t", *args], cwd=cwd, check=True,
                   capture_output=True)


def write(root, rel, text):
    os.makedirs(os.path.dirname(os.path.join(root, rel)), exist_ok=True)
    with open(os.path.join(root, rel), "w", encoding="utf-8") as f:
        f.write(text)


def fixture(base):
    """The main clone (master) and the worktree of t/a below base/wts. Returns (main, wts)."""
    main, wts = os.path.join(base, "main"), os.path.join(base, "wts")
    os.makedirs(os.path.join(main, "assets"))
    for f in ("site.css", "theme.js", "favicon.svg"):
        shutil.copy(os.path.join(REPO, "assets", f), os.path.join(main, "assets", f))
    shutil.copytree(os.path.join(REPO, "assets", "fonts"), os.path.join(main, "assets", "fonts"))
    write(main, "index.html", page("Fixture", [P1_OLD, P2, P3]))
    git(main, "init", "-b", "master")
    git(main, "add", "-A")
    git(main, "commit", "-m", "base")
    wt = os.path.join(wts, "t-a")
    git(main, "worktree", "add", "-b", "t/a", wt)
    write(wt, "index.html", page("Fixture page", [P1_OLD, P2, P3]))
    git(wt, "commit", "-am", "A longer heading")
    write(wt, "index.html", page("Fixture page", [P1_NEW, P3, P4]))
    write(wt, "new/index.html", page("New", ["A page that round two adds."]))
    git(wt, "add", "-A")
    git(wt, "commit", "-m", "Change a word, remove and add a paragraph")
    return main, wts


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start(main, wts):
    port = free_port()
    proc = subprocess.Popen([sys.executable, os.path.join(HERE, "devserver.py"), "--root", main, "--worktrees", wts,
                             "--port", str(port)], stdout=subprocess.DEVNULL)
    base = "http://127.0.0.1:%d" % port
    for _ in range(100):
        try:
            urllib.request.urlopen(base + "/__review/api/state", timeout=1)
            return proc, base
        except OSError:
            time.sleep(0.1)
    proc.kill()
    raise SystemExit("devserver.py did not start")


class Check:
    def __init__(self):
        self.failed = []

    def that(self, ok, what):
        print(("ok    " if ok else "FAIL  ") + what)
        if not ok:
            self.failed.append(what)


def texts(pg, sel):
    return pg.eval_on_selector_all(sel, "ns => ns.map(n => n.textContent)")


def no_side_scroll(pg):
    return pg.evaluate("document.documentElement.scrollWidth <= document.documentElement.clientWidth")


def wait_for(pg, expr):
    """Poll expr in the page. wait_for_function cannot run: the page CSP has no 'unsafe-eval'."""
    for _ in range(50):
        if pg.evaluate(expr):
            return
        pg.wait_for_timeout(100)
    raise AssertionError("timeout: " + expr)


def bar_ready(pg):
    pg.wait_for_selector(".rv-bar[data-ready]", state="attached")


def run(base, shots):
    c = Check()
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for w, h in SIZES:
            for scheme in ("light", "dark"):
                tag = "%d %s" % (w, scheme)
                ctx = browser.new_context(viewport={"width": w, "height": h}, color_scheme=scheme)
                ctx.set_default_timeout(5000)
                pg = ctx.new_page()
                errors = []
                pg.on("console", lambda m, e=errors: m.type == "error" and e.append(m.text))
                pg.on("pageerror", lambda x, e=errors: e.append(str(x)))

                # master has no rounds: only the branch select
                pg.goto(base + "/?branch=master")
                bar_ready(pg)
                c.that(pg.is_visible(".rv-branch-pick") and not pg.is_visible(".rv-from")
                       and not pg.is_visible(".rv-to") and not pg.is_visible(".rv-switch"),
                       tag + ": on master the bar shows only the branch select")
                c.that(pg.locator(".rv-approve").count() == 1 and pg.locator(".rv-approve").is_hidden(),
                       tag + ": the approve button is hidden")
                c.that(pg.locator(".rv-tab, .rv-panel").count() == 0, tag + ": the note tab is gone")

                # the branch select opens t/a, with Round 2 against Round 1
                with pg.expect_navigation():
                    pg.select_option(".rv-branch-pick", "t/a")
                bar_ready(pg)
                c.that("branch=t%2Fa" in pg.url or "branch=t/a" in pg.url, tag + ": the branch select loads t/a")
                c.that(pg.input_value(".rv-to") == pg.eval_on_selector(".rv-to", "s => s.options[s.options.length - 1].value"),
                       tag + ": to is the newest round")
                c.that(pg.eval_on_selector(".rv-from", "s => s.options[s.selectedIndex].text").startswith("Round 1"),
                       tag + ": from is Round 1")
                c.that(texts(pg, "ins.rv-add") == ["slow", P4], tag + ": ins marks the new word and the new paragraph (%r)" % texts(pg, "ins.rv-add"))
                c.that(texts(pg, "del.rv-del") == ["quick"], tag + ": del marks the old word (%r)" % texts(pg, "del.rv-del"))
                c.that(texts(pg, ".rv-gone") == [P2], tag + ": rv-gone holds the removed paragraph")
                c.that(pg.evaluate("document.querySelector('.rv-gone').nextElementSibling.textContent") == P3,
                       tag + ": rv-gone is before the next kept paragraph")
                c.that(pg.evaluate("[...document.querySelectorAll('[class^=rv-], [class*=\" rv-\"]')]"
                                   ".filter(n => !n.closest('[data-review-ui]') && !n.matches('ins, del')).length") == 0,
                       tag + ": every review element outside the marks carries data-review-ui")
                c.that(no_side_scroll(pg), tag + ": no horizontal scroll with marks")
                small = pg.evaluate("[...document.querySelectorAll('.rv-bar select, .rv-bar label, .rv-bar button')]"
                                    ".filter(n => n.offsetParent).map(n => n.getBoundingClientRect().height).filter(x => x < 40)")
                c.that(small == [], tag + ": touch targets are 40 px or more (%r)" % small)
                if shots:
                    pg.screenshot(path=os.path.join(shots, "marks-%d-%s.png" % (w, scheme)), full_page=True)

                # the switch off removes every mark and keeps the text of round 2; the choice stays after a reload
                pg.click(".rv-switch")
                c.that(pg.locator(MARKS).count() == 0, tag + ": switch off removes every mark")
                c.that(texts(pg, "main p") == [P1_NEW, P3, P4], tag + ": switch off shows the text of round 2")
                pg.reload()
                bar_ready(pg)
                c.that(not pg.is_checked(".rv-switch input") and pg.locator(MARKS).count() == 0,
                       tag + ": the switch stays off after a reload")
                pg.click(".rv-switch")
                wait_for(pg, "document.querySelectorAll('del.rv-del').length === 1")
                c.that(texts(pg, "del.rv-del") == ["quick"] and texts(pg, ".rv-gone") == [P2],
                       tag + ": switch on shows the marks again")

                # to = Round 1 is an older round: the page shows round 1, marked against master
                pg.select_option(".rv-from", "master")
                to1 = pg.eval_on_selector(".rv-to", "s => [...s.options].find(o => o.text.startsWith('Round 1')).value")
                pg.select_option(".rv-to", to1)
                wait_for(pg, "document.querySelector('main h1 ins.rv-add') !== null")
                c.that(texts(pg, "main > p") == [P1_OLD, P2, P3], tag + ": to = Round 1 shows the text of round 1")
                c.that(texts(pg, "ins.rv-add") == [" page"] and pg.locator("del.rv-del, .rv-gone").count() == 0,
                       tag + ": Round 1 against master marks only the heading (%r)" % texts(pg, "ins.rv-add"))
                if shots and w != 1440:
                    pg.screenshot(path=os.path.join(shots, "round1-%d-%s.png" % (w, scheme)))
                pg.select_option(".rv-to", pg.eval_on_selector(".rv-to", "s => s.options[s.options.length - 1].value"))
                wait_for(pg, "document.querySelectorAll('main > p').length === 3")
                wait_for(pg, "document.querySelectorAll('.rv-gone').length === 1")
                c.that(texts(pg, "ins.rv-add") == [" page", "slow", P4] and texts(pg, "del.rv-del") == ["quick"],
                       tag + ": back to Round 2 shows the page on disk, marked against master (%r)" % texts(pg, "ins.rv-add"))

                # a page new in "to"
                pg.select_option(".rv-from", pg.eval_on_selector(".rv-from", "s => [...s.options].find(o => o.text.startsWith('Round 1')).value"))
                pg.goto(base + "/new/?branch=t/a")
                bar_ready(pg)
                c.that(texts(pg, ".rv-newpage") == ["New page in this round"], tag + ": a new page has one line")
                c.that(pg.locator("ins.rv-add, del.rv-del, .rv-gone").count() == 0, tag + ": a new page has no other mark")
                c.that(no_side_scroll(pg), tag + ": no horizontal scroll on the new page")
                if shots and w == 390:
                    pg.screenshot(path=os.path.join(shots, "newpage-%d-%s.png" % (w, scheme)))

                c.that(errors == [], tag + ": no console error (%r)" % errors)
                ctx.close()
        browser.close()
    return c


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--shots", help="save screenshots to this folder")
    a = ap.parse_args()
    if a.shots:
        os.makedirs(a.shots, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        main_clone, wts = fixture(os.path.realpath(tmp))
        proc, base = start(main_clone, wts)
        try:
            c = run(base, a.shots)
        finally:
            proc.terminate()
            proc.wait()
    print("%d checks failed" % len(c.failed) if c.failed else "all checks passed")
    sys.exit(1 if c.failed else 0)


if __name__ == "__main__":
    main()
