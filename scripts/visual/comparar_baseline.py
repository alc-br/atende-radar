"""Compara capturas novas com as do baseline (docs/crm/screenshots/baseline), pixel a pixel.

uso: python scripts/visual/comparar_baseline.py <pasta_baseline> <pasta_nova> <pasta_saida_diffs>
Requer Python 3 e Pillow (fora das dependências do projeto; é ferramenta de conferência, não roda no CI).
Sai em JSON uma linha por arquivo do baseline: dimensões, pixels diferentes (%), caixa da diferença e sha256 igual ou não.
Para cada arquivo diferente grava diff-<nome>.png: baseline | nova | nova com a diferença em vermelho, recortado na caixa.
"""
import hashlib
import json
import sys
from pathlib import Path

from PIL import Image, ImageChops

base_dir, new_dir, out_dir = (Path(p) for p in sys.argv[1:4])
out_dir.mkdir(parents=True, exist_ok=True)


def sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


rows = []
for b in sorted(base_dir.glob("*.png")):
    n = new_dir / b.name
    row = {"arquivo": b.name}
    if not n.exists():
        row["situacao"] = "sem captura nova"
        rows.append(row)
        continue
    row["sha_igual"] = sha(b) == sha(n)
    ib, inew = Image.open(b).convert("RGB"), Image.open(n).convert("RGB")
    row["base_px"] = f"{ib.width}x{ib.height}"
    row["nova_px"] = f"{inew.width}x{inew.height}"
    if ib.size != inew.size:
        # compara a área comum para saber se a diferença é só de altura (conteúdo a mais ou a menos)
        w, h = min(ib.width, inew.width), min(ib.height, inew.height)
        ib_c, in_c = ib.crop((0, 0, w, h)), inew.crop((0, 0, w, h))
    else:
        ib_c, in_c = ib, inew
    diff = ImageChops.difference(ib_c, in_c)
    bbox = diff.getbbox()
    # diferença acima de 16 (de 255) em algum canal; abaixo disso é suavização de borda
    mask = diff.convert("L").point(lambda v: 255 if v > 16 else 0)
    changed = mask.histogram()[255]
    total = mask.width * mask.height
    row["px_diferentes"] = changed
    row["pct"] = round(100 * changed / total, 3)
    row["caixa"] = list(bbox) if bbox else None
    if bbox:
        x0, y0, x1, y1 = bbox
        m = 40
        box = (max(0, x0 - m), max(0, y0 - m), min(ib_c.width, x1 + m), min(ib_c.height, y1 + m))
        a, c = ib_c.crop(box), in_c.crop(box)
        red = Image.new("RGB", a.size, (255, 0, 0))
        hl = Image.composite(red, c, mask.crop(box))
        sheet = Image.new("RGB", (a.width * 3 + 20, a.height), (255, 255, 255))
        sheet.paste(a, (0, 0))
        sheet.paste(c, (a.width + 10, 0))
        sheet.paste(hl, (a.width * 2 + 20, 0))
        sheet.save(out_dir / f"diff-{b.name}")
    row["situacao"] = "igual" if not bbox and ib.size == inew.size else "diferente"
    rows.append(row)

print(json.dumps(rows, ensure_ascii=False, indent=1))
