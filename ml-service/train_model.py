"""
Mangrove Species Classifier — Training Script (v2 — EfficientNet-B0)
=====================================================================
Fine-tunes an EfficientNet-B0 model on the full-resolution iNaturalist
dataset built by download_dataset.py.

Why this is more accurate than the old MobileNetV2 / 224px setup:
  • EfficientNet-B0 is a stronger fine-grained feature extractor while
    still being CPU-deployable (~5M params, ~20 MB saved).
  • Larger 300x300 input preserves leaf venation/shape — the cues that
    distinguish visually-similar mangroves.
  • Class weights compensate for uneven image counts per species.
  • Two-phase training: train the head, then fine-tune the top blocks.
  • EfficientNet expects raw 0–255 pixels (its own preprocessing layer
    rescales internally), so we do NOT divide by 255 here.

Usage:
    pip install tensorflow pillow scikit-learn matplotlib seaborn
    python train_model.py

Output:
    mangrove_model.h5     — saved model for the FastAPI service
    class_labels.json     — class list (consumed by main.py)
    training_history.png  — accuracy/loss curves
    confusion_matrix.png  — per-class confusion
"""

import json
from pathlib import Path

import numpy as np
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

import tensorflow as tf
from tensorflow.keras import layers, models, optimizers, callbacks
from tensorflow.keras.applications import EfficientNetB0
from tensorflow.keras.applications.efficientnet import preprocess_input
from sklearn.metrics import classification_report, confusion_matrix
from sklearn.utils.class_weight import compute_class_weight
import seaborn as sns

# ── Config ─────────────────────────────────────────────────────────────────────
DATASET_DIR   = Path(__file__).parent / "dataset"
# Native .keras format — required because the model embeds Keras preprocessing/
# augmentation layers that the legacy .h5 format cannot serialize.
MODEL_PATH    = Path(__file__).parent / "mangrove_model.keras"
WEIGHTS_PATH  = Path(__file__).parent / "mangrove_model.weights.h5"
LABELS_PATH   = Path(__file__).parent / "class_labels.json"
IMG_SIZE      = (300, 300)
BATCH_SIZE    = 16          # smaller batch — 300px images use more memory on CPU
EPOCHS_FROZEN   = 12
EPOCHS_FINETUNE = 18
LEARNING_RATE   = 1e-3
FINETUNE_LR     = 1e-5
VALIDATION_SPLIT = 0.2
SEED = 42

AUTOTUNE = tf.data.AUTOTUNE


def build_datasets():
    """Load train/val datasets straight from the per-species folders."""
    train_ds = tf.keras.utils.image_dataset_from_directory(
        DATASET_DIR, validation_split=VALIDATION_SPLIT, subset="training",
        seed=SEED, image_size=IMG_SIZE, batch_size=BATCH_SIZE, label_mode="categorical",
    )
    val_ds = tf.keras.utils.image_dataset_from_directory(
        DATASET_DIR, validation_split=VALIDATION_SPLIT, subset="validation",
        seed=SEED, image_size=IMG_SIZE, batch_size=BATCH_SIZE, label_mode="categorical",
        shuffle=False,
    )
    class_names = train_ds.class_names
    return train_ds, val_ds, class_names


# On-the-fly augmentation (field photos vary a lot in angle/light).
data_augment = models.Sequential([
    layers.RandomFlip("horizontal"),
    layers.RandomRotation(0.12),
    layers.RandomZoom(0.15),
    layers.RandomContrast(0.15),
    layers.RandomBrightness(0.15),
], name="augment")


def build_model(num_classes: int):
    base = EfficientNetB0(input_shape=(*IMG_SIZE, 3), include_top=False, weights="imagenet")
    base.trainable = False

    inputs = layers.Input(shape=(*IMG_SIZE, 3))
    x = data_augment(inputs)
    x = preprocess_input(x)             # EfficientNet's own 0-255 -> normalized
    x = base(x, training=False)
    x = layers.GlobalAveragePooling2D()(x)
    x = layers.BatchNormalization()(x)
    x = layers.Dropout(0.4)(x)
    x = layers.Dense(256, activation="relu")(x)
    x = layers.Dropout(0.3)(x)
    outputs = layers.Dense(num_classes, activation="softmax")(x)

    model = models.Model(inputs, outputs)
    return model, base


def class_weights_from_dir(class_names):
    counts = []
    labels = []
    for i, name in enumerate(class_names):
        n = len(list((DATASET_DIR / name).glob("*.jpg")))
        counts.append(n)
        labels += [i] * n
    weights = compute_class_weight("balanced", classes=np.arange(len(class_names)), y=np.array(labels))
    print("  Per-class image counts:")
    for name, n in zip(class_names, counts):
        print(f"    {name:<28} {n:>4}")
    return {i: float(w) for i, w in enumerate(weights)}


def plot_history(h1, h2, path):
    acc  = h1.history["accuracy"] + h2.history["accuracy"]
    val  = h1.history["val_accuracy"] + h2.history["val_accuracy"]
    loss = h1.history["loss"] + h2.history["loss"]
    vl   = h1.history["val_loss"] + h2.history["val_loss"]
    ep = range(1, len(acc) + 1)
    fig, (a1, a2) = plt.subplots(1, 2, figsize=(14, 5))
    a1.plot(ep, acc, "b-o", label="train", markersize=3)
    a1.plot(ep, val, "r-o", label="val", markersize=3)
    a1.axvline(len(h1.history["accuracy"]), color="gray", ls="--")
    a1.set_title("Accuracy"); a1.legend(); a1.set_xlabel("epoch")
    a2.plot(ep, loss, "b-o", label="train", markersize=3)
    a2.plot(ep, vl, "r-o", label="val", markersize=3)
    a2.axvline(len(h1.history["loss"]), color="gray", ls="--")
    a2.set_title("Loss"); a2.legend(); a2.set_xlabel("epoch")
    plt.tight_layout(); plt.savefig(path, dpi=150)
    print(f"  Curves saved to {path}")


def main():
    print("=" * 64)
    print("  Mangrove Species Classifier — EfficientNet-B0 training")
    print("=" * 64)

    print("\n[1/5] Loading dataset…")
    train_ds, val_ds, class_names = build_datasets()
    num_classes = len(class_names)
    print(f"  Classes ({num_classes}): {class_names}")

    LABELS_PATH.write_text(json.dumps(class_names, indent=2))
    print(f"  Labels saved to {LABELS_PATH}")

    cw = class_weights_from_dir(class_names)

    train_ds = train_ds.cache().prefetch(AUTOTUNE)
    val_ds   = val_ds.cache().prefetch(AUTOTUNE)

    print("\n[2/5] Building EfficientNet-B0…")
    model, base = build_model(num_classes)
    model.compile(optimizer=optimizers.Adam(LEARNING_RATE),
                  loss="categorical_crossentropy", metrics=["accuracy"])

    cb = [
        callbacks.EarlyStopping(patience=6, restore_best_weights=True, monitor="val_accuracy"),
        callbacks.ReduceLROnPlateau(factor=0.5, patience=3, min_lr=1e-7, monitor="val_loss"),
    ]

    print(f"\n[3/5] Phase 1 — train head ({EPOCHS_FROZEN} epochs)…")
    h1 = model.fit(train_ds, validation_data=val_ds, epochs=EPOCHS_FROZEN,
                   class_weight=cw, callbacks=cb)

    print(f"\n[4/5] Phase 2 — fine-tune top blocks ({EPOCHS_FINETUNE} epochs)…")
    base.trainable = True
    for layer in base.layers[:-40]:   # unfreeze only the top ~40 layers
        layer.trainable = False
    model.compile(optimizer=optimizers.Adam(FINETUNE_LR),
                  loss="categorical_crossentropy", metrics=["accuracy"])
    h2 = model.fit(train_ds, validation_data=val_ds, epochs=EPOCHS_FINETUNE,
                   class_weight=cw, callbacks=cb)

    # ── Save FIRST, before any evaluation/plotting that could error ──────────
    # Native .keras handles the embedded preprocessing/augmentation layers that
    # the legacy .h5 format cannot serialize. Also save weights as a fallback.
    model.save(MODEL_PATH)
    print(f"\n✅ Model saved to {MODEL_PATH}")
    try:
        model.save_weights(WEIGHTS_PATH)
        print(f"✅ Weights saved to {WEIGHTS_PATH}")
    except Exception as e:
        print(f"⚠ Could not save weights: {e}")

    # ── Evaluation (best-effort — never let this block the saved model) ──────
    try:
        loss, acc = model.evaluate(val_ds, verbose=0)
        print(f"\nFinal validation accuracy: {acc * 100:.1f}%")
    except Exception as e:
        print(f"⚠ evaluate() failed: {e}")

    try:
        print("\n[5/5] Classification report:")
        y_true, y_pred = [], []
        for images, labels in val_ds:
            preds = model.predict(images, verbose=0)
            y_true += list(np.argmax(labels.numpy(), axis=1))
            y_pred += list(np.argmax(preds, axis=1))
        print(classification_report(y_true, y_pred, target_names=class_names, zero_division=0))

        cm = confusion_matrix(y_true, y_pred)
        plt.figure(figsize=(10, 8))
        sns.heatmap(cm, annot=True, fmt="d", xticklabels=class_names, yticklabels=class_names, cmap="Greens")
        plt.title("Confusion Matrix"); plt.ylabel("True"); plt.xlabel("Predicted")
        plt.xticks(rotation=45, ha="right"); plt.tight_layout()
        plt.savefig(Path(__file__).parent / "confusion_matrix.png", dpi=150)
        print("  Confusion matrix saved.")
    except Exception as e:
        print(f"⚠ report/confusion matrix failed: {e}")

    try:
        plot_history(h1, h2, Path(__file__).parent / "training_history.png")
    except Exception as e:
        print(f"⚠ history plot failed: {e}")

    print("=" * 64)


if __name__ == "__main__":
    main()
