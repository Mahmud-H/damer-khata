# -*- coding: utf-8 -*-
"""
Damer Khata - Assemble app.html
"""
import os, base64

BASE_DIR = r"C:\Users\Mahmud\.gemini\antigravity\scratch\damer-khata"
BUILDER_DIR = os.path.join(BASE_DIR, "builder")
FONT_PATH = r"C:\Windows\Fonts\kalpurush.ttf"

OUTPUT_ROOT = os.path.join(BASE_DIR, "app.html")
OUTPUT_ASSETS = os.path.join(BASE_DIR, "app", "src", "main", "assets", "app.html")

print("Reading font file...")
with open(FONT_PATH, "rb") as f:
    font_b64 = base64.b64encode(f.read()).decode("ascii")

print("Reading styles.css...")
with open(os.path.join(BUILDER_DIR, "styles.css"), "r", encoding="utf-8") as f:
    css_content = f.read()

print("Reading body.html...")
with open(os.path.join(BUILDER_DIR, "body.html"), "r", encoding="utf-8") as f:
    body_content = f.read()

print("Reading app.js...")
with open(os.path.join(BUILDER_DIR, "app.js"), "r", encoding="utf-8") as f:
    js_content = f.read()

font_face_css = f"""
@font-face {{
  font-family: 'Kalpurush';
  src: url('data:font/ttf;base64,{font_b64}') format('truetype');
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}}
"""

full_html = f"""<!DOCTYPE html>
<html lang="bn">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <meta name="theme-color" content="#1F7A52">
  <meta name="app-version" content="1.0.1">
  <title>দামের খাতা</title>
  <style>
{font_face_css}
{css_content}
  </style>
</head>
<body>
{body_content}
<script>
{js_content}
</script>
</body>
</html>
"""

os.makedirs(os.path.dirname(OUTPUT_ASSETS), exist_ok=True)

with open(OUTPUT_ROOT, "w", encoding="utf-8") as f:
    f.write(full_html)
print(f"Written: {OUTPUT_ROOT} ({os.path.getsize(OUTPUT_ROOT)} bytes)")

with open(OUTPUT_ASSETS, "w", encoding="utf-8") as f:
    f.write(full_html)
print(f"Written: {OUTPUT_ASSETS} ({os.path.getsize(OUTPUT_ASSETS)} bytes)")

print("app.html successfully built!")
