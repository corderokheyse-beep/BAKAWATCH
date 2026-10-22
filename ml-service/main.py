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
# Local common names (Philippine), family, and brief notes for each species.
SPECIES_INFO = {
    "Avicennia marina": {
        "local_name":  "Api-api",
        "family":      "Acanthaceae",
        "description": "Grey mangrove with small oval leaves and pencil-like pneumatophores. Common in sandy and muddy shores.",
    },
    "Bruguiera gymnorrhiza": {
        "local_name":  "Busain",
        "family":      "Rhizophoraceae",
        "description": "Large-leafed orange mangrove with knee-like roots. Found in the middle and landward zones.",
    },
    "Ceriops tagal": {
        "local_name":  "Malatangal",
        "family":      "Rhizophoraceae",
        "description": "Spurred mangrove with small leathery leaves. Tolerates high salinity; common in upper intertidal zones.",
    },
    "Rhizophora apiculata": {
        "local_name":  "Bakawan bato",
        "family":      "Rhizophoraceae",
        "description": "True mangrove with distinctive stilt roots. Dominant species in Philippine mangrove forests.",
    },
    "Rhizophora mucronata": {
        "local_name":  "Bakawan lalaki",
        "family":      "Rhizophoraceae",
        "description": "Loop-root mangrove with larger leaves than R. apiculata. Grows in the seaward fringe.",
    },
    "Sonneratia alba": {
        "local_name":  "Pagatpat",
        "family":      "Lythraceae",
        "description": "Mangrove apple with white flowers and round fruit. Pioneer species on newly deposited sediments.",
    },
    "Avicennia officinalis": {
        "local_name":  "Api-api",
        "family":      "Acanthaceae",
        "description": "Indian mangrove with yellow flowers. Found in the landward intertidal zone.",
    },
    "Bruguiera cylindrica": {
        "local_name":  "Pototan lalaki",
        "family":      "Rhizophoraceae",
        "description": "Small-leafed orange mangrove of the mid-intertidal zone.",
    },
    "Rhizophora stylosa": {
        "local_name":  "Bakawan babae",
        "family":      "Rhizophoraceae",
        "description": "Stilt-rooted mangrove tolerant of exposed, high-energy shores.",
    },
    "Sonneratia caseolaris": {
        "local_name":  "Pedada",
        "family":      "Lythraceae",
        "description": "Mangrove apple of brackish riverbanks with red-tipped flowers.",
    },
    "Xylocarpus granatum": {
        "local_name":  "Tabigi",
        "family":      "Meliaceae",
        "description": "Cannonball mangrove with large round fruit and buttress roots.",
    },
    "Lumnitzera racemosa": {
        "local_name":  "Kulasi",
        "family":      "Combretaceae",
        "description": "White-flowered mangrove of the landward margin.",
    },
    "Aegiceras corniculatum": {
        "local_name":  "Saging-saging",
        "family":      "Primulaceae",
        "description": "River mangrove with clustered white flowers and horn-shaped fruit.",
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
