"""Generate iOS and Android launcher icons from src/assets."""

from __future__ import annotations

import json
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "src" / "assets"
SOURCE = ASSETS / "apple-icon.png"

IOS_ICONSET = ROOT / "ios" / "RiseMobile" / "Images.xcassets" / "AppIcon.appiconset"
ANDROID_RES = ROOT / "android" / "app" / "src" / "main" / "res"

IOS_SLOTS = [
    ("Icon-40.png", 40, "iphone", "20x20", "2x", None),
    ("Icon-60.png", 60, "iphone", "20x20", "3x", None),
    ("Icon-58.png", 58, "iphone", "29x29", "2x", None),
    ("Icon-87.png", 87, "iphone", "29x29", "3x", None),
    ("Icon-80.png", 80, "iphone", "40x40", "2x", None),
    ("Icon-120.png", 120, "iphone", "40x40", "3x", None),
    ("Icon-120-60.png", 120, "iphone", "60x60", "2x", None),
    ("Icon-180.png", 180, "iphone", "60x60", "3x", None),
    ("Icon-1024.png", 1024, "ios-marketing", "1024x1024", "1x", None),
    ("Icon-40-light.png", 40, "iphone", "20x20", "2x", "light"),
    ("Icon-60-light.png", 60, "iphone", "20x20", "3x", "light"),
    ("Icon-58-light.png", 58, "iphone", "29x29", "2x", "light"),
    ("Icon-87-light.png", 87, "iphone", "29x29", "3x", "light"),
    ("Icon-80-light.png", 80, "iphone", "40x40", "2x", "light"),
    ("Icon-120-light.png", 120, "iphone", "40x40", "3x", "light"),
    ("Icon-120-60-light.png", 120, "iphone", "60x60", "2x", "light"),
    ("Icon-180-light.png", 180, "iphone", "60x60", "3x", "light"),
    ("Icon-1024-light.png", 1024, "ios-marketing", "1024x1024", "1x", "light"),
    # iPad (required for Universal apps; 152x152 and 167x167 are mandatory for upload).
    ("Icon-iPad-20.png", 20, "ipad", "20x20", "1x", None),
    ("Icon-iPad-40.png", 40, "ipad", "20x20", "2x", None),
    ("Icon-iPad-29.png", 29, "ipad", "29x29", "1x", None),
    ("Icon-iPad-58.png", 58, "ipad", "29x29", "2x", None),
    ("Icon-iPad-40-40.png", 40, "ipad", "40x40", "1x", None),
    ("Icon-iPad-80.png", 80, "ipad", "40x40", "2x", None),
    ("Icon-iPad-76.png", 76, "ipad", "76x76", "1x", None),
    ("Icon-iPad-152.png", 152, "ipad", "76x76", "2x", None),
    ("Icon-iPad-167.png", 167, "ipad", "83.5x83.5", "2x", None),
]

ANDROID_DENSITIES = [
    ("mipmap-mdpi", 48),
    ("mipmap-hdpi", 72),
    ("mipmap-xhdpi", 96),
    ("mipmap-xxhdpi", 144),
    ("mipmap-xxxhdpi", 192),
]

# Status-bar notification icons (white logo on transparent).
ANDROID_NOTIFICATION_DENSITIES = [
    ("drawable-mdpi", 24),
    ("drawable-hdpi", 36),
    ("drawable-xhdpi", 48),
    ("drawable-xxhdpi", 72),
    ("drawable-xxxhdpi", 96),
]


def load_source() -> Image.Image:
    return Image.open(SOURCE).convert("RGBA")


def resize(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def dark_variant(img: Image.Image) -> Image.Image:
    """White logo on black — matches apple-icon / icon-light."""
    return img


def light_variant(img: Image.Image) -> Image.Image:
    """Black logo on white — matches icon-dark (inverted from source)."""
    rgb = ImageOps.invert(img.convert("RGB"))
    alpha = img.split()[3]
    out = rgb.convert("RGBA")
    out.putalpha(alpha)
    return out


def save_png(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if img.mode == "RGBA":
        flat = Image.new("RGB", img.size, (0, 0, 0))
        flat.paste(img, mask=img.split()[3])
        flat.save(path, "PNG", optimize=True)
    else:
        img.save(path, "PNG", optimize=True)


def save_png_alpha(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)


def generate_ios(source: Image.Image) -> None:
    images_json = []
    for filename, px, idiom, size, scale, appearance in IOS_SLOTS:
        variant = light_variant(source) if appearance == "light" else dark_variant(source)
        out = resize(variant, px)
        save_png(out, IOS_ICONSET / filename)
        entry: dict = {
            "filename": filename,
            "idiom": idiom,
            "scale": scale,
            "size": size,
        }
        if appearance == "light":
            entry["appearances"] = [
                {"appearance": "luminosity", "value": "light"}
            ]
        images_json.append(entry)

    contents = {"images": images_json, "info": {"author": "xcode", "version": 1}}
    with open(IOS_ICONSET / "Contents.json", "w", encoding="utf-8") as f:
        json.dump(contents, f, indent=2)
        f.write("\n")


def notification_icon(source: Image.Image, size: int) -> Image.Image:
    """White Rise logo on transparent — required for Android status-bar icons."""
    rgba = dark_variant(source)
    inner = max(1, int(size * 0.82))
    fitted = ImageOps.contain(rgba, (inner, inner), Image.Resampling.LANCZOS)
    pixels = fitted.load()
    mask = Image.new("L", fitted.size, 0)
    mask_pixels = mask.load()
    for y in range(fitted.height):
        for x in range(fitted.width):
            red, green, blue, _alpha = pixels[x, y]
            if red > 200 and green > 200 and blue > 200:
                mask_pixels[x, y] = 255
    glyph = Image.new("RGBA", fitted.size, (255, 255, 255, 255))
    glyph.putalpha(mask)
    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset = ((size - fitted.width) // 2, (size - fitted.height) // 2)
    canvas.paste(glyph, offset, glyph)
    return canvas


def generate_android(source: Image.Image) -> None:
    icon = dark_variant(source)
    for folder, px in ANDROID_DENSITIES:
        out_dir = ANDROID_RES / folder
        out = resize(icon, px)
        save_png(out, out_dir / "ic_launcher.png")
        save_png(out, out_dir / "ic_launcher_round.png")
        save_png(out, out_dir / "ic_launcher_foreground.png")


def generate_android_notification(source: Image.Image) -> None:
    for folder, px in ANDROID_NOTIFICATION_DENSITIES:
        out_dir = ANDROID_RES / folder
        out = notification_icon(source, px)
        save_png_alpha(out, out_dir / "ic_rise_notification.png")

    # Default drawable bucket (used when a density-specific asset is unavailable).
    save_png_alpha(notification_icon(source, 96), ANDROID_RES / "drawable" / "ic_rise_notification.png")


def main() -> None:
    if not SOURCE.is_file():
        raise SystemExit(f"Missing source icon: {SOURCE}")
    source = load_source()
    generate_ios(source)
    generate_android(source)
    generate_android_notification(source)
    print(
        "Generated iOS AppIcon.appiconset, Android launcher mipmaps, and notification icons from",
        SOURCE,
    )


if __name__ == "__main__":
    main()
