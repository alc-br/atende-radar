"""Confere capturas novas contra os hashes de docs/crm/01-baseline-visual.md (as 27 guardadas e as 94 só listadas).

uso: python scripts/visual/comparar_hashes.py docs/crm/01-baseline-visual.md <pasta_design> <pasta_a11y>
<pasta_design> tem screens/ e screens-largas/ (do design.ui); <pasta_a11y> tem screens/ (do a11y.ui).
Requer Python 3 e Pillow. Sai em JSON: total, contagem por situação e uma linha por captura
(igual / mesma dimensão, bytes diferentes / dimensão diferente / sem captura nova).
"""
import hashlib
import json
import re
import sys
from pathlib import Path

from PIL import Image

doc, design, a11y = Path(sys.argv[1]), Path(sys.argv[2]), Path(sys.argv[3])
text = doc.read_text(encoding="utf-8")

esperado = {}
# tabela das 27: | `arquivo` | KB | LxA | `sha` |  (dark-* vêm do a11y.ui; dados-* do design.ui)
for m in re.finditer(r"^\| `([^`]+\.png)` \| [\d,.]+ \| (\d+x\d+) \| `([0-9a-f]{64})` \|", text, re.M):
    nome, dims, sha = m.groups()
    origem = ("a11y/screens/" if nome.startswith("dark-") else "design/screens/") + nome
    esperado[origem] = (sha, dims)
# lista das 94: sha  LxA  bytes  origem
for m in re.finditer(r"^([0-9a-f]{64})\s+(\d+x\d+)\s+\d+\s+(\S+\.png)$", text, re.M):
    sha, dims, origem = m.groups()
    esperado[origem] = (sha, dims)

pastas = {"design/screens/": design / "screens", "design/screens-largas/": design / "screens-largas", "a11y/screens/": a11y / "screens"}
rows = []
for origem, (sha, dims) in sorted(esperado.items()):
    pref = next(p for p in pastas if origem.startswith(p))
    f = pastas[pref] / origem[len(pref):]
    if not f.exists():
        rows.append({"origem": origem, "situacao": "sem captura nova"})
        continue
    novo_sha = hashlib.sha256(f.read_bytes()).hexdigest()
    with Image.open(f) as im:
        novo_dims = f"{im.width}x{im.height}"
    rows.append({
        "origem": origem,
        "situacao": "igual" if novo_sha == sha else ("mesma dimensão, bytes diferentes" if novo_dims == dims else "dimensão diferente"),
        "base": dims,
        "nova": novo_dims,
    })

resumo = {}
for r in rows:
    resumo[r["situacao"]] = resumo.get(r["situacao"], 0) + 1
print(json.dumps({"total": len(rows), "resumo": resumo, "linhas": rows}, ensure_ascii=False, indent=1))
