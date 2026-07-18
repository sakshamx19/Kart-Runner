#!/usr/bin/env python3
"""Rebuild '../KART RUNNER 3D - Playable.html' from src/ + lib/ (run from kart-runner-3d/)."""
import os, re
here = os.path.dirname(os.path.abspath(__file__))
def rd(p): return open(os.path.join(here, p), encoding="utf-8").read()
shell = re.search(r"<body>\n(.*?)\n<script", rd("index.html"), re.S).group(1)
js = "\n".join(rd(f"src/{f}") for f in sorted(os.listdir(os.path.join(here, "src"))) if f.endswith(".js"))
html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="theme-color" content="#FFF6E5">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<title>KART RUNNER 3D</title>
<style>
{rd("src/fonts.css")}
{rd("src/style.css")}
</style>
</head>
<body>
{shell}
<script>
{rd("lib/three.iife.js")}
</script>
<script>
{rd("lib/peerjs.iife.js")}
</script>
<script>
{js}
</script>
</body>
</html>
"""
out = os.path.join(here, "..", "KART RUNNER 3D - Playable.html")
open(out, "w", encoding="utf-8").write(html)
print("wrote", os.path.abspath(out), len(html), "bytes")
