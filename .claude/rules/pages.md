---
paths:
  - "**/*.html"
  - "sitemap.xml"
  - "tools/deploy.sh"
---

# A new page, or a new top-level file or folder of the site

- Copy the `<head>` of an existing page, with its Content-Security-Policy line.
- Add the URL to `sitemap.xml` (`tools/check.py` fails without it).
- Add a new top-level file or folder to the `SITE` list in `tools/deploy.sh`, or it is not published.
- Update "Contents" in the title block of `index.html` and the sheet numbers of its sections.
