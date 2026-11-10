#!/usr/bin/env python3
"""Writes /llms.txt and the RSS feed of the blog (/blog/feed.xml) from the pages of the site.

  python3 tools/gen-feeds.py [<site folder>]

The folder defaults to the repository root. tools/deploy.sh runs it on the published copy, so both files always
match the pages and nobody edits them by hand. Everything comes from each page's <head>: <title>, the meta
description, the canonical URL and article:published_time. A page is listed in its section by its folder:
projects/ (games), blog/<slug>/ (posts), research/ (write-ups). Standard library only.
"""
import html, os, re, sys
from datetime import datetime, timezone
from email.utils import format_datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SITE = 'https://t7d.dev'


def meta(path):
    s = open(path, encoding='utf-8').read()
    head = s[:s.find('</head>')]
    def m(pat):
        r = re.search(pat, head, re.S)
        return html.unescape(r.group(1).strip()) if r else ''
    title = m(r'<title>(.*?)</title>')
    title = re.sub(r'\s*·\s*Tim Conrad$', '', title)
    return {
        'title': title,
        'desc': m(r'<meta name="description" content="([^"]*)"'),
        'url': m(r'<link rel="canonical" href="([^"]*)"') or SITE + '/' + os.path.relpath(os.path.dirname(path), ROOT).replace('\\', '/') + '/',
        'date': m(r'<meta property="article:published_time" content="([^"]*)"'),
    }


def pages(folder):
    """The pages one level below a folder (folder/<name>/index.html), newest first when they carry a date."""
    base = os.path.join(ROOT, folder)
    if not os.path.isdir(base):
        return []
    out = [meta(os.path.join(base, d, 'index.html')) for d in sorted(os.listdir(base))
           if os.path.isfile(os.path.join(base, d, 'index.html'))]
    return sorted(out, key=lambda p: p['date'], reverse=True)


def md_link(p):
    return f"- [{p['title']}]({p['url']}): {p['desc']}"


def llms():
    home = meta(os.path.join(ROOT, 'index.html'))
    games, posts, research = pages('projects'), pages('blog'), pages('research')
    lines = [f"# {home['title'] or 'Tim Conrad'}", '', f"> {home['desc']}", '',
             'The personal site of Tim Conrad: security research and browser games. Plain HTML with no tracking.',
             'Each page below is a normal HTML page; the blog has an RSS feed.', '']
    for name, items in (('Games', games), ('Blog', posts), ('Research', research)):
        if items:
            lines += [f'## {name}', ''] + [md_link(p) for p in items] + ['']
    lines += ['## Optional', '',
              f'- [Blog RSS feed]({SITE}/blog/feed.xml): every post, newest first',
              f'- [PGP key]({SITE}/key.asc): RSA 3072, fingerprint A886 6CB1 6B07 9685 5615 74B2 A91D ABBE C996 7390',
              f'- [Sitemap]({SITE}/sitemap.xml)', '']
    return '\n'.join(lines)


def rss():
    posts = pages('blog')
    def when(p):
        d = datetime.strptime(p['date'], '%Y-%m-%d').replace(tzinfo=timezone.utc) if p['date'] else datetime.now(timezone.utc)
        return format_datetime(d)
    e = lambda t: html.escape(t, quote=False)
    items = ''.join(f'''    <item>
      <title>{e(p['title'])}</title>
      <link>{e(p['url'])}</link>
      <guid isPermaLink="true">{e(p['url'])}</guid>
      <pubDate>{when(p)}</pubDate>
      <description>{e(p['desc'])}</description>
    </item>
''' for p in posts)
    last = when(posts[0]) if posts else format_datetime(datetime.now(timezone.utc))
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Tim Conrad · Blog</title>
    <link>{SITE}/blog/</link>
    <atom:link href="{SITE}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    <description>Notes by Tim Conrad on security ideas.</description>
    <language>en</language>
    <lastBuildDate>{last}</lastBuildDate>
{items}  </channel>
</rss>
'''


# the generated files, by their path on the site
FILES = {'llms.txt': llms, 'blog/feed.xml': rss}


def build(root):
    """The text of each generated file for the site in `root`. The review server (tools/review/devserver.py) uses it."""
    global ROOT
    ROOT = os.path.abspath(root)
    return {path: make() for path, make in FILES.items()}


if __name__ == '__main__':
    if len(sys.argv) > 1:
        ROOT = os.path.abspath(sys.argv[1])
    for path, text in build(ROOT).items():
        os.makedirs(os.path.dirname(os.path.join(ROOT, path)), exist_ok=True)
        open(os.path.join(ROOT, path), 'w', encoding='utf-8').write(text)
    print('wrote', ' and '.join(FILES), 'in', ROOT)
