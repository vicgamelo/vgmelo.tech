"""Gera public/og.png (1200x630) para links compartilhados. Rodar: uv run --with pillow scripts/og.py"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
img = Image.new("RGB", (W, H), "#0b0f14")
d = ImageDraw.Draw(img)


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in ("/System/Library/Fonts/SFNS.ttf", "/System/Library/Fonts/Helvetica.ttc", "/Library/Fonts/Arial.ttf"):
        try:
            return ImageFont.truetype(path, size, index=1 if bold and path.endswith(".ttc") else 0)
        except OSError:
            continue
    return ImageFont.load_default(size)


mono = None
for path in ("/System/Library/Fonts/SFNSMono.ttf", "/System/Library/Fonts/Menlo.ttc"):
    try:
        mono = ImageFont.truetype(path, 30)
        break
    except OSError:
        pass
mono = mono or font(30)

d.rounded_rectangle((80, 80, 152, 152), radius=18, fill="#121922", outline="#1f2a37", width=2)
d.text((116, 116), "vm", font=mono, fill="#5eead4", anchor="mm")
d.text((80, 230), "Victor Gabriel Andrade de Melo", font=font(64, True), fill="#e6edf3")
d.text((80, 320), "MLOps & AI Engineer", font=font(44), fill="#5eead4")
d.text((80, 400), "Agentes · MCP · Observabilidade de LLM · ML em produção", font=font(32), fill="#94a3b8")
d.text((80, 520), "vgmelo.tech", font=mono, fill="#a78bfa")
img.save("public/og.png", optimize=True)
print("ok")
