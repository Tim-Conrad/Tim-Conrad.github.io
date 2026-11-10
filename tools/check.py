#!/usr/bin/env python3
"""Checks the rules of the site pages that must always hold. CI runs it before each deploy and on each pull request.

  python3 tools/check.py

For every HTML page in git (redirect pages excepted, they only carry a meta refresh):
- a Content-Security-Policy <meta> is there;
- no inline style: no style="" attribute and no <style> element;
- no inline script: every <script> has a src;
- the page's URL is in sitemap.xml (404.html excepted).

Exit code 1 and one line per problem when a rule is broken. Standard library only.
"""
import os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
SITE = 'https://t7d.dev'


def pages():
    out = subprocess.run(['git', '-C', ROOT, 'ls-files', '*.html'], capture_output=True, text=True, check=True).stdout
    return [p for p in out.split() if not p.startswith(('tools/', '.claude/'))]


def main():
    sitemap = open(os.path.join(ROOT, 'sitemap.xml'), encoding='utf-8').read()
    problems = []
    for p in pages():
        s = open(os.path.join(ROOT, p), encoding='utf-8').read()
        if re.search(r'<meta\s+http-equiv="refresh"', s, re.I):
            continue
        if not re.search(r'<meta\s+http-equiv="Content-Security-Policy"', s, re.I):
            problems.append(f'{p}: no Content-Security-Policy meta')
        if re.search(r'\sstyle\s*=\s*["\']', s, re.I):
            problems.append(f'{p}: style="" attribute')
        if re.search(r'<style[\s>]', s, re.I):
            problems.append(f'{p}: <style> element')
        for tag in re.findall(r'<script\b[^>]*>', s, re.I):
            if not re.search(r'\ssrc\s*=', tag, re.I):
                problems.append(f'{p}: inline <script>')
        if p != '404.html':
            url = SITE + '/' + (p[:-len('index.html')] if p.endswith('index.html') else p)
            if f'<loc>{url}</loc>' not in sitemap:
                problems.append(f'{p}: {url} is not in sitemap.xml')
    for line in problems:
        print(line)
    print(f'{len(pages())} pages checked, {len(problems)} problems')
    sys.exit(1 if problems else 0)


if __name__ == '__main__':
    main()
