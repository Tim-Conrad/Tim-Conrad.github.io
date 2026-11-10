#!/usr/bin/env python3
"""Puts the README of each tool into its page under tools/<slug>/, at deploy time.

  python3 scripts/gen-tools.py [<site folder>] [--readme-dir <dir>]

A tool page holds a placeholder that names the repo:

  <!-- tool-readme: owner/name -->
  <p>Any text for the review site.</p>
  <!-- /tool-readme -->

The script fetches the README of the repo at its latest release tag, renders it, and replaces the text between the
two comments. So the page always shows the README of the released tool, and nobody copies it by hand.
--readme-dir <dir> reads <dir>/<slug>.md instead (tests, and a look at the page before a release).

Raw HTML in the README is shown as text, so that the page keeps its strict Content-Security-Policy.
If a README cannot be fetched, the script exits 1 and the deploy stops: an old README on the page is drift.
Needs Python-Markdown (the deploy workflow installs it). scripts/deploy.sh runs it on the published copy.
"""
import html, json, os, re, sys, urllib.request

import markdown

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
PLACEHOLDER = re.compile(r'(<!-- tool-readme: ([A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+) -->)(.*?)(<!-- /tool-readme -->)', re.S)


class Fail(Exception):
    pass


def fetch(url):
    req = urllib.request.Request(url, headers={'User-Agent': 't7d.dev-deploy', 'Accept': 'application/vnd.github+json'})
    token = os.environ.get('GITHUB_TOKEN')
    if token and url.startswith('https://api.github.com/'):
        req.add_header('Authorization', f'Bearer {token}')
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return r.read().decode('utf-8')
    except Exception as e:
        raise Fail(f'{url}: {e}')


def readme_from_github(repo):
    tag = json.loads(fetch(f'https://api.github.com/repos/{repo}/releases/latest'))['tag_name']
    return fetch(f'https://raw.githubusercontent.com/{repo}/{tag}/README.md'), tag


def render(text):
    text = re.sub(r'\A\s*# [^\n]*\n', '', text)   # the page has its own h1
    md = markdown.Markdown(extensions=['fenced_code', 'tables', 'toc'])
    # No raw HTML: the block and inline HTML handlers go, so markdown escapes it like text.
    md.preprocessors.deregister('html_block')
    md.inlinePatterns.deregister('html')
    out = md.convert(text)

    def code(m):
        lang = re.search(r'class="language-([\w-]+)"', m.group(1))
        bar = html.escape(lang.group(1)) if lang else 'text'
        return f'<div class="code"><div class="code__bar"><span>{bar}</span></div><pre>{m.group(1)}</pre></div>'

    out = re.sub(r'<pre>(.*?)</pre>', code, out, flags=re.S)
    out = re.sub(r'<table>(.*?)</table>', r'<div class="tbl"><table>\1</table></div>', out, flags=re.S)
    return out


def main(argv):
    args = list(argv)
    readme_dir = None
    if '--readme-dir' in args:
        i = args.index('--readme-dir')
        readme_dir = args[i + 1]
        del args[i:i + 2]
    root = os.path.abspath(args[0]) if args else ROOT
    tools = os.path.join(root, 'tools')
    if not os.path.isdir(tools):
        return 0
    for slug in sorted(os.listdir(tools)):
        page = os.path.join(tools, slug, 'index.html')
        if not os.path.isfile(page):
            continue
        s = open(page, encoding='utf-8').read()
        m = PLACEHOLDER.search(s)
        if not m:
            continue
        repo = m.group(2)
        if readme_dir:
            path = os.path.join(readme_dir, f'{slug}.md')
            if not os.path.isfile(path):
                raise Fail(f'{path} does not exist')
            text, source = open(path, encoding='utf-8').read(), 'local copy'
        else:
            text, source = readme_from_github(repo)
        body = render(text)
        new = f'{m.group(1)}\n<!-- {html.escape(repo)} README, {html.escape(source)} -->\n{body}\n{m.group(4)}'
        s = s[:m.start()] + new + s[m.end():]
        with open(page, 'w', encoding='utf-8') as f:
            f.write(s)
        print(f'tools/{slug}: README of {repo} ({source})')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Fail as e:
        print(f'error: {e}')
        sys.exit(1)
