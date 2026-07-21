# /// script
# requires-python = ">=3.11"
# dependencies = ["psd-tools>=1.17", "aggdraw", "scikit-image", "scipy", "pillow", "numpy"]
# ///
"""
extract.py — Extrai design de um PSD para o pipeline pdf-forge.

Estratégia (validada): o composite do psd-tools (com efeitos) é pixel-perfect.
Para cada artboard gera:
  - uma REFERÊNCIA (composite recortado, com texto) e
  - uma PLACA (composite com TODOS os textos ocultos = fundo pronto, sem texto).
Os textos viram dados editáveis (string + bbox + cor MEDIDA via diff referência×placa),
para serem re-renderizados como HTML editável sobre a placa. Resultado: fundo
pixel-fiel + texto editável/vetorial.

Saídas em <outdir>:
  composite.png            composite full do documento
  slides/<slug>.png        referência por artboard (com texto)
  plates/<slug>.png        placa por artboard (sem texto)
  assets/<slug>/*.png      (opcional, --assets) camadas raster/smartobject/forma
  manifest.json            documento, artboards, fontes (best-effort), textos

Uso: uv run scripts/psd/extract.py <arquivo.psd> <outdir> [--assets]
"""
import argparse
import json
import os
import re
import sys

import numpy as np
from PIL import Image
from psd_tools import PSDImage
from scipy import ndimage

COLOR_MODES = {0: "Bitmap", 1: "Grayscale", 2: "Indexed", 3: "RGB",
               4: "CMYK", 7: "Multichannel", 8: "Duotone", 9: "Lab"}


def slugify(name: str, idx: int) -> str:
    s = re.sub(r"[^\w\-]+", "_", (name or "slide").strip()).strip("_").lower()[:40]
    return f"{idx:02d}_{s or 'slide'}"


def safe_bbox(layer):
    try:
        b = layer.bbox
        if (b[2] - b[0]) <= 0 or (b[3] - b[1]) <= 0:
            return None
        return [int(b[0]), int(b[1]), int(b[2]), int(b[3])]
    except Exception:
        return None


def font_names(type_layer):
    """Best-effort: nomes de fonte (PostScript) quando o EngineData existe.
    Muitos PSDs novos NÃO gravam EngineData -> retorna []."""
    names = []
    try:
        rd = type_layer.resource_dict
        if rd is None:
            return names
        fs = rd.get("FontSet") or rd.get(b"FontSet")
        for f in fs or []:
            nm = f.get("Name") if hasattr(f, "get") else None
            if isinstance(nm, bytes):
                nm = nm.decode("utf-8", "replace")
            if nm:
                names.append(str(nm).strip("\x00"))
    except Exception:
        pass
    return names


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("psd")
    ap.add_argument("outdir")
    ap.add_argument("--assets", action="store_true",
                    help="exporta cada camada raster/smartobject/forma como PNG")
    args = ap.parse_args()

    out = args.outdir
    os.makedirs(os.path.join(out, "slides"), exist_ok=True)
    os.makedirs(os.path.join(out, "plates"), exist_ok=True)

    psd = PSDImage.open(args.psd)
    W, H = psd.width, psd.height

    # 1) composite COM texto (referência) ----------------------------------
    comp = psd.composite().convert("RGB")
    comp.save(os.path.join(out, "composite.png"))
    comp_np = np.asarray(comp).astype(int)

    # 2) artboards (top-level kind=='artboard'); senão o documento inteiro ---
    arts = []
    for i, layer in enumerate(psd):
        if getattr(layer, "kind", None) == "artboard":
            bb = safe_bbox(layer)
            if bb:
                arts.append({"name": layer.name, "bbox": bb})
    if not arts:
        arts = [{"name": os.path.splitext(os.path.basename(args.psd))[0],
                 "bbox": [0, 0, W, H]}]
    # ordem de leitura: cima->baixo, esquerda->direita
    arts.sort(key=lambda a: (a["bbox"][1], a["bbox"][0]))
    for i, a in enumerate(arts, 1):
        a["index"] = i
        a["slug"] = slugify(a["name"], i)
        l, t, r, b = a["bbox"]
        a["width"], a["height"] = r - l, b - t
        comp.crop((l, t, r, b)).save(os.path.join(out, "slides", a["slug"] + ".png"))

    def artboard_of(bbox):
        cx, cy = (bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2
        for a in arts:
            l, t, r, b = a["bbox"]
            if l <= cx <= r and t <= cy <= b:
                return a
        return None

    # 3) PLACA: oculta todos os textos e recompõe ---------------------------
    type_layers = [x for x in psd.descendants()
                   if getattr(x, "kind", None) == "type"]
    for x in type_layers:
        x.visible = False
    plate = psd.composite().convert("RGB")
    plate_np = np.asarray(plate).astype(int)
    for a in arts:
        l, t, r, b = a["bbox"]
        plate.crop((l, t, r, b)).save(os.path.join(out, "plates", a["slug"] + ".png"))

    def text_metrics(bbox, ox, oy):
        """Mede a TINTA do texto (diff composite×placa) p/ derivar cor, tamanho,
        peso e alinhamento — robusto mesmo sem EngineData no PSD.
        Retorna {} se não houver tinta detectável. ox/oy = origem do artboard."""
        l = max(0, int(bbox[0]))
        t = max(0, int(bbox[1]))
        r = min(int(bbox[2]), comp_np.shape[1])
        b = min(int(bbox[3]), comp_np.shape[0])
        if r <= l or b <= t:
            return {}
        c = comp_np[t:b, l:r]
        mask = np.abs(c - plate_np[t:b, l:r]).sum(axis=2) > 40
        if mask.sum() < 8:
            return {}
        rows = np.where(mask.any(axis=1))[0]
        cols = np.where(mask.any(axis=0))[0]
        ink_top, ink_bot = t + int(rows[0]), t + int(rows[-1]) + 1
        ink_left, ink_right = l + int(cols[0]), l + int(cols[-1]) + 1
        cap_h = ink_bot - ink_top
        med = np.median(c[mask], axis=0).astype(int)
        color = "#%02x%02x%02x" % (int(med[0]), int(med[1]), int(med[2]))
        # alinhamento: margens da tinta dentro do bbox da CAMADA
        bw = bbox[2] - bbox[0]
        align = "left"
        if bw > 0:
            lm, rm = ink_left - bbox[0], bbox[2] - ink_right
            if lm > 0.16 * bw and rm > 0.16 * bw and abs(lm - rm) < 0.12 * bw:
                align = "center"
            elif lm > rm * 2.5 and lm > 0.16 * bw:
                align = "right"
        # peso: espessura de traço via distance-transform (½ largura do stem)
        sub = mask[int(rows[0]):int(rows[-1]) + 1,
                   int(cols[0]):int(cols[-1]) + 1]
        ink = ndimage.distance_transform_edt(sub)[sub]
        stroke = 2.0 * float(np.percentile(ink, 75)) if ink.size else 0.0
        sr = stroke / cap_h if cap_h else 0.0
        weight = 400
        for thr, w in ((0.085, 400), (0.105, 500), (0.125, 600),
                       (0.150, 700), (0.175, 800)):
            if sr >= thr:
                weight = w
        if sr >= 0.205:
            weight = 900
        return {
            "color": color,
            "ink_bbox_rel": [ink_left - ox, ink_top - oy,
                             ink_right - ox, ink_bot - oy],
            "cap_height": cap_h,
            "ink_w": ink_right - ink_left,
            "align": align,
            "weight_hint": weight,
            "stroke_ratio": round(sr, 3),
        }

    # 4) textos por artboard ------------------------------------------------
    texts = {a["slug"]: [] for a in arts}
    fonts_count = {}
    for x in type_layers:
        bb = safe_bbox(x)
        if not bb:
            continue
        a = artboard_of(bb)
        if a is None:
            continue
        l, t = a["bbox"][0], a["bbox"][1]
        rel = [bb[0] - l, bb[1] - t, bb[2] - l, bb[3] - t]
        fns = font_names(x)
        for f in fns:
            fonts_count[f] = fonts_count.get(f, 0) + 1
        tr = list(getattr(x, "transform", []) or [])
        m = text_metrics(bb, l, t)
        texts[a["slug"]].append({
            "idx": getattr(x, "_index", None) or len(texts[a["slug"]]),
            "text": x.text,
            "bbox_rel": rel,
            "w": rel[2] - rel[0],
            "h": rel[3] - rel[1],
            "color": m.get("color"),
            "font": fns[0] if fns else None,
            "transform_scale": round(tr[3], 3) if len(tr) >= 4 else None,
            # métricas de design medidas da tinta (robustas sem EngineData):
            "ink_bbox_rel": m.get("ink_bbox_rel"),
            "cap_height": m.get("cap_height"),
            "ink_w": m.get("ink_w"),
            "align": m.get("align"),
            "weight_hint": m.get("weight_hint"),
            "stroke_ratio": m.get("stroke_ratio"),
        })
    for slug in texts:
        texts[slug].sort(key=lambda r: (r["bbox_rel"][1], r["bbox_rel"][0]))

    # 5) assets opcionais (camadas não-texto, não-grupo) --------------------
    assets = {}
    if args.assets:
        for x in psd.descendants():
            if x.is_group() or getattr(x, "kind", None) == "type":
                continue
            bb = safe_bbox(x)
            a = artboard_of(bb) if bb else None
            if not a:
                continue
            d = os.path.join(out, "assets", a["slug"])
            os.makedirs(d, exist_ok=True)
            try:
                # re-exibe textos não afeta esta camada; compõe só ela
                img = x.composite()
                if img is None:
                    continue
                fn = slugify(x.name, len(assets.get(a["slug"], [])) + 1) + ".png"
                img.save(os.path.join(d, fn))
                assets.setdefault(a["slug"], []).append({
                    "name": x.name, "kind": getattr(x, "kind", "?"),
                    "bbox_rel": [bb[0] - a["bbox"][0], bb[1] - a["bbox"][1],
                                 bb[2] - a["bbox"][0], bb[3] - a["bbox"][1]],
                    "file": os.path.join("assets", a["slug"], fn),
                })
            except Exception:
                pass

    manifest = {
        "psd": os.path.abspath(args.psd),
        "width": W, "height": H,
        "color_mode": COLOR_MODES.get(int(psd.color_mode), str(psd.color_mode)),
        "artboards": [{
            "index": a["index"], "name": a["name"], "slug": a["slug"],
            "bbox": a["bbox"], "width": a["width"], "height": a["height"],
            "reference": os.path.join("slides", a["slug"] + ".png"),
            "plate": os.path.join("plates", a["slug"] + ".png"),
        } for a in arts],
        "fonts": dict(sorted(fonts_count.items(), key=lambda kv: -kv[1])),
        "fonts_recoverable": bool(fonts_count),
        "texts": texts,
        "assets": assets,
    }
    with open(os.path.join(out, "manifest.json"), "w") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)

    print(json.dumps({
        "ok": True,
        "doc": f"{W}x{H}",
        "artboards": len(arts),
        "texts": sum(len(v) for v in texts.values()),
        "fonts_recoverable": bool(fonts_count),
        "outdir": os.path.abspath(out),
    }))


if __name__ == "__main__":
    sys.exit(main())
