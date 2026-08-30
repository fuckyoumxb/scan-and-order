import qrcode
from PIL import Image, ImageDraw, ImageFont
import os

# 示例桌码：扫码进入顾客点餐页。生产环境把域名换成你的真实地址。
TABLE = 12
URL = f"http://localhost:4173/?table={TABLE}"   # 部署后改为 https://你的域名/index.html?table={TABLE}
OUT_DIR = "qrcodes"
os.makedirs(OUT_DIR, exist_ok=True)

qr = qrcode.QRCode(box_size=10, border=2, error_correction=qrcode.constants.ERROR_CORRECT_M)
qr.add_data(URL)
qr.make(fit=True)
qr_img = qr.make_image(fill_color="#1f2329", back_color="white").convert("RGB")

# 组合成可打印桌牌：白底 + 标题 + 二维码 + 桌号
W = qr_img.width + 80
H = qr_img.height + 160
sheet = Image.new("RGB", (W, H), "white")
d = ImageDraw.Draw(sheet)
try:
    font_big = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 30)
    font_sm = ImageFont.truetype("C:/Windows/Fonts/msyh.ttc", 18)
except Exception:
    font_big = ImageFont.load_default()
    font_sm = ImageFont.load_default()

d.text((W // 2, 24), "扫码点餐", fill="#ff6b35", font=font_big, anchor="mm")
sheet.paste(qr_img, (40, 70))
d.text((W // 2, H - 50), f"桌号 {TABLE}", fill="#1f2329", font=font_big, anchor="mm")
d.text((W // 2, H - 18), "Scan to order", fill="#8a9099", font=font_sm, anchor="mm")

out = os.path.join(OUT_DIR, f"table-{TABLE}.png")
sheet.save(out)
print("saved", os.path.abspath(out), sheet.size)
