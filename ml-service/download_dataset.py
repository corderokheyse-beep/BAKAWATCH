"""
Mangrove Species Dataset Downloader (v2 — multi-photo, full-resolution)
=======================================================================
Builds a training dataset for the BAKAWATCH mangrove classifier from
iNaturalist research-grade observations.

Key improvements over v1 (which crippled accuracy):
  • Pulls ALL photos per observation (not just the first) so diagnostic
    leaf close-ups are captured, not only wide habitat/root shots.
  • Downloads the ORIGINAL / "large" image and stores it at FULL resolution
    (v1 pre-shrank everything to 224x224, destroying the leaf detail the
    model needs). Resizing now happens only at training time.
  • Multi-region: Philippines first, then wider Indo-Pacific range, so the
    rarer species (same taxa, just fewer PH photos) get enough images.
  • De-duplicates by iNaturalist photo id.
  • Covers all 15 reference species in the app's mangrove_species catalog.
  • Enforces a per-class MIN threshold and MAX cap so you can decide which
    species are reliable enough to be their own classifier class.

Usage:
    pip install requests pillow
    python download_dataset.py --survey          # count only, no download
    python download_dataset.py                   # download (default caps)
    python download_dataset.py --max 400         # override per-class cap
    python download_dataset.py --species "Avicennia marina"   # one species

Survey mode writes dataset_survey.json and prints a table so we can pick
the final class list from data that actually exists.
"""

import argparse
import io
import json
import os
import time
from pathlib import Path

import requests
from PIL import Image

# ── Configuration ──────────────────────────────────────────────────────────────
OUTPUT_DIR     = Path(__file__).parent / "dataset"
SURVEY_PATH    = Path(__file__).parent / "dataset_survey.json"
MAX_PER_CLASS  = 500     # hard cap on downloaded images per species
MIN_PER_CLASS  = 150     # below this, a species is NOT reliable as its own class
MAX_PER_OBS    = 4       # how many photos to take from a single observation
JPEG_QUALITY   = 92
PER_PAGE       = 100     # iNaturalist max is 200; 100 is polite
PHOTO_SIZE     = "large" # iNat sizes: square|small|medium|large|original

# Training class list: the 13 species with enough research-grade images
# (>= MIN_PER_CLASS) per the survey. The classifier is trained on these.
#
# EXCLUDED from training (too few images — kept manual-only in the app):
#   • Bruguiera sexangula (~108)   • Ceriops decandra (~36)
#
# taxon_id is resolved live at runtime; the survey verified these exist.
SPECIES = [
    "Avicennia marina",
    "Avicennia officinalis",
    "Bruguiera gymnorrhiza",
    "Bruguiera cylindrica",
    "Ceriops tagal",
    "Rhizophora apiculata",
    "Rhizophora mucronata",
    "Rhizophora stylosa",
    "Sonneratia alba",
    "Sonneratia caseolaris",
    "Xylocarpus granatum",
    "Lumnitzera racemosa",
    "Aegiceras corniculatum",
]

# Regions to search, in priority order. place_id 7248 = Philippines.
# None = global (no place filter) as a last resort for rare species.
REGION_PLACE_IDS = [7248, None]

INAT_API = "https://api.inaturalist.org/v1"
HEADERS  = {"User-Agent": "CoastalWatch-MangroveClassifier/2.0 (research use)"}


def folder_for(species: str) -> str:
    return species.replace(" ", "_")


def resolve_taxon_id(species_name: str) -> int | None:
    """Look up the iNaturalist taxon ID by scientific name (species rank)."""
    try:
        resp = requests.get(
            f"{INAT_API}/taxa",
            params={"q": species_name, "rank": "species", "per_page": 3},
            headers=HEADERS, timeout=15,
        )
        for r in resp.json().get("results", []):
            if r.get("name", "").lower() == species_name.lower():
                return r["id"]
        results = resp.json().get("results", [])
        return results[0]["id"] if results else None
    except Exception as e:
        print(f"    ! taxon lookup failed for {species_name}: {e}")
        return None


def count_observations(taxon_id: int, place_id: int | None) -> int:
    """Total count of research-grade, photographed observations for a taxon."""
    params = {
        "taxon_id": taxon_id, "quality_grade": "research",
        "photos": "true", "per_page": 0,
    }
    if place_id is not None:
        params["place_id"] = place_id
    try:
        resp = requests.get(f"{INAT_API}/observations", params=params,
                            headers=HEADERS, timeout=20)
        return int(resp.json().get("total_results", 0))
    except Exception:
        return 0


def iter_observations(taxon_id: int, place_id: int | None):
    """Yield research-grade observations (highest-voted first), paged."""
    page = 1
    while True:
        params = {
            "taxon_id": taxon_id, "quality_grade": "research", "photos": "true",
            "per_page": PER_PAGE, "page": page, "order": "desc", "order_by": "votes",
        }
        if place_id is not None:
            params["place_id"] = place_id
        try:
            resp = requests.get(f"{INAT_API}/observations", params=params,
                                headers=HEADERS, timeout=25)
            results = resp.json().get("results", [])
        except Exception as e:
            print(f"    ! page {page} failed: {e}")
            break
        if not results:
            break
        for obs in results:
            yield obs
        if len(results) < PER_PAGE:
            break
        page += 1
        time.sleep(1.0)  # be polite


def download_full(url: str, save_path: Path) -> bool:
    """Download and save an image at full resolution (no pre-resize)."""
    try:
        resp = requests.get(url, timeout=25, headers=HEADERS)
        resp.raise_for_status()
        img = Image.open(io.BytesIO(resp.content)).convert("RGB")
        # Guard against tiny thumbnails sneaking in
        if min(img.size) < 200:
            return False
        img.save(save_path, "JPEG", quality=JPEG_QUALITY)
        return True
    except Exception:
        return False


def survey() -> dict:
    """Count available images per species per region. No downloads."""
    print("=" * 68)
    print("  SURVEY MODE — counting available iNaturalist images (no download)")
    print("=" * 68)
    report = {}
    for species in SPECIES:
        tid = resolve_taxon_id(species)
        row = {"taxon_id": tid, "regions": {}, "estimated_photos": 0}
        if tid:
            for pid in REGION_PLACE_IDS:
                label = "Philippines" if pid == 7248 else ("Global" if pid is None else str(pid))
                n_obs = count_observations(tid, pid)
                row["regions"][label] = n_obs
                time.sleep(0.4)
            # Rough photo estimate: ~2 usable photos per observation (capped).
            glob = row["regions"].get("Global", 0)
            row["estimated_photos"] = min(glob * 2, MAX_PER_CLASS)
        report[species] = row
        ph = row["regions"].get("Philippines", 0)
        gl = row["regions"].get("Global", 0)
        flag = "OK " if row["estimated_photos"] >= MIN_PER_CLASS else "LOW"
        print(f"  [{flag}] {species:<26} PH={ph:<5} Global={gl:<6} "
              f"~{row['estimated_photos']} usable  (taxon {tid})")
        time.sleep(0.4)

    SURVEY_PATH.write_text(json.dumps(report, indent=2))
    reliable = [s for s, r in report.items() if r["estimated_photos"] >= MIN_PER_CLASS]
    print("-" * 68)
    print(f"  Species meeting the {MIN_PER_CLASS}-image bar: {len(reliable)}/{len(SPECIES)}")
    print(f"  Reliable: {', '.join(reliable) if reliable else '(none)'}")
    low = [s for s in SPECIES if s not in reliable]
    if low:
        print(f"  Below bar (keep manual-only): {', '.join(low)}")
    print(f"\n  Survey written to {SURVEY_PATH}")
    print("=" * 68)
    return report


def download_species(species: str, max_per_class: int) -> int:
    tid = resolve_taxon_id(species)
    if not tid:
        print(f"  ! {species}: no taxon id, skipping")
        return 0

    out = OUTPUT_DIR / folder_for(species)
    out.mkdir(parents=True, exist_ok=True)
    seen_photo_ids = set()
    saved = len(list(out.glob("*.jpg")))
    if saved >= max_per_class:
        print(f"  = {species}: already {saved} images, skipping")
        return saved

    print(f"\n  Downloading {species} (taxon {tid})…")
    for pid in REGION_PLACE_IDS:
        if saved >= max_per_class:
            break
        for obs in iter_observations(tid, pid):
            if saved >= max_per_class:
                break
            photos = obs.get("photos", [])[:MAX_PER_OBS]
            for ph in photos:
                if saved >= max_per_class:
                    break
                pid_photo = ph.get("id")
                if pid_photo in seen_photo_ids:
                    continue
                seen_photo_ids.add(pid_photo)
                url = ph.get("url", "")
                if not url:
                    continue
                # Request a big size; iNat returns the raw file for 'original'.
                url = url.replace("square", PHOTO_SIZE).replace("medium", PHOTO_SIZE)
                dest = out / f"{folder_for(species)}_{obs['id']}_{pid_photo}.jpg"
                if dest.exists():
                    saved += 1
                    continue
                if download_full(url, dest):
                    saved += 1
                    if saved % 25 == 0:
                        print(f"    [{saved}/{max_per_class}] {species}")
    status = "OK" if saved >= MIN_PER_CLASS else "LOW (manual-only candidate)"
    print(f"  > {species}: {saved} images  [{status}]")
    return saved


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--survey", action="store_true", help="count only, no download")
    ap.add_argument("--max", type=int, default=MAX_PER_CLASS, help="per-class cap")
    ap.add_argument("--species", type=str, default=None, help="only this species")
    args = ap.parse_args()

    if args.survey:
        survey()
        return

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    targets = [args.species] if args.species else SPECIES
    print("=" * 68)
    print("  Mangrove Dataset Downloader v2 — full-res, multi-photo")
    print(f"  Species: {len(targets)}   Cap/class: {args.max}   Size: {PHOTO_SIZE}")
    print("=" * 68)

    totals = {}
    for species in targets:
        totals[species] = download_species(species, args.max)
        time.sleep(1.0)

    print("\n" + "=" * 68)
    print("  Download complete. Dataset summary:")
    grand = 0
    for species in targets:
        n = len(list((OUTPUT_DIR / folder_for(species)).glob("*.jpg")))
        grand += n
        bar = "OK " if n >= MIN_PER_CLASS else "LOW"
        print(f"    [{bar}] {species:<28} {n:>4} images")
    print(f"    {'TOTAL':<35} {grand:>4} images")
    print("=" * 68)
    print("\nNext: review counts, finalize class list, then run train_model.py")


if __name__ == "__main__":
    main()
