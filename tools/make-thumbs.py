"""Generate 320 px WebP wall thumbnails for the bundled Classic photos.

The wall only needs small images; the original JPEGs stay for the expanded
lightbox view. Requires Pillow (pip install pillow).

Run: python tools/make-thumbs.py
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "assets" / "defaults"
TARGET = SOURCE / "thumbs"
EDGE = 320
QUALITY = 76


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for source in sorted(SOURCE.glob("*.jpg")):
        image = Image.open(source).convert("RGB")
        image.thumbnail((EDGE, EDGE), Image.Resampling.LANCZOS)
        target = TARGET / f"{source.stem}.webp"
        image.save(target, "WEBP", quality=QUALITY, method=6)
        print(f"{source.name} -> {target.relative_to(ROOT)} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
