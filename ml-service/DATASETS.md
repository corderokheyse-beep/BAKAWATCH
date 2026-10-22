# BAKAWATCH — Free ML Dataset Sources
## Mangrove Species Classification

This document lists all free, publicly accessible datasets and image sources
that can be used to train or improve the `mangrove_model.h5` MobileNetV2
classifier in the BAKAWATCH ML service.

---

## 1. Mendeley Data — Mangrove Leaves Dataset (BEST for this project)
**URL:** https://data.mendeley.com/datasets/fc5sm4x88c/1
**License:** CC BY 4.0 (free for any use, including commercial)
**What it contains:**
- Labelled leaf images of **7 mangrove species**:
  - *Avicennia marina*, *Avicennia officinalis*, *Bruguiera gymnorhiza*,
    *Heritiera littoralis*, *Lumnitzera littorea*, *Rhizophora apiculata*,
    *Sonneratia caseolaris*
- High-quality close-up leaf photos — ideal for MobileNetV2 training
- Directly usable with `train_model.py` after downloading and organising
  into per-species folders

**How to use:**
1. Download the zip from the Mendeley link above
2. Extract into `ml-service/dataset/` with one subfolder per species name
3. Run `python train_model.py`

---

## 2. iNaturalist Open Data (Largest Free Source)
**URL:** https://www.inaturalist.org/observations
**API Docs:** https://api.inaturalist.org/v1/docs/
**License:** Creative Commons (CC0 / CC BY / CC BY-NC — varies per image)
**What it contains:**
- Millions of research-grade, geotagged wildlife photos submitted by the public
- Mangrove species searchable by scientific name
- Free REST API — no key required for basic queries

**How to download images for training:**
```python
import requests, os, urllib.request

SPECIES = [
    "Rhizophora mucronata",
    "Rhizophora apiculata",
    "Avicennia marina",
    "Bruguiera gymnorrhiza",
    "Ceriops tagal",
    "Sonneratia alba",
]

for species in SPECIES:
    folder = f"dataset/{species.replace(' ', '_')}"
    os.makedirs(folder, exist_ok=True)
    # Fetch research-grade observations with photos, Philippines only
    url = "https://api.inaturalist.org/v1/observations"
    params = {
        "taxon_name": species,
        "quality_grade": "research",
        "has[]": "photos",
        "place_id": 7248,   # Philippines iNaturalist place ID
        "per_page": 100,
    }
    resp = requests.get(url, params=params).json()
    for i, obs in enumerate(resp.get("results", [])):
        photo_url = obs["photos"][0]["url"].replace("square", "medium")
        urllib.request.urlretrieve(photo_url, f"{folder}/{i}.jpg")
        print(f"  Downloaded {species} image {i+1}")
```
Run this script (`download_dataset.py`) before training to populate
`dataset/` with Philippine-sourced research-grade photos.

---

## 3. Global Mangrove Watch (Satellite / Remote Sensing)
**URL:** https://www.globalmangrovewatch.org/
**License:** Open (CC BY 4.0)
**What it contains:**
- Global annual mangrove extent maps (2000–2020)
- Sentinel-2 multispectral satellite imagery
- Useful for: extent mapping, habitat boundary detection, GIS layers
- **Not for species classification** — use for geo-boundary features

---

## 4. MagSet-2 / MangroveAI Dataset
**URL:** https://github.com/lucasjvds/MangroveAI
**License:** MIT
**What it contains:**
- 10,000+ paired satellite images with mangrove annotations
- Integrates Global Mangrove Watch labels with Sentinel-2 imagery
- Best for: segmentation and presence/absence detection

---

## 5. UCSD E4E — ML Mangrove Monitoring
**URL:** https://github.com/UCSD-E4E/ml-mangrove
**License:** MIT
**What it contains:**
- Aerial/drone imagery pipeline for mangrove monitoring
- Pre-trained models and training scripts included
- Useful reference for architecture and augmentation strategies

---

## 6. iNaturalist Competition Datasets (iNat 2018 / 2021)
**URL:** https://github.com/visipedia/inat_comp
**License:** CC BY-NC 4.0
**What it contains:**
- iNat 2021 mini: 500K images, 10,000 species (includes mangroves)
- iNat 2018: 437K training images, 8,142 species
- Pre-built train/val splits and JSON labels
- Large download (~22 GB for mini) — filter to mangrove taxa only

**How to filter for mangroves only from iNat2021:**
```python
import json

with open("train_mini.json") as f:
    data = json.load(f)

mangrove_keywords = ["rhizophora", "avicennia", "bruguiera", "sonneratia",
                     "ceriops", "lumnitzera", "nypa", "xylocarpus"]

mangrove_cat_ids = {
    cat["id"]: cat["name"]
    for cat in data["categories"]
    if any(kw in cat["name"].lower() for kw in mangrove_keywords)
}
print(f"Found {len(mangrove_cat_ids)} mangrove categories")
```

---

## Recommended Approach for BAKAWATCH

| Priority | Source | Effort | Image Count |
|----------|--------|--------|-------------|
| ⭐⭐⭐ | **Mendeley Mangrove Leaves** | Low — download zip | ~700 images, 7 species |
| ⭐⭐⭐ | **iNaturalist API (Philippines)** | Medium — run script | 100–600 per species |
| ⭐⭐ | iNat 2021 mini (filtered) | High — large download | Thousands per species |
| ⭐ | Global Mangrove Watch | Medium | Satellite only |

**Minimum recommended training set:** 100 images per species minimum;
300+ per species for reliable MobileNetV2 fine-tuning.

---

## Data Augmentation (already in train_model.py)

The existing `train_model.py` applies these augmentations automatically:
- Random horizontal/vertical flip
- Rotation (±20°)
- Zoom (±20%)
- Width/height shift (±20%)
- Brightness adjustment

These effectively multiply a small dataset by 5–10×, making even
100 images per species workable for a proof-of-concept model.

---

## Quick Start: Build Your Training Dataset

```bash
# Step 1: Download Mendeley dataset manually from:
# https://data.mendeley.com/datasets/fc5sm4x88c/1
# Unzip into ml-service/dataset/

# Step 2: Augment with iNaturalist Philippines photos
cd ml-service
python download_dataset.py   # fetches research-grade PH observations

# Step 3: Train the model
python train_model.py        # outputs mangrove_model.h5 + class_labels.json

# Step 4: Start the service
run.bat
```
