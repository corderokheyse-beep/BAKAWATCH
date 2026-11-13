"""
CoastalWatch Mangrove Species Classifier — FastAPI Service
===========================================================
Classifies mangrove species from field photos using a MobileNetV2
model trained on iNaturalist research-grade images.

Start:
    uvicorn main:app --host 0.0.0.0 --port 8001 --reload

Endpoints:
    GET  /           — health check
    POST /predict    — classify a mangrove image
"""

from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import tensorflow as tf
import numpy as np
from PIL import Image
import io
import os
import json

app = FastAPI(
    title="CoastalWatch Mangrove Classifier",
    description="Species identification for Philippine mangroves using MobileNetV2 + iNaturalist data.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Paths ──────────────────────────────────────────────────────────────────────
BASE_DIR     = os.path.dirname(__file__)
# Prefer the native .keras model (new EfficientNet). Fall back to the legacy
# .h5 (old MobileNetV2) so the service still works before a retrain.
MODEL_CANDIDATES = [
    os.path.join(BASE_DIR, "mangrove_model.keras"),
    os.path.join(BASE_DIR, "mangrove_model.h5"),
]
LABELS_PATH  = os.path.join(BASE_DIR, "class_labels.json")

# ── Load model ─────────────────────────────────────────────────────────────────
model = None
for _path in MODEL_CANDIDATES:
    if not os.path.exists(_path):
        continue
    try:
        model = tf.keras.models.load_model(_path)
        print(f"✅ Model loaded from {_path}")
        break
    except Exception as e:
        print(f"⚠ Failed to load {_path}: {e}")
if model is None:
    print("❌ No loadable model found. Run train_model.py.")

# ── Detect the model's expected input size automatically ────────────────────────
# This keeps the service working across model versions without code changes:
#   • old MobileNetV2  -> 224x224, pixels normalized to 0–1 here
#   • new EfficientNet -> 300x300, preprocessing baked into the graph (feed 0–255)
# We infer the size from the model's input shape, and infer whether the model
# already contains its own rescaling/normalization layer.
def _detect_input_size(m) -> tuple[int, int]:
    try:
        shape = m.inputs[0].shape  # (None, H, W, 3)
        h, w = int(shape[1]), int(shape[2])
        if h and w:
            return (h, w)
    except Exception:
        pass
    return (224, 224)

def _model_has_builtin_rescaling(m) -> bool:
    """True only if the model graph performs INPUT pixel preprocessing itself
    (a keras Rescaling layer, or an EfficientNet preprocessing/normalization
    layer). If so, we must feed raw 0–255 pixels; otherwise we divide by 255.

    NOTE: we deliberately do NOT match generic 'BatchNormalization' — that is an
    internal layer present in almost every CNN and is unrelated to input scaling.
    """
    try:
        def layer_names(layers):
            out = []
            for layer in layers:
                tn = type(layer).__name__
                nm = getattr(layer, "name", "") or ""
                out.append((tn, nm))
                out += layer_names(getattr(layer, "layers", []) or [])
            return out

        for tn, nm in layer_names(m.layers):
            tnl, nml = tn.lower(), nm.lower()
            # keras Rescaling layer (type name is exactly "Rescaling")
            if tnl == "rescaling":
                return True
            # EfficientNet bakes a 'normalization'/'rescaling' layer named with
            # an efficientnet/stem prefix; match the backbone explicitly.
            if "efficientnet" in nml:
                return True
        return False
    except Exception:
        return False

if model is not None:
    INPUT_SIZE = _detect_input_size(model)
    MODEL_NORMALIZES = _model_has_builtin_rescaling(model)
    print(f"ℹ Model input size: {INPUT_SIZE}; built-in normalization: {MODEL_NORMALIZES}")
else:
    INPUT_SIZE = (224, 224)
    MODEL_NORMALIZES = False

# ── Load class labels ──────────────────────────────────────────────────────────
# Labels are saved by train_model.py as a JSON list in the same directory.
# Folder names use underscores; we convert to spaces for display.
try:
    with open(LABELS_PATH) as f:
        RAW_LABELS = json.load(f)
    # Convert "Avicennia_marina" → "Avicennia marina"
    CLASS_LABELS = [label.replace("_", " ") for label in RAW_LABELS]
    print(f"✅ Labels loaded: {CLASS_LABELS}")
except Exception:
    # Fallback to the 6 dominant Philippine species if labels file not found
    CLASS_LABELS = [
        "Avicennia marina",
        "Bruguiera gymnorrhiza",
        "Ceriops tagal",
        "Rhizophora apiculata",
        "Rhizophora mucronata",
        "Sonneratia alba",
    ]
    print(f"⚠ Labels file not found, using defaults: {CLASS_LABELS}")

# ── Species metadata ───────────────────────────────────────────────────────────
# Local common names (Philippine), family, and diagnostic botanical notes for
# all 36 Philippine mangrove species from the "Field Guide to Philippine Mangroves"
# by Dr. J. H. Primavera (ZSL-Philippines / PTFCF / SEAFDEC).
SPECIES_INFO = {
    # ── Trained / ML-supported species ─────────────────────────────────────────
    "Aegiceras corniculatum": {
        "local_name":  "Saging-saging / Tinduk-tindukan",
        "family":      "Myrsinaceae",
        "description": "River mangrove shrub with fragrant white flower clusters and curved horn-like cylindrical fruits.",
    },
    "Avicennia marina": {
        "local_name":  "Bungalon / Apiapi / Miapi",
        "family":      "Avicenniaceae",
        "description": "Grey mangrove with small oval leaves and pencil-like pneumatophores. Common pioneer on sandy and muddy shores.",
    },
    "Avicennia officinalis": {
        "local_name":  "Bungalon / Apiapi / Miapi",
        "family":      "Avicenniaceae",
        "description": "Indian mangrove with rounded/obovate leaf tips, yellow-orange flowers, and heart-shaped fruit. Found along river estuaries and mid-to-landward flats.",
    },
    "Bruguiera cylindrica": {
        "local_name":  "Pototan / Busain / Pototan lalaki",
        "family":      "Rhizophoraceae",
        "description": "Small-leafed orange mangrove with knee roots, greenish reflexed calyx lobes, and slender cylindrical straight propagules.",
    },
    "Bruguiera gymnorrhiza": {
        "local_name":  "Pototan / Busain",
        "family":      "Rhizophoraceae",
        "description": "Large-leafed orange mangrove with knee roots, solitary large red flowers, and heavy ribbed propagules. Middle and landward zones.",
    },
    "Ceriops tagal": {
        "local_name":  "Tungog / Tangal",
        "family":      "Rhizophoraceae",
        "description": "Spurred mangrove with yellow-green leaves, pendulous flowers, and warty ridged propagules with reflexed calyx collar. High salinity tolerant.",
    },
    "Lumnitzera racemosa": {
        "local_name":  "Tabao / Culasi",
        "family":      "Combretaceae",
        "description": "White teruntum mangrove with small white flowers in axillary clusters and fleshy obovate leaves. Found on dry, hypersaline upper flats.",
    },
    "Rhizophora apiculata": {
        "local_name":  "Bakhaw lalaki",
        "family":      "Rhizophoraceae",
        "description": "True mangrove with distinctive stilt roots, pairs of sessile flowers beneath foliage, and smooth cylindrical hypocotyls.",
    },
    "Rhizophora mucronata": {
        "local_name":  "Bakhaw babae",
        "family":      "Rhizophoraceae",
        "description": "Loop-rooted mangrove with broad dark green leaves ending in a sharp spike (mucronate tip), 4–8 flowers per stalk, and long warty propagules.",
    },
    "Rhizophora stylosa": {
        "local_name":  "Bakhaw bato",
        "family":      "Rhizophoraceae",
        "description": "Stilt-rooted mangrove with long conspicuous styles (4–6 mm) and mucronate leaves. Pioneer on sandy, rocky, and coralline reef-flats.",
    },
    "Sonneratia alba": {
        "local_name":  "Pagatpat",
        "family":      "Sonneratiaceae",
        "description": "Mangrove apple with cone-shaped pneumatophores, leathery rounded leaves, white brush-like stamens, and star-shaped calyx base.",
    },
    "Sonneratia caseolaris": {
        "local_name":  "Pedada",
        "family":      "Sonneratiaceae",
        "description": "Mangrove apple of brackish riverbanks with tall pneumatophores, red petiole bases, bright crimson stamens, and flat spreading calyx lobes.",
    },
    "Xylocarpus granatum": {
        "local_name":  "Tabigi",
        "family":      "Meliaceae",
        "description": "Cannonball mangrove with prominent undulating ribbon-like plank buttress roots, smooth peeling bark, and large spherical fruit (10–25 cm).",
    },

    # ── Additional Philippine species (Field Guide to Philippine Mangroves) ────
    "Acanthus ebracteatus": {
        "local_name":  "Lagiwliw / Ragoyroy",
        "family":      "Acanthaceae",
        "description": "Sea holly shrub with spiny holly-like leaves and white flowers without bracteoles. Upper intertidal and brackish waterways.",
    },
    "Acanthus ilicifolius": {
        "local_name":  "Lagiwliw / Ragoyroy",
        "family":      "Acanthaceae",
        "description": "Spiny sea holly with light blue to violet flowers with bracteoles. Common along brackish channels and disturbed mangrove margins.",
    },
    "Acanthus volubilis": {
        "local_name":  "Lagiwliw / Ragoyroy",
        "family":      "Acanthaceae",
        "description": "Twining spineless sea holly with smooth-margined leaves and white flowers. Scrambles over other mangrove shrubs along tidal banks.",
    },
    "Acrostichum aureum": {
        "local_name":  "Palaypay / Lagolo",
        "family":      "Pteridaceae",
        "description": "Large coarse mangrove fern forming dense stands. Pinnae leaflets have blunt or rounded tips. Abundant in clear-felled and elevated landward sites.",
    },
    "Acrostichum speciosum": {
        "local_name":  "Palaypay",
        "family":      "Pteridaceae",
        "description": "Mangrove fern distinguishable by elongated to sharply pointed leaflet tips. Thrives in shaded forest interiors and middle-to-landward zones.",
    },
    "Aegiceras floridum": {
        "local_name":  "Saging-saging / Tinduk-tindukan",
        "family":      "Myrsinaceae",
        "description": "River mangrove tree with white flowers, distinguished from A. corniculatum by straight (not curved) horn-like fruits. Prefers sandy/limestone shores.",
    },
    "Avicennia alba": {
        "local_name":  "Bungalon / Apiapi / Miapi",
        "family":      "Avicenniaceae",
        "description": "Mangrove tree with lanceolate pointed leaves, chalky-white leaf undersides, pencil pneumatophores, and conical pointed fruit. Seaward pioneer.",
    },
    "Avicennia rumphiana": {
        "local_name":  "Bungalon / Apiapi / Miapi",
        "family":      "Avicenniaceae",
        "description": "Mangrove tree characterized by distinctly hairy, brownish leaf undersurfaces and downy fruit. Found on upper intertidal sandy-mud substrates.",
    },
    "Brownlowia tersa": {
        "local_name":  "Maragomon",
        "family":      "Tiliaceae",
        "description": "Dense mangrove shrub with lanceolate leaves having silvery-brown peltate scales beneath, pinkish flowers, and 2-lobed woody capsules.",
    },
    "Bruguiera parviflora": {
        "local_name":  "Langarai",
        "family":      "Rhizophoraceae",
        "description": "Slender tree with yellowish-green foliage, clusters of 3–7 small yellowish flowers, and smooth slender cylindrical propagules.",
    },
    "Bruguiera sexangula": {
        "local_name":  "Pototan",
        "family":      "Rhizophoraceae",
        "description": "Upriver orange mangrove with single large yellow to orange-red calyx with 10–12 lobes and ribbed hypocotyls. Tolerates freshwater influence.",
    },
    "Camptostemon philippinensis": {
        "local_name":  "Gapas-gapas",
        "family":      "Bombacaceae",
        "description": "Rare Philippine-endemic mangrove tree with small white flowers and capsule fruits containing cotton-like woolly seeds.",
    },
    "Ceriops decandra": {
        "local_name":  "Baras-baras",
        "family":      "Rhizophoraceae",
        "description": "Spurred mangrove shrub with erect flower clusters, white petals, and straight club-shaped propagules with erect calyx lobes.",
    },
    "Excoecaria agallocha": {
        "local_name":  "Lipata / Buta-buta",
        "family":      "Euphorbiaceae",
        "description": "Blind-your-eye mangrove containing caustic milky sap. Separate male catkins and female flower clusters; 3-lobed capsules.",
    },
    "Heritiera littoralis": {
        "local_name":  "Dungon / Dungon-late",
        "family":      "Sterculiaceae",
        "description": "Looking-glass mangrove with massive sinuous buttress roots, silvery-white leaf undersides, and large keeled boat-shaped woody fruits.",
    },
    "Kandelia candel": {
        "local_name":  "Bakawan-bata",
        "family":      "Rhizophoraceae",
        "description": "Rare localized mangrove recorded in Aurora (Baler and Casiguran Bay). White spider-like flowers with many stamens and slender propagules.",
    },
    "Lumnitzera littorea": {
        "local_name":  "Tabao / Culasi",
        "family":      "Combretaceae",
        "description": "Red-flowered teruntum mangrove with brilliant scarlet terminal flower clusters and knee roots. Mid-to-landward forest edges.",
    },
    "Nypa fruticans": {
        "local_name":  "Nipa / Sasa",
        "family":      "Arecaceae",
        "description": "Mangrove palm with extensive creeping rhizomes, massive erect pinnate fronds, and globular fibrous fruiting heads. Estuarine riverbanks.",
    },
    "Osbornia octodonta": {
        "local_name":  "Tawalis / Bunot-bunot",
        "family":      "Myrtaceae",
        "description": "Myrtle mangrove with aromatic obovate leaves, spongy fibrous bark, and small white flowers with 8 calyx teeth. Thrives on rocky/coralline shores.",
    },
    "Pemphis acidula": {
        "local_name":  "Bantigi",
        "family":      "Lythraceae",
        "description": "Sturdy wind-resistant coastal shrub or small tree with small fleshy leaves and solitary white flowers. Pioneer on limestone and reef rock.",
    },
    "Scyphiphora hydrophyllacea": {
        "local_name":  "Nilad",
        "family":      "Rubiaceae",
        "description": "Shrub or small tree with sticky terminal buds, white-to-pink tubular flowers, and fluted cylindrical ribbed fruits. Historical namesake of Maynila.",
    },
    "Sonneratia ovata": {
        "local_name":  "Pedada",
        "family":      "Sonneratiaceae",
        "description": "Mangrove apple with broadly ovate/egg-shaped leaves with heart-shaped bases, white stamens, and persistent calyx lobes hugging the fruit base.",
    },
    "Xylocarpus moluccensis": {
        "local_name":  "Piag-ao",
        "family":      "Meliaceae",
        "description": "Mangrove tree with rough fissured dark bark, peg-like or conical pneumatophores, deciduous leaves turning red before shedding, and 6–10 cm globose fruit.",
    },
}

# Below this top-1 probability the model is considered unsure. The API then
# returns an "Uncertain" result so a weak guess is never shown as an answer.
CONFIDENCE_THRESHOLD = 60.0

# ── Image preprocessing ────────────────────────────────────────────────────────
def preprocess_image(image_bytes: bytes) -> np.ndarray:
    """Resize to the model's detected input size and normalize appropriately.

    If the model already contains a rescaling/preprocessing layer (EfficientNet),
    we feed raw 0–255 pixels. Otherwise (old MobileNetV2) we divide by 255 here.
    """
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    img = img.resize((INPUT_SIZE[1], INPUT_SIZE[0]), Image.LANCZOS)  # PIL wants (W, H)
    arr = np.array(img, dtype=np.float32)
    if not MODEL_NORMALIZES:
        arr = arr / 255.0
    return np.expand_dims(arr, axis=0)


# ── Routes ─────────────────────────────────────────────────────────────────────
@app.get("/")
def health_check():
    return {
        "status":            "ok",
        "model_loaded":      model is not None,
        "input_size":        list(INPUT_SIZE),
        "model_normalizes":  MODEL_NORMALIZES,
        "confidence_threshold": CONFIDENCE_THRESHOLD,
        "num_classes":       len(CLASS_LABELS),
        "classes":           CLASS_LABELS,
    }


@app.post("/predict")
async def predict(file: UploadFile = File(...)):
    """
    Classify a mangrove image by species.

    Returns:
    - species        : top predicted species (scientific name)
    - local_name     : Philippine common name
    - family         : plant family
    - description    : brief ecological notes
    - confidence     : confidence % for the top prediction (0–100)
    - all_predictions: ranked list of all species with probabilities
    - condition      : always "Unknown" — condition detection requires
                       a separate model trained on health-labelled data
    """
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded. Run train_model.py first.")

    image_bytes = await file.read()

    try:
        input_tensor = preprocess_image(image_bytes)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or unreadable image file.")

    # Run inference — model outputs a single softmax vector (one head, species only)
    probs = model.predict(input_tensor, verbose=0)[0]  # shape: (num_classes,)

    # Top prediction
    top_idx    = int(np.argmax(probs))
    confidence = float(probs[top_idx]) * 100
    species    = CLASS_LABELS[top_idx] if top_idx < len(CLASS_LABELS) else "Unknown"

    # All predictions ranked
    ranked = sorted(
        [
            {
                "species":    CLASS_LABELS[i] if i < len(CLASS_LABELS) else f"Class {i}",
                "probability": round(float(probs[i]) * 100, 2),
            }
            for i in range(len(probs))
        ],
        key=lambda x: x["probability"],
        reverse=True,
    )

    # Confidence floor: if the model isn't sure, don't present a species as an
    # answer. The frontend uses needs_verification to prompt manual selection.
    needs_verification = confidence < CONFIDENCE_THRESHOLD

    # Species metadata (only when we're confident enough to name one).
    info = SPECIES_INFO.get(species, {}) if not needs_verification else {}

    return {
        "species":            "Uncertain" if needs_verification else species,
        "predicted_species":  species,                 # raw top guess (for reference)
        "local_name":         info.get("local_name",  "Unknown"),
        "family":             info.get("family",       "Unknown"),
        "description":        info.get("description",  ""),
        "confidence":         round(confidence, 2),
        "needs_verification": needs_verification,
        "threshold":          CONFIDENCE_THRESHOLD,
        "condition":          "Unknown",   # reserved for future health model
        "all_predictions":    ranked,
    }


# ── Predictive Growth Analytics ────────────────────────────────────────────────
from pydantic import BaseModel
from typing import List

class GrowthDataPoint(BaseModel):
    month: str          # "YYYY-MM"
    avg_height: float   # cm

class GrowthPredictionRequest(BaseModel):
    historical: List[GrowthDataPoint]
    months_ahead: int = 6   # how many future months to predict

class GrowthPredictionPoint(BaseModel):
    month: str
    predicted_height: float
    lower_bound: float
    upper_bound: float
    is_predicted: bool = True

@app.post("/predict-growth")
def predict_growth(req: GrowthPredictionRequest):
    """
    Simple linear regression growth prediction.
    Takes historical monthly average heights and predicts future growth.

    Input: list of {month, avg_height} data points + months_ahead
    Output: predicted heights for the next N months with confidence bounds
    """
    if len(req.historical) < 2:
        raise HTTPException(
            status_code=422,
            detail="At least 2 historical data points are required for prediction."
        )

    # Convert months to numeric indices
    heights = [p.avg_height for p in req.historical]
    n = len(heights)
    x = list(range(n))

    # Linear regression: y = mx + b
    x_mean = sum(x) / n
    y_mean = sum(heights) / n
    numerator   = sum((x[i] - x_mean) * (heights[i] - y_mean) for i in range(n))
    denominator = sum((x[i] - x_mean) ** 2 for i in range(n))

    slope     = numerator / denominator if denominator != 0 else 0
    intercept = y_mean - slope * x_mean

    # Residual standard error for confidence bounds
    residuals = [(heights[i] - (slope * x[i] + intercept)) ** 2 for i in range(n)]
    rmse = (sum(residuals) / n) ** 0.5
    margin = 1.96 * rmse  # 95% confidence interval

    # Parse last month to generate future month labels
    from datetime import datetime, timedelta
    import calendar

    last_month_str = req.historical[-1].month  # "YYYY-MM"
    try:
        last_date = datetime.strptime(last_month_str + "-01", "%Y-%m-%d")
    except Exception:
        last_date = datetime.now().replace(day=1)

    predictions = []
    for i in range(1, req.months_ahead + 1):
        future_x = n - 1 + i
        pred_height = round(max(0.0, slope * future_x + intercept), 2)

        # Advance month
        month_num = last_date.month + i
        year_offset = (month_num - 1) // 12
        future_month = last_date.replace(
            year=last_date.year + year_offset,
            month=((month_num - 1) % 12) + 1,
            day=1,
        )
        month_label = future_month.strftime("%Y-%m")

        predictions.append({
            "month":            month_label,
            "predicted_height": pred_height,
            "lower_bound":      round(max(0.0, pred_height - margin), 2),
            "upper_bound":      round(pred_height + margin, 2),
            "is_predicted":     True,
        })

    return {
        "slope_cm_per_month": round(slope, 4),
        "rmse":               round(rmse, 4),
        "predictions":        predictions,
    }
