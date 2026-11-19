"""Tests of gen-tools.py. Run: uv run --no-project --with markdown==3.11.3 python3 -m unittest scripts/test_gen_tools.py"""
import importlib.util, io, json, os, shutil, subprocess, sys, tempfile, unittest
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))

PAGE = """<!doctype html><html><head><title>X</title></head><body><article class="prose">
<!-- tool-readme: Tim-Conrad/papercuts -->
<p>The README is added when the site is published.</p>
<!-- /tool-readme -->
</article></body></html>"""

README = """# Papercuts

Papercuts is one place.

## Quick start

See [the relay](#run-the-relay).

```sh
npx papercuts add tool "x <y>"
```

| A | B |
| --- | --- |
| 1 | 2 |

## Run the relay

<script>alert(1)</script>

Text with <b onclick="x()">raw html</b> inline.
"""


class GenTools(unittest.TestCase):
    def setUp(self):
        self.site = tempfile.mkdtemp()
        self.readmes = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.site, 'tools', 'papercuts'))
        with open(os.path.join(self.site, 'tools', 'papercuts', 'index.html'), 'w') as f:
            f.write(PAGE)
        with open(os.path.join(self.readmes, 'papercuts.md'), 'w') as f:
            f.write(README)

    def tearDown(self):
        shutil.rmtree(self.site)
        shutil.rmtree(self.readmes)

    def page(self):
        with open(os.path.join(self.site, 'tools', 'papercuts', 'index.html')) as f:
            return f.read()

    def run_gen(self):
        return subprocess.run([sys.executable, os.path.join(HERE, 'gen-tools.py'), self.site, '--readme-dir', self.readmes],
                              capture_output=True, text=True)

    def test_fills_readme_placeholder(self):
        r = self.run_gen()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        s = self.page()
        self.assertNotIn('added when the site is published', s)
        self.assertIn('<h2 id="quick-start">Quick start</h2>', s)
        self.assertIn('href="#run-the-relay"', s)
        self.assertIn('id="run-the-relay"', s)
        self.assertIn('<!-- tool-readme: Tim-Conrad/papercuts -->', s)
        self.assertIn('<!-- /tool-readme -->', s)

    def test_drops_the_title(self):
        self.run_gen()
        self.assertNotIn('<h1', self.page())

    def test_code_block_uses_site_component(self):
        self.run_gen()
        s = self.page()
        self.assertIn('<div class="code"><div class="code__bar"><span>sh</span></div><pre>', s)
        self.assertIn('&lt;y&gt;', s)

    def test_table_scrolls_in_own_box(self):
        self.run_gen()
        self.assertIn('<div class="tbl"><table>', self.page())

    def test_strips_raw_html_and_script(self):
        self.run_gen()
        s = self.page()
        self.assertNotIn('<script>', s)
        self.assertNotIn('<b onclick', s)
        self.assertIn('&lt;script&gt;', s)

    def test_second_run_is_stable(self):
        self.run_gen()
        first = self.page()
        self.run_gen()
        self.assertEqual(first, self.page())

    def test_missing_readme_exits_1(self):
        os.remove(os.path.join(self.readmes, 'papercuts.md'))
        r = self.run_gen()
        self.assertEqual(r.returncode, 1)
        self.assertIn('error:', r.stdout + r.stderr)

    def test_page_without_placeholder_is_left_alone(self):
        os.makedirs(os.path.join(self.site, 'tools', 'other'))
        path = os.path.join(self.site, 'tools', 'other', 'index.html')
        with open(path, 'w') as f:
            f.write('<p>plain</p>')
        self.assertEqual(self.run_gen().returncode, 0)
        with open(path) as f:
            self.assertEqual(f.read(), '<p>plain</p>')


SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 680 100" role="img" aria-labelledby="p-t p-d">
  <title id="p-t">Two boxes</title>
  <desc id="p-d">A box and a line.</desc>
  <style data-standalone="">.bx { fill: #fff; }</style>
  <rect class="paper" data-standalone="" width="680" height="100"/>
  <rect class="bx" x="10" y="10" width="100" height="40"/>
  <text x="60" y="35" class="t-h" text-anchor="middle">A &amp; B</text>
  <polyline class="ln" points="110,30 200,30"/>
</svg>"""

GUIDE = """# Tool, shown

Intro, see the [README](README.md#setup) and [the top](#how).

## How

![Two boxes and a line](docs/showme/parts.svg "The parts.")

After the picture.
"""


def load():
    spec = importlib.util.spec_from_file_location('gen_tools', os.path.join(HERE, 'gen-tools.py'))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


class Guide(unittest.TestCase):
    """A page that names its file (SHOWME.md), with pictures, and pages with a version marker."""
    def setUp(self):
        self.site = tempfile.mkdtemp()
        self.repo = tempfile.mkdtemp()
        os.makedirs(os.path.join(self.site, 'tools', 'papercuts'))
        self.page_path = os.path.join(self.site, 'tools', 'papercuts', 'index.html')
        with open(self.page_path, 'w') as f:
            f.write(PAGE.replace('Tim-Conrad/papercuts -->', 'Tim-Conrad/papercuts SHOWME.md -->')
                    .replace('</article>', '<dd><!-- tool-version: Tim-Conrad/papercuts -->v0.0.1<!-- /tool-version --></dd></article>'))
        with open(os.path.join(self.site, 'index.html'), 'w') as f:
            f.write('<p><!-- tool-version: Tim-Conrad/papercuts -->v0.0.1<!-- /tool-version --> · MIT</p>')
        os.makedirs(os.path.join(self.repo, 'docs', 'showme'))
        self.write('SHOWME.md', GUIDE)
        self.write('docs/showme/parts.svg', SVG)

    def tearDown(self):
        shutil.rmtree(self.site)
        shutil.rmtree(self.repo)

    def write(self, path, text):
        with open(os.path.join(self.repo, path), 'w') as f:
            f.write(text)

    def page(self):
        with open(self.page_path) as f:
            return f.read()

    def run_local(self):
        return subprocess.run([sys.executable, os.path.join(HERE, 'gen-tools.py'), self.site, '--local', f'papercuts={self.repo}'],
                              capture_output=True, text=True)

    def test_picture_goes_inline_with_the_site_classes(self):
        r = self.run_local()
        self.assertEqual(r.returncode, 0, r.stdout + r.stderr)
        s = self.page()
        self.assertIn('<figure class="fig-wide"><svg class="dg" viewBox="0 0 680 100" role="img" aria-labelledby="papercuts1-p-t papercuts1-p-d">', s)
        self.assertIn('<title id="papercuts1-p-t">Two boxes</title>', s)
        self.assertIn('<figcaption>Fig. 1 · The parts.</figcaption></figure>', s)
        self.assertIn('<rect class="bx" x="10" y="10" width="100" height="40"/>', s)
        self.assertIn('A &amp; B', s)
        self.assertIn('<p>After the picture.</p>', s)

    def test_picture_loses_its_own_style_and_paper(self):
        self.run_local()
        s = self.page()
        self.assertNotIn('<style', s)
        self.assertNotIn('class="paper"', s)
        self.assertNotIn('<img', s)

    def test_picture_with_a_colour_or_a_script_stops_the_run(self):
        for bad in ('<rect fill="red" x="1" y="1" width="2" height="2"/>', '<script>alert(1)</script>',
                    '<rect class="mine" x="1" y="1" width="2" height="2"/>', '<rect style="fill:red" x="1" y="1" width="2" height="2"/>',
                    '<a href="https://example.com"><text x="1" y="1">x</text></a>'):
            self.write('docs/showme/parts.svg', SVG.replace('</svg>', bad + '</svg>'))
            r = self.run_local()
            self.assertEqual(r.returncode, 1, bad)
            self.assertIn('error:', r.stdout)
            self.assertIn('added when the site is published', self.page(), bad)

    def test_picture_from_another_site_stops_the_run(self):
        self.write('SHOWME.md', GUIDE.replace('docs/showme/parts.svg', 'https://example.com/x.svg'))
        self.assertEqual(self.run_local().returncode, 1)

    def test_contents_list_gets_the_headings(self):
        with open(self.page_path) as f:
            page = f.read()
        with open(self.page_path, 'w') as f:
            f.write(page.replace('<article', '<ol><li><a href="#mine">Mine</a></li><!-- tool-toc --><!-- /tool-toc --></ol><article'))
        self.run_local()
        first = self.page()
        self.assertIn('<li><a href="#mine">Mine</a></li><!-- tool-toc -->\n      <li><a href="#how">How</a></li>\n      <!-- /tool-toc -->', first)
        self.run_local()
        self.assertEqual(first, self.page())

    def test_links_into_the_repo_go_to_github(self):
        self.run_local()
        s = self.page()
        self.assertIn('href="https://github.com/Tim-Conrad/papercuts/blob/HEAD/README.md#setup"', s)
        self.assertIn('href="#how"', s)

    def test_local_run_leaves_the_versions(self):
        self.run_local()
        self.assertIn('v0.0.1', self.page())

    def test_release_sets_file_pictures_links_and_versions(self):
        mod = load()
        asked = []

        def fetch(url):
            asked.append(url)
            if url.endswith('/releases/latest'):
                return json.dumps({'tag_name': 'v1.2.3'})
            path = url.split('/v1.2.3/', 1)[1]
            with open(os.path.join(self.repo, path)) as f:
                return f.read()

        mod.fetch = fetch
        with redirect_stdout(io.StringIO()):
            self.assertEqual(mod.main([self.site]), 0)
        s = self.page()
        self.assertIn('<!-- Tim-Conrad/papercuts SHOWME.md, v1.2.3 -->', s)
        self.assertIn('<svg class="dg"', s)
        self.assertIn('blob/v1.2.3/README.md#setup', s)
        self.assertIn('<!-- tool-version: Tim-Conrad/papercuts -->v1.2.3<!-- /tool-version -->', s)
        with open(os.path.join(self.site, 'index.html')) as f:
            self.assertIn('-->v1.2.3<!--', f.read())
        self.assertIn('https://raw.githubusercontent.com/Tim-Conrad/papercuts/v1.2.3/SHOWME.md', asked)
        self.assertEqual(sum(u.endswith('/releases/latest') for u in asked), 1)
        first = s
        with redirect_stdout(io.StringIO()):
            mod.main([self.site])
        self.assertEqual(first, self.page())


if __name__ == '__main__':
    unittest.main()
