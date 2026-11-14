#!/usr/bin/env python3
"""Center the existing duck logo as an SVG, then rasterize for iPhone.
Requires Python's cairo module. Does not alter the original logo.
"""
import base64
from pathlib import Path
import cairo

ROOT = Path(__file__).resolve().parent.parent
logo = base64.b64encode((ROOT / 'web' / 'logo pato.png').read_bytes()).decode('ascii')
svg = f'''<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="512" height="512" viewBox="0 0 512 512">
<title>TV</title>
<rect width="512" height="512" fill="#F5F5F7"/>
<image x="48" y="64.5" width="416" height="383" xlink:href="data:image/png;base64,{logo}"/>
</svg>
'''
(ROOT / 'web' / 'app-icon.svg').write_text(svg)
size = 180
surface = cairo.ImageSurface(cairo.FORMAT_RGB24, size, size)
context = cairo.Context(surface)
context.scale(size / 512, size / 512)
context.set_source_rgb(245 / 255, 245 / 255, 247 / 255)
context.paint()
source = cairo.ImageSurface.create_from_png(str(ROOT / 'web' / 'logo pato.png'))
context.save()
context.translate(48, 64.5)
context.scale(416 / source.get_width(), 383 / source.get_height())
context.set_source_surface(source)
context.paint()
context.restore()
surface.write_to_png(str(ROOT / 'web' / 'apple-touch-icon.png'))
