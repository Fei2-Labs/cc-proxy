#!/usr/bin/env python3
"""Generate CC Proxy app icon — monochrome macOS style"""
import struct, zlib, math, os

W = 1024
c = W // 2

def png_chunk(ct, data):
    c2 = ct + data
    return struct.pack('>I', len(data)) + c2 + struct.pack('>I', zlib.crc32(c2) & 0xffffffff)

def make_png(px, w, h):
    raw = b''
    for y in range(h):
        raw += b'\x00'
        for x in range(w):
            raw += bytes(px[y * w + x])
    hdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', hdr) + png_chunk(b'IDAT', zlib.compress(raw, 9)) + png_chunk(b'IEND', b'')

def in_polygon(x, y, pts):
    n = len(pts)
    inside = False
    j = n - 1
    for i in range(n):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if ((yi > y) != (yj > y)) and (x < (xj - xi) * (y - yi) / (yj - yi) + xi):
            inside = not inside
        j = i
    return inside

def in_rounded_rect(x, y, cx, cy, hw, hh, r):
    dx = max(abs(x - cx) - hw + r, 0)
    dy = max(abs(y - cy) - hh + r, 0)
    return dx*dx + dy*dy <= r*r

def make_shield(cx, cy, s):
    return [
        (cx - s*0.60, cy - s*0.70),
        (cx + s*0.60, cy - s*0.70),
        (cx + s*0.60, cy + s*0.05),
        (cx, cy + s*0.80),
        (cx - s*0.60, cy + s*0.05),
    ]

def make_bolt(cx, cy, s):
    return [
        (cx + s*0.04, cy - s*0.45),
        (cx + s*0.20, cy - s*0.45),
        (cx + s*0.02, cy - s*0.03),
        (cx + s*0.18, cy - s*0.03),
        (cx - s*0.04, cy + s*0.45),
        (cx - s*0.20, cy + s*0.45),
        (cx - s*0.02, cy + s*0.03),
        (cx - s*0.18, cy + s*0.03),
    ]

shield_outer = make_shield(c, c, 400)
shield_inner = make_shield(c, c, 350)
bolt = make_bolt(c, c, 350)

pixels = []
for y in range(W):
    for x in range(W):
        r, g, b, a = 0, 0, 0, 0

        if in_rounded_rect(x, y, c, c, W//2, W//2, W//5):
            r, g, b, a = 30, 30, 30, 255

            in_outer = in_polygon(x, y, shield_outer)
            in_inner = in_polygon(x, y, shield_inner)

            if in_outer and not in_inner:
                r, g, b = 245, 245, 245
            elif in_inner:
                r, g, b = 30, 30, 30
                if in_polygon(x, y, bolt):
                    r, g, b = 245, 245, 245

        pixels.append((r, g, b, a))

png_data = make_png(pixels, W, W)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icon_1024.png')
with open(out, 'wb') as f:
    f.write(png_data)
print(f"✅ {out}")
