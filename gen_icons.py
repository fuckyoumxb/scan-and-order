import zlib, struct

BG = (255, 107, 53)      # 品牌橙
PLATE = (255, 255, 255)  # 白盘
FOOD = (226, 85, 31)     # 盘中食物(深橙)

def make_png(path, size, bg, plate_r, food_r):
    raw = bytearray()
    cx = cy = size / 2.0
    for y in range(size):
        raw.append(0)  # filter type 0
        for x in range(size):
            dx = x - cx + 0.5
            dy = y - cy + 0.5
            d = (dx * dx + dy * dy) ** 0.5
            if d < food_r:
                col = FOOD
            elif d < plate_r:
                col = PLATE
            else:
                col = bg
            raw.extend(col)
    def chunk(typ, data):
        c = typ + data
        return struct.pack(">I", len(data)) + c + struct.pack(">I", zlib.crc32(c) & 0xffffffff)
    sig = b"\x89PNG\r\n\x1a\n"
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0)
    idat = zlib.compress(bytes(raw), 9)
    png = sig + chunk(b"IHDR", ihdr) + chunk(b"IDAT", idat) + chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(png)

base = "icons/"
make_png(base + "icon-192.png", 192, BG, 192 * 0.34, 192 * 0.20)
make_png(base + "icon-512.png", 512, BG, 512 * 0.34, 512 * 0.20)
# maskable：安全区更小，铺满背景
make_png(base + "icon-maskable-512.png", 512, BG, 512 * 0.26, 512 * 0.15)
print("icons generated")
