# Product Images

This directory stores product images for the online store.

## Image Naming Convention

Product images should follow this pattern:
```
{product_id}.jpg
{product_id}.png
```

Or by category:
```
/electronics/{product_name}.jpg
/clothing/{product_name}.jpg
/home/{product_name}.jpg
```

## Current Setup

The frontend currently uses emoji placeholders for products:
- 🎧 Wireless Headphones
- 🔌 USB-C Cable
- ☕ Coffee Maker
- 👟 Running Shoes
- 💧 Water Bottle
- 🕉️ Yoga Mat
- 💻 Laptop Stand
- 🖱️ Wireless Mouse
- 👓 Glasses
- 💡 Desk Lamp

## Adding Real Images

1. **Recommended Image Sources:**
   - Unsplash (https://unsplash.com)
   - Pexels (https://pexels.com)
   - Pixabay (https://pixabay.com)

2. **Download Script:** (Optional - save as `download-images.sh`)

```bash
#!/bin/bash

# Example: Download sample product images from Unsplash
# Replace URLs with your actual image sources

IMAGES=(
  "https://images.unsplash.com/photo-headphones"
  "https://images.unsplash.com/photo-cables"
  "https://images.unsplash.com/photo-coffee-maker"
)

for img in "${IMAGES[@]}"; do
  wget "$img" -O "$(basename "$img")"
done
```

3. **Update Frontend:**
   - Modify `frontend/routes/products.tsx` to reference actual image files
   - Change `image: "🎧"` to `image: "/images/headphones.jpg"`

## Image Specifications

- **Format:** JPG or PNG
- **Size:** 400x300px recommended (aspect ratio 4:3)
- **Max Size:** 500KB per image
- **Optimization:** Compress with ImageMagick or similar

## Quick Image Setup Example

```bash
# Create directory structure
mkdir -p frontend/static/images/electronics
mkdir -p frontend/static/images/clothing
mkdir -p frontend/static/images/home

# Add images (examples with wget)
wget https://images.unsplash.com/photo-example -O frontend/static/images/electronics/headphones.jpg
```

## Default Emoji Placeholders

The current frontend uses HTML emoji characters which:
- ✅ Require no external files
- ✅ Load instantly
- ✅ Are perfect for development/MVP
- ✅ Work on all devices

To keep the current setup, no action is needed!
