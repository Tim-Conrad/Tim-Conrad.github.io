#!/usr/bin/env python3
"""Browser check of the review bar: the version picker and the marks of a round.

    uv run -q --no-project --with playwright==1.63.0 python3 scripts/review/check_review.py [--shots DIR]

Makes a temporary git repo (master and the worktree t/a with two rounds), starts devserver.py on a free port and
opens the pages in Chromium at 1440, 390 and 320 px, in the light and the dark theme. Exit code 1 if a check fails.
Round 1 changes the heading. Round 2 changes one word, removes one paragraph, adds one and adds the page /new/.
The worktree t/b has one round and a change that is not committed (Working).
The Approve button: a route catches its POST, so nothing is written. A fake status file stands in for the host.
"""
import argparse
import datetime
import json
import os
import re
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
WIDE = 960   # from this width the bar is one row with every select; below it the selects open on a tap
MARKS = "ins.rv-add, del.rv-del, .rv-gone, .rv-newpage"
PR = "https://github.com/Tim-Conrad/Tim-Conrad.github.io/pull/7"


def page(title, paras):
    body = "\n".join("<p>%s</p>" % p for p in paras)
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<meta http-equiv="Content-Security-Policy" content="%s"><title>%s</title>'
            '<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">'
            '<link rel="stylesheet" href="/assets/site.css"><script src="/assets/theme.js"></script>'
            '<script src="/assets/site.js" defer></script></head>'
            '<body><header class="nav"><div class="wrap nav__in"><a class="brand" href="/">Fixture</a>'
            '<button class="toggle" id="theme-toggle" type="button">dark</button></div></header>'
            '<main class="wrap prose"><h1>%s</h1>\n%s\n</main></body></html>') % (CSP, title, title, body)


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
    for f in ("site.css", "theme.js", "site.js", "favicon.svg"):
        shutil.copy(os.path.join(REPO, "assets", f), os.path.join(main, "assets", f))
    shutil.copytree(os.path.join(REPO, "assets", "fonts"), os.path.join(main, "assets", "fonts"))
    write(main, "index.html", page("Fixture", [P1_OLD, P2, P3]))
    write(main, "long/index.html", page("Long", ["Paragraph %d of a page that scrolls." % i for i in range(60)]))
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
    wt_b = os.path.join(wts, "t-b")
    git(main, "worktree", "add", "-b", "t/b", wt_b)
    write(wt_b, "index.html", page("Fixture B", [P1_OLD, P2, P3]))
    git(wt_b, "commit", "-am", "B heading")
    write(wt_b, "index.html", page("Fixture B", [P1_NEW, P2, P3]))   # Working: not committed
    return main, wts


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def start(main, wts, status_dir):
    port = free_port()
    # --approve names a folder that does not exist: if the route misses the POST, the server answers 503 and writes nothing
    proc = subprocess.Popen([sys.executable, os.path.join(HERE, "devserver.py"), "--root", main, "--worktrees", wts,
                             "--approve", os.path.join(status_dir, "missing"), "--approve-status", status_dir,
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


def open_bar(pg):
    """On a narrow screen the selects are in a part that opens on a tap."""
    if pg.is_visible(".rv-more-toggle") and pg.get_attribute(".rv-more-toggle", "aria-expanded") != "true":
        pg.click(".rv-more-toggle")


def pick(pg, sel, value):
    open_bar(pg)
    pg.select_option(sel, value)


def small_targets(pg):
    return pg.evaluate("[...document.querySelectorAll('.rv-bar select, .rv-bar label, .rv-bar button')]"
                       ".filter(n => n.offsetParent).map(n => n.getBoundingClientRect().height).filter(x => x < 40)")


def theme_now(pg):
    return pg.evaluate("document.documentElement.dataset.theme || "
                       "(matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')")


def now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def fake_status(status_dir, **fields):
    """The status file as approve-host.sh writes it, or none for fields == {}."""
    path = os.path.join(status_dir, "status.json")
    if not fields:
        if os.path.exists(path):
            os.remove(path)
        return
    st = {"state": "running", "step": "", "line": "", "pr": None, "branch": "t/a", "sha": "", "request": "", "time": now()}
    st.update(fields)
    with open(path, "w") as f:
        json.dump(st, f)


def approve_shown(pg):
    open_bar(pg)
    return pg.is_visible(".rv-approve")


def run(base, shots, status_dir, head):
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
                open_bar(pg)
                c.that(pg.is_visible(".rv-branch-pick") and not pg.is_visible(".rv-from")
                       and not pg.is_visible(".rv-to") and not pg.is_visible(".rv-switch"),
                       tag + ": on master the bar shows only the branch select")
                c.that(pg.locator(".rv-approve").count() == 1 and pg.locator(".rv-approve").is_hidden(),
                       tag + ": the approve button is hidden")
                c.that(pg.locator(".rv-tab, .rv-panel").count() == 0, tag + ": the note tab is gone")

                # the branch select opens t/a, with Round 2 against Round 1
                with pg.expect_navigation():
                    pick(pg, ".rv-branch-pick", "t/a")
                bar_ready(pg)
                c.that("branch=t%2Fa" in pg.url or "branch=t/a" in pg.url, tag + ": the branch select loads t/a")
                c.that(pg.input_value(".rv-to") == pg.eval_on_selector(".rv-to", "s => s.options[s.options.length - 1].value"),
                       tag + ": to is the newest round")
                c.that(approve_shown(pg) and pg.text_content(".rv-approve") == "Approve round 2",
                       tag + ": the newest round shows \"Approve round 2\"")
                if pg.get_attribute(".rv-more-toggle", "aria-expanded") == "true":
                    pg.click(".rv-more-toggle")
                c.that(pg.eval_on_selector(".rv-from", "s => s.options[s.selectedIndex].text").startswith("Round 1"),
                       tag + ": from is Round 1")
                c.that(texts(pg, "ins.rv-add") == ["slow", P4], tag + ": ins marks the new word and the new paragraph (%r)" % texts(pg, "ins.rv-add"))
                c.that(texts(pg, "del.rv-del") == ["quick"], tag + ": del marks the old word (%r)" % texts(pg, "del.rv-del"))
                c.that(texts(pg, ".rv-gone") == [P2], tag + ": rv-gone holds the removed paragraph")
                c.that(pg.evaluate("document.querySelector('.rv-gone').nextElementSibling.textContent") == P3,
                       tag + ": rv-gone is before the next kept paragraph")
                c.that(pg.evaluate("[...document.querySelectorAll('[class^=rv-], [class*=\" rv-\"]')]"
                                   ".filter(n => n !== document.documentElement && !n.closest('[data-review-ui]') && !n.matches('ins, del')).length") == 0,
                       tag + ": every review element outside the marks carries data-review-ui")
                c.that(no_side_scroll(pg), tag + ": no horizontal scroll with marks")
                small = small_targets(pg)
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

                # one failed request: the same version loads when it is selected again
                round1 = pg.eval_on_selector(".rv-to", "s => [...s.options].find(o => o.text.startsWith('Round 1')).value")
                pg.route(re.compile(r"/__review/api/text\?.*rev=master"), lambda route: route.abort(), times=1)
                n_errors = len(errors)
                pick(pg, ".rv-from", "master")
                wait_for(pg, "document.querySelector('.rv-status').textContent !== ''")
                c.that(pg.locator(MARKS).count() == 0, tag + ": a failed request shows no marks")
                errors[n_errors:] = [e for e in errors[n_errors:] if "net::ERR_FAILED" not in e]
                pick(pg, ".rv-from", round1)
                wait_for(pg, "document.querySelectorAll('del.rv-del').length === 1")
                pick(pg, ".rv-from", "master")
                try:
                    wait_for(pg, "document.querySelector('main h1 ins.rv-add') !== null")
                    again = True
                except AssertionError:
                    again = False
                c.that(again and pg.text_content(".rv-status") == "",
                       tag + ": after a failed request the version loads when it is selected again")

                # to = Round 1 is an older round: the page shows round 1, marked against master
                pick(pg, ".rv-to", round1)
                wait_for(pg, "document.querySelector('main h1 ins.rv-add') !== null")
                c.that(texts(pg, "main > p") == [P1_OLD, P2, P3], tag + ": to = Round 1 shows the text of round 1")
                c.that(not approve_shown(pg), tag + ": an older round hides the approve button")
                c.that(texts(pg, "ins.rv-add") == [" page"] and pg.locator("del.rv-del, .rv-gone").count() == 0,
                       tag + ": Round 1 against master marks only the heading (%r)" % texts(pg, "ins.rv-add"))
                header = pg.evaluate("document.querySelector('header.nav') !== null")
                before = theme_now(pg)
                pg.evaluate("document.getElementById('theme-toggle').click()")
                after = theme_now(pg)
                pg.evaluate("document.getElementById('theme-toggle').click()")
                c.that(header and after != before and theme_now(pg) == before,
                       tag + ": in an older round the theme toggle of the header still works (%s -> %s)" % (before, after))
                if pg.get_attribute(".rv-more-toggle", "aria-expanded") == "true":
                    pg.click(".rv-more-toggle")
                if shots and w != 1440:
                    pg.screenshot(path=os.path.join(shots, "round1-%d-%s.png" % (w, scheme)))
                pick(pg, ".rv-to", pg.eval_on_selector(".rv-to", "s => s.options[s.options.length - 1].value"))
                wait_for(pg, "document.querySelectorAll('main > p').length === 3")
                wait_for(pg, "document.querySelectorAll('.rv-gone').length === 1")
                c.that(texts(pg, "ins.rv-add") == [" page", "slow", P4] and texts(pg, "del.rv-del") == ["quick"],
                       tag + ": back to Round 2 shows the page on disk, marked against master (%r)" % texts(pg, "ins.rv-add"))
                c.that(approve_shown(pg), tag + ": back to Round 2 shows the approve button again")

                # a page new in "to"
                pick(pg, ".rv-from", pg.eval_on_selector(".rv-from", "s => [...s.options].find(o => o.text.startsWith('Round 1')).value"))
                pg.goto(base + "/new/?branch=t/a")
                bar_ready(pg)
                c.that(texts(pg, ".rv-newpage") == ["New page in this round"], tag + ": a new page has one line")
                c.that(pg.locator("ins.rv-add, del.rv-del, .rv-gone").count() == 0, tag + ": a new page has no other mark")
                c.that(no_side_scroll(pg), tag + ": no horizontal scroll on the new page")
                if shots and w == 390:
                    pg.screenshot(path=os.path.join(shots, "newpage-%d-%s.png" % (w, scheme)))

                # a long page: the closed bar is small, sticks to the bottom and opens on a tap
                pg.goto(base + "/long/?branch=t/a")
                bar_ready(pg)
                box = pg.evaluate("(() => { const r = document.querySelector('.rv-bar').getBoundingClientRect();"
                                  " return {top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight}; })()")
                c.that(abs(box["bottom"] - box["vh"]) < 2, tag + ": the bar sticks to the bottom of a long page (%r)" % box)
                pad = pg.evaluate("parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom) || 0")
                c.that(pad >= box["h"], tag + ": scroll-padding-bottom (%s px) is at least the bar height (%s px)" % (pad, box["h"]))
                if w < WIDE:
                    c.that(box["h"] <= 0.15 * h, tag + ": the closed bar is at most 15%% of the screen (%s px)" % box["h"])
                    c.that(pg.get_attribute(".rv-more-toggle", "aria-expanded") == "false" and not pg.is_visible(".rv-from"),
                           tag + ": the selects are closed at first")
                    c.that(pg.text_content(".rv-more-toggle").strip() == "Round 2 vs Round 1",
                           tag + ": the closed bar shows the comparison (%r)" % pg.text_content(".rv-more-toggle"))
                    c.that(small_targets(pg) == [], tag + ": closed bar: touch targets are 40 px or more")
                    if shots:
                        pg.screenshot(path=os.path.join(shots, "long-closed-%d-%s.png" % (w, scheme)))
                    pg.click(".rv-more-toggle")
                    c.that(pg.get_attribute(".rv-more-toggle", "aria-expanded") == "true"
                           and pg.is_visible(".rv-branch-pick") and pg.is_visible(".rv-from") and pg.is_visible(".rv-to"),
                           tag + ": a tap opens the selects")
                    c.that(small_targets(pg) == [] and no_side_scroll(pg),
                           tag + ": open bar: touch targets are 40 px or more, no horizontal scroll")
                    if shots:
                        pg.screenshot(path=os.path.join(shots, "long-open-%d-%s.png" % (w, scheme)))
                    pg.click(".rv-more-toggle")
                    c.that(pg.get_attribute(".rv-more-toggle", "aria-expanded") == "false" and not pg.is_visible(".rv-from"),
                           tag + ": a second tap closes the selects")
                else:
                    c.that(not pg.is_visible(".rv-more-toggle") and pg.is_visible(".rv-from"),
                           tag + ": a wide screen shows every select in one row")

                # Working is not a commit: no approve. With changes in the worktree the host refuses, so the newest round
                # of t/b has no button either.
                pg.goto(base + "/?branch=t/b")
                bar_ready(pg)
                c.that(pg.input_value(".rv-to") == "working" and not approve_shown(pg),
                       tag + ": to = Working hides the approve button")
                pick(pg, ".rv-to", pg.eval_on_selector(".rv-to", "s => [...s.options].find(o => o.text.startsWith('Round 1')).value"))
                c.that(not approve_shown(pg), tag + ": a worktree with changes hides the button on its newest round too")

                # the approve flow: confirm, a POST with the header and the head sha, then the status of the host
                fake_status(status_dir)
                pg.goto(base + "/?branch=t/a")
                bar_ready(pg)
                c.that(pg.text_content(".rv-status") == "" and approve_shown(pg) and pg.is_enabled(".rv-approve"),
                       tag + ": with no status the line is empty and the button works")
                posts, dialogs, asked = [], [], now()

                def on_approve(route):
                    if route.request.method != "POST":
                        return route.continue_()
                    posts.append({"header": route.request.headers.get("x-t7d-review"), "body": route.request.post_data_json})
                    body = {"branch": "t/a", "sha": head, "round": 2, "by": "button", "time": asked}
                    route.fulfill(status=200, content_type="application/json", body=json.dumps(body))
                pg.route(re.compile(r"/__review/api/approve$"), on_approve)
                pg.once("dialog", lambda d, dl=dialogs: (dl.append(d.message), d.accept()))
                # the status of another request does not count for this page, even if it is newer than the request
                pg.click(".rv-approve")
                fake_status(status_dir, state="failed", step="push t/a", line="other", sha=head, request="2026-01-01T00:00:00Z",
                            time="2099-01-01T00:00:00Z")
                c.that(dialogs == ["Publish t/a at round 2 to t7d.dev?"], tag + ": the confirm text (%r)" % dialogs)
                wait_for(pg, "document.querySelector('.rv-status').textContent !== ''")
                c.that(posts == [{"header": "1", "body": {"branch": "t/a", "sha": head}}],
                       tag + ": the POST has the header and the head sha (%r)" % posts)
                pg.wait_for_timeout(2500)   # one poll of the status, which belongs to another request
                c.that(pg.text_content(".rv-status") == "Publishing t/a: wait for the host." and pg.is_disabled(".rv-approve"),
                       tag + ": the status of another request is not shown (%r)" % pg.text_content(".rv-status"))
                fake_status(status_dir, step="run scripts/check.py", sha=head, request=asked)
                wait_for(pg, "document.querySelector('.rv-status').textContent.indexOf('check.py') >= 0")
                c.that(pg.text_content(".rv-status") == "Publishing t/a: run scripts/check.py." and pg.is_disabled(".rv-approve"),
                       tag + ": while the host runs, the line shows the step and the button is off (%r)" % pg.text_content(".rv-status"))
                if shots and w in (1440, 390):
                    pg.screenshot(path=os.path.join(shots, "approve-running-%d-%s.png" % (w, scheme)))
                fake_status(status_dir, state="done", step="published t/a", sha=head, pr=PR, request=asked)
                wait_for(pg, "document.querySelector('.rv-status a') !== null")
                c.that(pg.text_content(".rv-status") == "Published t/a. Open the PR"
                       and pg.get_attribute(".rv-status a", "href") == PR and pg.is_enabled(".rv-approve"),
                       tag + ": done shows the PR link and the button works again (%r)" % pg.text_content(".rv-status"))
                c.that(no_side_scroll(pg) and small_targets(pg) == [],
                       tag + ": with the status: no horizontal scroll, touch targets 40 px or more")
                if shots and w in (1440, 390):
                    pg.screenshot(path=os.path.join(shots, "approve-done-%d-%s.png" % (w, scheme)))
                pg.unroute(re.compile(r"/__review/api/approve$"))
                fake_status(status_dir)

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
        status_dir = os.path.join(os.path.realpath(tmp), "approve-status")
        os.makedirs(status_dir)
        head = subprocess.run(["git", "rev-parse", "t/a"], cwd=main_clone, check=True, capture_output=True,
                              text=True).stdout.strip()
        proc, base = start(main_clone, wts, status_dir)
        try:
            c = run(base, a.shots, status_dir, head)
        finally:
            proc.terminate()
            proc.wait()
    print("%d checks failed" % len(c.failed) if c.failed else "all checks passed")
    sys.exit(1 if c.failed else 0)


if __name__ == "__main__":
    main()
