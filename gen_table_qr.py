import qrcode
from PIL import Image, ImageDraw, ImageFont
import os

# 线上点餐二维码：扫码即进入点餐页（无桌号，下单后自动获得「今日第 N 单」）。
# 部署后把 BASE_URL 换成你的真实站点地址（如 GitHub Pages 地址）。
BASE_URL = "https://fuckyoumxb.github.io/scan-and-order"
OUT_DIR = "qrcodes"
os.makedirs(OUT_DIR, exist_ok=True)


def make_sheet():
    qr = qrcode.QRCode(box_size=12, border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
    qr.add_data(BASE_URL + "/")
    qr.make(fit=True)
    qr_img = qr.make_image(fill_color="#1f2329", back_color="white").convert("RGB")

    W = qr_img.width + 80
    H = qr_img.height + 160
    sheet = Image.new("RGB", (W, H), "white")
    d = ImageDraw.Draw(sheet)
    try:
        font_big = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 32)
        font_sm = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
    except Exception:
        font_big = ImageFont.load_default()
        font_sm = ImageFont.load_default()

    d.text((W // 2, 24), "扫码点餐", fill="#ff6b35", font=font_big, anchor="mm")
    sheet.paste(qr_img, (40, 70))
    d.text((W // 2, H - 50), "线上点餐 · 无需桌号", fill="#1f2329", font=font_big, anchor="mm")
    d.text((W // 2, H - 18), "Scan to order", fill="#8a9099", font=font_sm, anchor="mm")

    out = os.path.join(OUT_DIR, "order.png")
    sheet.save(out)
    return out, sheet.size


out, size = make_sheet()
print("saved", os.path.abspath(out), size, "->", BASE_URL + "/")
