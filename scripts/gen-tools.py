#!/usr/bin/env python3
"""Puts the guide of each tool into its page under tools/<slug>/, and its version into every page, at deploy time.

  python3 scripts/gen-tools.py [<site folder>] [--readme-dir <dir>] [--local <slug>=<checkout>]

A tool page holds a placeholder that names the repo, and the file if it is not README.md:

  <!-- tool-readme: owner/name SHOWME.md -->
  <p>Any text for the review site.</p>
  <!-- /tool-readme -->

The script fetches that file of the repo at its latest release tag, renders it, and replaces the text between the
two comments. So the page always shows the guide of the released tool, and nobody copies it by hand.

Pictures: a line `![alt](docs/x.svg "caption")` with a path inside the repo becomes a figure with the SVG inline,
from the same tag. The SVG must be drawn with the diagram classes of assets/site.css (DG_CLASSES below) and nothing
else: no colours, no style attributes, no links. Parts marked `data-standalone` (the style block and the paper that
the picture needs on GitHub) are dropped, so the site's own styles draw it and it follows the theme.

Contents: if the page holds `<!-- tool-toc --><!-- /tool-toc -->` inside the list of its `.toc`, the script puts one
list item per `h2` of the guide between the two comments. Without a `.toc`, the `.post` layout squeezes the text
into the narrow column.

Versions: any page of the site can hold `<!-- tool-version: owner/name -->v0.0.0<!-- /tool-version -->`.
The script puts the latest release tag between the two comments, so no page names an old version.

Links inside the repo (`README.md#setup`) point to the file on GitHub at the same tag.

--readme-dir <dir> reads <dir>/<slug>.md and pictures from <dir>/<slug>/ instead (tests).
--local <slug>=<checkout> reads the file and the pictures from a checkout of the repo (a look before a release).
Both leave the version markers alone.

Raw HTML in the file is shown as text, so that the page keeps its strict Content-Security-Policy.
If a file cannot be fetched or a picture breaks a rule, the script exits 1 and the deploy stops: an old guide on the
page is drift.
Needs Python-Markdown (the deploy workflow installs it). scripts/deploy.sh runs it on the published copy.
"""
import html, json, os, re, sys, urllib.request
import xml.etree.ElementTree as ET

import markdown

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
REPO = r'[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+'
PLACEHOLDER = re.compile(r'(<!-- tool-readme: (' + REPO + r')(?: ([A-Za-z0-9_.-]+\.md))? -->)(.*?)(<!-- /tool-readme -->)', re.S)
TOC = re.compile(r'(<!-- tool-toc -->)(.*?)(<!-- /tool-toc -->)', re.S)
VERSION = re.compile(r'(<!-- tool-version: (' + REPO + r') -->)(.*?)(<!-- /tool-version -->)', re.S)
IMAGE = re.compile(r'^!\[([^\]]*)\]\(([^\s)]+)(?: "([^"]*)")?\)[ \t]*$', re.M)
# what a picture may use: the diagram classes of assets/site.css, and plain shapes
DG_CLASSES = {'t-s', 't-h', 't-m', 't-l', 't-inv', 'ln', 'ln-s', 'ln-t', 'bx', 'bx-s', 'bx-i', 'bx-d', 'dot', 'arr'}
DG_TAGS = {'svg', 'title', 'desc', 'g', 'rect', 'line', 'polyline', 'polygon', 'path', 'circle', 'text', 'tspan'}
DG_ATTRS = {'class', 'id', 'viewBox', 'role', 'aria-labelledby', 'x', 'y', 'width', 'height', 'x1', 'y1', 'x2', 'y2',
            'cx', 'cy', 'r', 'rx', 'ry', 'points', 'd', 'transform', 'text-anchor'}


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


class GitHub:
    """The files of a repo at its latest release tag."""
    def __init__(self, repo):
        self.repo = repo
        self.tag = json.loads(fetch(f'https://api.github.com/repos/{repo}/releases/latest'))['tag_name']
        self.label = self.tag

    def read(self, path):
        return fetch(f'https://raw.githubusercontent.com/{self.repo}/{self.tag}/{path}')


class Local:
    """A local copy: `doc` is the file, pictures are below `base`. It knows no release, so no version."""
    tag = None
    label = 'local copy'

    def __init__(self, doc, base):
        self.doc, self.base = doc, base

    def read(self, path):
        full = self.doc if path is None else os.path.join(self.base, path)
        if not os.path.isfile(full):
            raise Fail(f'{full} does not exist')
        return open(full, encoding='utf-8').read()


def inline_svg(text, name, key):
    """The SVG as markup for the page, or Fail if it uses something that the site does not draw."""
    try:
        root = ET.fromstring(text)
    except ET.ParseError as e:
        raise Fail(f'{name}: not valid SVG ({e})')
    ids = {}

    def walk(el, depth):
        tag = el.tag.rsplit('}', 1)[-1]
        if 'data-standalone' in el.attrib:
            return ''
        if tag not in DG_TAGS:
            raise Fail(f'{name}: <{tag}> is not allowed in a picture')
        attrs = dict(el.attrib)
        if depth == 0:
            if tag != 'svg' or 'viewBox' not in attrs:
                raise Fail(f'{name}: the picture must be an <svg> with a viewBox')
            attrs = {'class': 'dg', 'viewBox': attrs['viewBox'], 'role': 'img',
                     **({'aria-labelledby': attrs['aria-labelledby']} if 'aria-labelledby' in attrs else {})}
        out = []
        for k, v in attrs.items():
            if k not in DG_ATTRS:
                raise Fail(f'{name}: the attribute {k} is not allowed in a picture')
            if k == 'class' and depth and not set(v.split()) <= DG_CLASSES:
                raise Fail(f'{name}: class "{v}" is not a diagram class of assets/site.css')
            if k == 'id':   # ids must be unique on the page
                ids[v] = v = f'{key}-{v}'
            out.append((k, v))
        inner = html.escape(el.text or '', quote=False) + ''.join(
            walk(c, depth + 1) + html.escape(c.tail or '', quote=False) for c in el)
        open_tag = '<' + tag + ''.join(f' {k}="{html.escape(v)}"' for k, v in out)
        return f'{open_tag}>{inner}</{tag}>' if inner.strip() or tag in ('svg', 'text', 'title', 'desc') else f'{open_tag}/>'

    svg = walk(root, 0)
    if '<title' not in svg:
        raise Fail(f'{name}: a picture needs a <title>')
    # aria-labelledby names the ids of title and desc: give it the new ones
    svg = re.sub(r'aria-labelledby="([^"]*)"', lambda m: 'aria-labelledby="' + ' '.join(ids.get(i, i) for i in m.group(1).split()) + '"', svg, count=1)
    return re.sub(r'>\s+<', '><', svg)


def render(text, source=None, repo=None, key='fig'):
    text = re.sub(r'\A\s*# [^\n]*\n', '', text)   # the page has its own h1
    figures = []

    def figure(m):
        alt, path, caption = m.group(1), m.group(2), m.group(3)
        if re.match(r'[a-z]+:|/|\.\.', path) or not path.endswith('.svg') or source is None:
            raise Fail(f'picture {path}: only an SVG inside the repo can go into the page')
        svg = inline_svg(source.read(path), path, f'{key}{len(figures) + 1}')
        cap = f'<figcaption>Fig. {len(figures) + 1} · {html.escape(caption)}</figcaption>' if caption else ''
        figures.append(f'<figure class="fig-wide">{svg}{cap}</figure>')
        return f'\n\nTOOLFIG{len(figures) - 1}X\n\n'

    text = IMAGE.sub(figure, text)
    md = markdown.Markdown(extensions=['fenced_code', 'tables', 'toc'])
    # No raw HTML: the block and inline HTML handlers go, so markdown escapes it like text.
    md.preprocessors.deregister('html_block')
    md.inlinePatterns.deregister('html')
    out = md.convert(text)
    if '<img' in out:
        raise Fail('a picture must stand on its own line, as ![alt](path.svg "caption")')

    def code(m):
        lang = re.search(r'class="language-([\w-]+)"', m.group(1))
        bar = html.escape(lang.group(1)) if lang else 'text'
        return f'<div class="code"><div class="code__bar"><span>{bar}</span></div><pre>{m.group(1)}</pre></div>'

    out = re.sub(r'<pre>(.*?)</pre>', code, out, flags=re.S)
    out = re.sub(r'<table>(.*?)</table>', r'<div class="tbl"><table>\1</table></div>', out, flags=re.S)
    if repo:   # a link to a file of the repo: the file on GitHub, at the same tag
        ref = (source.tag if source else None) or 'HEAD'
        out = re.sub(r'href="(?![a-z]+:|#|/)([^"]+)"', lambda m: f'href="https://github.com/{repo}/blob/{ref}/{m.group(1)}"', out)
    return re.sub(r'<p>TOOLFIG(\d+)X</p>', lambda m: figures[int(m.group(1))], out)


def pages(root):
    for folder, dirs, files in os.walk(root):
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in ('assets', 'scripts', 'drafts', 'sealed', 'node_modules')]
        for f in files:
            if f.endswith('.html'):
                yield os.path.join(folder, f)


def option(args, name):
    values = []
    while name in args:
        i = args.index(name)
        if i + 1 >= len(args):
            raise Fail(f'{name} needs a value')
        values.append(args[i + 1])
        del args[i:i + 2]
    return values


def main(argv):
    args = list(argv)
    readme_dir = (option(args, '--readme-dir') or [None])[-1]
    local = dict(v.split('=', 1) for v in option(args, '--local') if '=' in v)
    root = os.path.abspath(args[0]) if args else ROOT
    tools = os.path.join(root, 'tools')
    if not os.path.isdir(tools):
        return 0
    releases = {}

    def release(repo):
        if repo not in releases:
            releases[repo] = GitHub(repo)
        return releases[repo]

    offline = bool(readme_dir or local)
    for slug in sorted(os.listdir(tools)):
        page = os.path.join(tools, slug, 'index.html')
        if not os.path.isfile(page):
            continue
        s = open(page, encoding='utf-8').read()
        m = PLACEHOLDER.search(s)
        if not m:
            continue
        repo, name = m.group(2), m.group(3) or 'README.md'
        if slug in local:
            source, doc = Local(os.path.join(local[slug], name), local[slug]), None
        elif readme_dir:
            source, doc = Local(os.path.join(readme_dir, f'{slug}.md'), os.path.join(readme_dir, slug)), None
        else:
            source, doc = release(repo), name
        body = render(source.read(doc), source, repo, slug)
        new = f'{m.group(1)}\n<!-- {html.escape(repo)} {html.escape(name)}, {html.escape(source.label)} -->\n{body}\n{m.group(5)}'
        s = s[:m.start()] + new + s[m.end():]
        items = ''.join(f'\n      <li><a href="#{i}">{t}</a></li>' for i, t in re.findall(r'<h2 id="([^"]+)">(.*?)</h2>', body))
        s = TOC.sub(lambda t: t.group(1) + items + '\n      ' + t.group(3), s)
        with open(page, 'w', encoding='utf-8') as f:
            f.write(s)
        print(f'tools/{slug}: {name} of {repo} ({source.label})')
    if offline:
        return 0
    for page in pages(root):
        s = open(page, encoding='utf-8').read()
        if '<!-- tool-version:' not in s:
            continue
        new = VERSION.sub(lambda m: m.group(1) + html.escape(release(m.group(2)).tag) + m.group(4), s)
        if new != s:
            with open(page, 'w', encoding='utf-8') as f:
                f.write(new)
            print(f'{os.path.relpath(page, root)}: versions set')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main(sys.argv[1:]))
    except Fail as e:
        print(f'error: {e}')
        sys.exit(1)
