# -*- coding: utf-8 -*-
"""
Damer Khata - Single-File HTML Builder
Embeds Kalpurush font as Base64, produces complete app.html
"""
import os, base64

FONT_PATH = r"C:\Windows\Fonts\kalpurush.ttf"
OUTPUT_ASSETS = r"C:\Users\Mahmud\.gemini\antigravity\scratch\damer-khata\app\src\main\assets\app.html"
OUTPUT_ROOT = r"C:\Users\Mahmud\.gemini\antigravity\scratch\damer-khata\app.html"

print("Reading font file...")
with open(FONT_PATH, "rb") as f:
    font_b64 = base64.b64encode(f.read()).decode("ascii")
print(f"Font loaded: {len(font_b64)} chars")
