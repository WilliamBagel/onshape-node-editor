#!/usr/bin/env python3
"""Annotate UI-explorer screenshots with red boxes + numbered badges.

Usage:
    python3 scripts/annotate-ui-shots.py --report <out>/report.json --out <out>/annotated
        [--no-badge] [--thickness N]

For every issue with a ``bbox`` and an existing ``screenshot``, draws a
``--thickness`` px (default 3) red (#b4443c) rectangle and, unless
``--no-badge``, a numbered badge (zero-padded issue index, e.g. ``001``)
at the box's top-left corner. Output is saved as ``annotated/<basename>``
of the screenshot, and ``issue.annotated`` in report.json is updated to
the path relative to the report file (e.g. ``annotated/001-name.png``),
then report.json is written back. Issues sharing one screenshot get all
their boxes on the same output image. Idempotency: re-running simply
redraws from the original screenshot, so no boxes stack.

Retina / CSS-pixel scaling: if the issue carries a ``viewport`` (CSS px)
and the screenshot's pixel size differs from it, the bbox is scaled by
``image_w / viewport_w`` horizontally and ``image_h / viewport_h``
vertically before drawing. Without a viewport, bbox CSS pixels are used
as image pixels and clamped to the image bounds. Boxes are always
clamped to the image; a box entirely outside yields a warning + skip.

Missing screenshots, malformed bboxes, and a missing Pillow never crash:
each emits a warning to stderr and the run exits 0 (annotator is
best-effort; see docs/ui-explorer.md). Only Pillow + stdlib are used.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

RED = (180, 68, 60)  # #b4443c
WHITE = (255, 255, 255)


def warn(msg: str) -> None:
    print(f"annotate-ui-shots: warning: {msg}", file=sys.stderr)


def load_font(size: int):
    try:
        from PIL import ImageFont

        for candidate in (
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ):
            if Path(candidate).exists():
                return ImageFont.truetype(candidate, size)
        return ImageFont.load_default(size=size)  # Pillow >= 10
    except Exception:
        from PIL import ImageFont

        return ImageFont.load_default()


def badge(draw, x: int, y: int, label: str, thickness: int) -> None:
    font = load_font(max(14, thickness * 6))
    tb = (0, 0, len(label) * 7, 12)
    try:
        tb = draw.textbbox((0, 0), label, font=font)
        tw, th = tb[2] - tb[0], tb[3] - tb[1]
    except Exception:
        tw, th = len(label) * 7, 12
    pad = max(3, thickness)
    w, h = tw + pad * 2, th + pad * 2 - 2
    draw.rectangle([x, y, x + w, y + h], fill=RED)
    draw.text((x + pad - tb[0], y + pad - 2 - tb[1]), label, fill=WHITE, font=font)


def clamp_box(bbox, img_w: int, img_h: int, viewport):
    try:
        x, y = float(bbox["x"]), float(bbox["y"])
        w, h = float(bbox["width"]), float(bbox["height"])
    except (KeyError, TypeError, ValueError):
        return None
    if w <= 0 or h <= 0:
        return None
    sx = sy = 1.0
    if viewport and viewport.get("width") and viewport.get("height"):
        try:
            sx = img_w / float(viewport["width"])
            sy = img_h / float(viewport["height"])
        except (TypeError, ValueError):
            sx = sy = 1.0
    x, y, w, h = x * sx, y * sy, w * sx, h * sy
    x0 = max(0, int(round(x)))
    y0 = max(0, int(round(y)))
    x1 = min(img_w - 1, int(round(x + w)))
    y1 = min(img_h - 1, int(round(y + h)))
    if x1 < x0 or y1 < y0:
        return None
    return x0, y0, x1, y1


def main() -> int:
    ap = argparse.ArgumentParser(description=(__doc__ or "Annotate UI screenshots").splitlines()[0])
    ap.add_argument("--report", required=True, help="Path to report.json")
    ap.add_argument("--out", required=True, help="Annotated output directory")
    ap.add_argument("--no-badge", action="store_true", help="Draw boxes only, no numbered badges")
    ap.add_argument("--thickness", type=int, default=3, help="Box thickness in px (default 3)")
    args = ap.parse_args()

    try:
        from PIL import Image, ImageDraw
    except ImportError:
        warn("Pillow not available; skipping annotation (install Pillow to enable).")
        return 0

    report_path = Path(args.report)
    out_dir = Path(args.out)
    try:
        report = json.loads(report_path.read_text())
    except Exception as e:  # unreadable report is a hard error for the caller
        print(f"annotate-ui-shots: cannot read report {report_path}: {e}", file=sys.stderr)
        return 2
    report_dir = report_path.resolve().parent
    out_dir.mkdir(parents=True, exist_ok=True)
    thickness = max(1, args.thickness)

    # Group issues by screenshot so shared screenshots are annotated once, with all boxes.
    by_shot: dict[str, list[tuple[int, dict]]] = {}
    for idx, issue in enumerate(report.get("issues") or [], start=1):
        if not isinstance(issue, dict) or not issue.get("bbox") or not issue.get("screenshot"):
            continue
        by_shot.setdefault(str(issue["screenshot"]), []).append((idx, issue))

    drawn = 0
    for shot, entries in by_shot.items():
        src = (report_dir / shot).resolve()
        if not src.exists():
            warn(f"screenshot not found, skipping: {shot}")
            continue
        try:
            img = Image.open(src).convert("RGB")
        except Exception as e:
            warn(f"cannot open {shot}: {e}")
            continue
        draw = ImageDraw.Draw(img)
        for idx, issue in entries:
            box = clamp_box(issue["bbox"], img.width, img.height, issue.get("viewport"))
            if box is None:
                warn(f"issue {issue.get('id', idx)}: bbox missing/outside image, skipping box")
                continue
            x0, y0, x1, y1 = box
            for t in range(thickness):
                draw.rectangle([x0 + t, y0 + t, x1 - t, y1 - t], outline=RED)
            if not args.no_badge:
                badge(draw, x0, y0, f"{idx:03d}", thickness)
            dest = out_dir / src.name
            img.save(dest)
            issue["annotated"] = str(dest.resolve().relative_to(report_dir)).replace("\\", "/") \
                if str(dest.resolve()).startswith(str(report_dir)) else f"annotated/{src.name}"
            drawn += 1
            print(f"annotate-ui-shots: {issue.get('id', idx)} -> {issue['annotated']}")

    try:
        report_path.write_text(json.dumps(report, indent=2) + "\n")
    except Exception as e:
        warn(f"cannot write back {report_path}: {e}")
    print(f"annotate-ui-shots: drew {drawn} box(es)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
