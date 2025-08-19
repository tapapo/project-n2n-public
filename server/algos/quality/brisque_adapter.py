# server/algos/feature/brisque_adapter.py
import os, sys, cv2, json, uuid

# --- Config ---
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
MODEL_PATH = os.path.join(PROJECT_ROOT, "Image-to-Descriptor/tools/QualityAssessment/brisque_models/brisque_model_live.yml")
RANGE_PATH = os.path.join(PROJECT_ROOT, "Image-to-Descriptor/tools/QualityAssessment/brisque_models/brisque_range_live.yml")

def run(image_path: str, out_root: str = None):
    """
    Run BRISQUE quality assessment.
    Save JSON to: outputs/features/brisque_outputs/
    Returns:
        (json_path, data)
    """
    # 1. Load Image
    img = cv2.imread(image_path, cv2.IMREAD_UNCHANGED)
    if img is None:
        raise ValueError(f"Cannot read image: {image_path}")

    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) == 3 else img

    # 2. Ensure model files exist
    if not os.path.exists(MODEL_PATH) or not os.path.exists(RANGE_PATH):
        raise FileNotFoundError("BRISQUE model/range files not found")

    # 3. Compute BRISQUE score
    scorer = cv2.quality.QualityBRISQUE_create(MODEL_PATH, RANGE_PATH)
    score = float(scorer.compute(gray)[0])

    # 4. Force save directory → outputs/features/brisque_outputs
    out_dir = os.path.join(PROJECT_ROOT, "outputs", "features", "brisque_outputs")
    os.makedirs(out_dir, exist_ok=True)

    base = os.path.splitext(os.path.basename(image_path))[0]
    uid = uuid.uuid4().hex[:8]
    out_json = os.path.join(out_dir, f"{base}_brisque_{uid}.json")

    # 5. Save JSON
    data = {
        "tool": "BRISQUE",
        "tool_version": {
            "opencv": cv2.__version__,
            "python": sys.version.split()[0],
        },
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "processed_shape": list(gray.shape),
            "dtype": str(gray.dtype)
        },
        "brisque_parameters_used": {
            "model_file": os.path.basename(MODEL_PATH),
            "range_file": os.path.basename(RANGE_PATH),
        },
        "quality_score": round(score, 4),
        "score_interpretation": "Lower score = better perceptual quality"
    }

    with open(out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return out_json, data