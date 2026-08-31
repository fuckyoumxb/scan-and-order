import base64, os

SRC = r"C:/Users/ZhuanZ/Desktop/Weixin Image_20260901014309_225_119.jpg"
CFG = r"D:/文件/workbuddy/2026-08-30-16-20-35/scan-order-pwa/js/config.js"

with open(SRC, "rb") as f:
    data = f.read()

# 通过文件头判断 MIME（不依赖扩展名）
if data[:8] == b"\x89PNG\r\n\x1a\n":
    mime = "image/png"
elif data[:3] == b"\xff\xd8\xff":
    mime = "image/jpeg"
else:
    raise SystemExit("无法识别的图片格式")

b64 = base64.b64encode(data).decode("ascii")
data_url = f"data:{mime};base64,{b64}"

with open(CFG, "r", encoding="utf-8") as f:
    src = f.read()

old = 'const FALLBACK_PAY_QR = "";'
if old not in src:
    raise SystemExit("未找到 FALLBACK_PAY_QR 占位符，请检查 config.js")

src = src.replace(old, f'const FALLBACK_PAY_QR = "{data_url}";', 1)

with open(CFG, "w", encoding="utf-8") as f:
    f.write(src)

print("OK", "mime=", mime, "src_bytes=", len(data), "b64_len=", len(b64))
