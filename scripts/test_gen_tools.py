"""Tests of gen-tools.py. Run: uv run --no-project --with markdown==3.11.3 python3 -m unittest scripts/test_gen_tools.py"""
import os, shutil, subprocess, sys, tempfile, unittest

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


if __name__ == '__main__':
    unittest.main()
