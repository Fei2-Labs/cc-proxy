#!/usr/bin/env python3
"""Generate CC Proxy app icon — clean bolt + shield"""
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

def dist(x, y, cx, cy):
    return math.sqrt((x-cx)**2 + (y-cy)**2)

# Shield polygon (centered, scaled)
def make_shield(cx, cy, s):
    return [
        (cx - s*0.62, cy - s*0.72),  # top-left
        (cx + s*0.62, cy - s*0.72),  # top-right
        (cx + s*0.62, cy + s*0.05),  # right shoulder
        (cx, cy + s*0.82),           # bottom point
        (cx - s*0.62, cy + s*0.05),  # left shoulder
    ]

# Lightning bolt polygon
def make_bolt(cx, cy, s):
    return [
        (cx + s*0.05, cy - s*0.52),   # top
        (cx + s*0.22, cy - s*0.52),   # top-right
        (cx + s*0.02, cy - s*0.04),   # middle-right notch
        (cx + s*0.20, cy - s*0.04),   # middle-right out
        (cx - s*0.05, cy + s*0.52),   # bottom
        (cx - s*0.22, cy + s*0.52),   # bottom-left
        (cx - s*0.02, cy + s*0.04),   # middle-left notch
        (cx - s*0.20, cy + s*0.04),   # middle-left out
    ]

shield = make_shield(c, c - 10, 380)
bolt = make_bolt(c, c - 10, 380)

# Slightly larger shield for border
shield_border = make_shield(c, c - 10, 400)

pixels = []
for y in range(W):
    for x in range(W):
        r, g, b, a = 18, 18, 28, 255

        if not in_rounded_rect(x, y, c, c, W//2, W//2, W//5):
            a = 0
        else:
            # Subtle radial glow
            d = dist(x, y, c, c - 20)
            if d < 350:
                gt = max(0, 1 - d / 350) * 0.12
                r = min(255, int(r + 80 * gt))
                g = min(255, int(g + 120 * gt))
                b = min(255, int(b + 255 * gt))

            # Shield border (subtle lighter edge)
            if in_polygon(x, y, shield_border) and not in_polygon(x, y, shield):
                r, g, b = 80, 115, 210

            # Shield fill
            if in_polygon(x, y, shield):
                # Gradient top to bottom
                ny = (y - (c - 10 - 380*0.72)) / (380 * 1.54)
                ny = max(0, min(1, ny))
                r = int(75 + 40 * ny)
                g = int(120 + 30 * ny)
                b = int(235 - 20 * ny)

                # Bolt
                if in_polygon(x, y, bolt):
                    r, g, b = 255, 210, 60

        pixels.append((r, g, b, a))

png_data = make_png(pixels, W, W)
out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'icon_1024.png')
with open(out, 'wb') as f:
    f.write(png_data)
print(f"✅ {out}")
