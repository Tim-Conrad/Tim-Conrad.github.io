#!/usr/bin/env python3
"""Builds a preview of one page of the site as a Claude artifact bundle, so Tim can review it before it is published.

  python3 scripts/preview-artifact.py thoughts/humans-md [<out dir>] [--narration drafts/narration/humans-md]

The out dir defaults to .preview/<page> (git ignores it). It holds index.html and the files it needs, at the paths the
page uses:

- index.html: the page without doctype, <html>, <head> and <body> (the artifact host adds its own skeleton) and without
  its Content-Security-Policy meta (the host sets its own policy). The title loses " · Tim Conrad": it names the artifact. /assets/... becomes assets/...; links to other pages
  of the site go to https://t7d.dev/..., which shows the live version of that page.
- assets/site.css (font URLs made relative), site.js, theme.js and the fonts; every other /assets/ file the page uses;
  and the files in the page's own folder (for example a download).

Publish it with the Artifact tool: file_path <out>/index.html, files { "<path>": "<out>/<path>", ... } for every other
file in the out dir (the script prints them). The same file_path updates the same artifact. Standard library only.

--narration <dir> puts a local test narration (scripts/narration/narrate-local.py) in place of the page's
narration.json, with its narration.mp3, so the preview plays that voice.
"""
import json, os, re, shutil, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SITE = 'https://t7d.dev'


def add_narration(out, src):
    """The test narration of src (narration.json and narration.mp3) in place of the page's own narration.json."""
    n = json.load(open(os.path.join(src, 'narration.json'), encoding='utf-8'))
    shutil.copy(os.path.join(src, 'narration.mp3'), os.path.join(out, 'narration.mp3'))
    n['audio'] = 'narration.mp3'
    json.dump(n, open(os.path.join(out, 'narration.json'), 'w', encoding='utf-8'))


def build(page, out, narration=None):
    page = page.strip('/')
    src_dir = os.path.join(ROOT, page)
    html = open(os.path.join(src_dir, 'index.html'), encoding='utf-8').read()
    if os.path.isdir(out):
        shutil.rmtree(out)
    os.makedirs(out)

    head = html[html.index('<head>') + 6:html.index('</head>')]
    body = html[html.index('<body>') + 6:html.rindex('</body>')]
    head = re.sub(r'\s*<meta charset[^>]*>', '', head)
    head = re.sub(r'\s*<meta name="viewport"[^>]*>', '', head)
    head = re.sub(r'\s*<meta http-equiv="Content-Security-Policy"[^>]*>', '', head)
    head = re.sub(r'\s*<link rel="(preload|alternate|canonical)"[^>]*>', '', head)
    head = re.sub(r'(<title>.*?)\s*·\s*Tim Conrad</title>', r'\1</title>', head)  # the artifact's name
    doc = head.strip() + '\n' + body.strip() + '\n'

    # files of the page's own folder: keep them next to the page
    own = [f for f in os.listdir(src_dir) if f != 'index.html' and os.path.isfile(os.path.join(src_dir, f))]
    for f in own:
        shutil.copy(os.path.join(src_dir, f), os.path.join(out, f))
        doc = doc.replace(f'"/{page}/{f}"', f'"{f}"')

    used = set(re.findall(r'"/(assets/[^"#?]+)"', doc)) | {'assets/site.css', 'assets/site.js', 'assets/theme.js'}
    doc = re.sub(r'"/assets/', '"assets/', doc)
    # every other link to the site: the live page
    doc = re.sub(r'(href|src)="/(?!/)', lambda m: f'{m.group(1)}="{SITE}/', doc)
    # downloads are blocked in the viewer; the file opens instead. Only the attribute inside a tag, never the word in the text.
    doc = re.sub(r'<a\b[^>]*>', lambda m: re.sub(r'\s+download(?:="[^"]*")?(?=[\s>/])', '', m.group(0)), doc)

    for rel in sorted(used):
        dst = os.path.join(out, rel)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy(os.path.join(ROOT, rel), dst)
    css_path = os.path.join(out, 'assets/site.css')
    css = open(css_path, encoding='utf-8').read()
    for font in re.findall(r'url\("/assets/(fonts/[^"]+)"\)', css):
        dst = os.path.join(out, 'assets', font)
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copy(os.path.join(ROOT, 'assets', font), dst)
    open(css_path, 'w', encoding='utf-8').write(re.sub(r'url\("/assets/', 'url("', css))

    open(os.path.join(out, 'index.html'), 'w', encoding='utf-8').write(doc)
    if narration:
        add_narration(out, os.path.join(ROOT, narration))
    files = {}
    for d, _, fs in os.walk(out):
        for f in fs:
            rel = os.path.relpath(os.path.join(d, f), out).replace('\\', '/')
            if rel != 'index.html':
                files[rel] = os.path.join(d, f)
    return files


if __name__ == '__main__':
    args, narration = sys.argv[1:], None
    if '--narration' in args:
        i = args.index('--narration')
        narration = args[i + 1].strip('/')
        del args[i:i + 2]
    if not args:
        sys.exit(__doc__)
    page = args[0]
    out = os.path.abspath(args[1] if len(args) > 1 else os.path.join(ROOT, '.preview', page.strip('/').replace('/', '-')))
    files = build(page, out, narration)
    print(json.dumps({'file_path': os.path.join(out, 'index.html'), 'files': files}, indent=2))
