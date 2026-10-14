"""Generate crisp, modern icons for the Sidekick Chrome Extension."""
import os
from PIL import Image, ImageDraw

def create_icon(size):
    # Create an RGBA image with a smooth rounded gradient shield / bolt badge
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    margin = max(1, int(size * 0.06))
    box = [margin, margin, size - margin, size - margin]
    radius = max(3, int(size * 0.28))

    # Background gradient approximation: vibrant indigo to purple
    # Draw rounded rectangle background
    draw.rounded_rectangle(box, radius=radius, fill=(99, 102, 241, 255), outline=(139, 92, 246, 255), width=max(1, int(size * 0.04)))

    # Inner modern stylized "S" / lightning / chevron glyph
    # Let's draw an energetic stylized "S" or shield spark in crisp white
    cx, cy = size / 2, size / 2
    scale = size / 32.0

    # Draw a stylized lightning / spark polygon
    points = [
        (cx + 1 * scale, cy - 8 * scale),
        (cx - 6 * scale, cy + 1 * scale),
        (cx - 1 * scale, cy + 1 * scale),
        (cx - 2 * scale, cy + 9 * scale),
        (cx + 6 * scale, cy - 1 * scale),
        (cx + 1 * scale, cy - 1 * scale),
    ]
    draw.polygon(points, fill=(255, 255, 255, 255))

    return img

def main():
    icons_dir = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(icons_dir, exist_ok=True)
    
    for size in [16, 32, 48, 128]:
        icon = create_icon(size)
        path = os.path.join(icons_dir, f"icon{size}.png")
        icon.save(path, "PNG")
        print(f"Generated {path} ({size}x{size})")

if __name__ == "__main__":
    main()
