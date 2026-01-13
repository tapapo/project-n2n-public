import os
import sys
import json
import uuid
import torch
import torch.nn as nn
from PIL import Image
import numpy as np
from torchvision.transforms import ToTensor

# ============================================================
# SwinIR MODEL (Official implementation – simplified)
# ============================================================

class Mlp(nn.Module):
    def __init__(self, in_features, hidden_features=None, out_features=None):
        super().__init__()
        out_features = out_features or in_features
        hidden_features = hidden_features or in_features
        self.fc1 = nn.Linear(in_features, hidden_features)
        self.fc2 = nn.Linear(hidden_features, out_features)
        self.act = nn.GELU()

    def forward(self, x):
        return self.fc2(self.act(self.fc1(x)))


class WindowAttention(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.qkv = nn.Linear(dim, dim * 3)
        self.proj = nn.Linear(dim, dim)

    def forward(self, x):
        B, N, C = x.shape
        qkv = self.qkv(x).reshape(B, N, 3, C).permute(2, 0, 1, 3)
        q, k, v = qkv[0], qkv[1], qkv[2]
        attn = (q @ k.transpose(-2, -1)) * (C ** -0.5)
        attn = attn.softmax(dim=-1)
        return self.proj(attn @ v)


class SwinBlock(nn.Module):
    def __init__(self, dim):
        super().__init__()
        self.norm1 = nn.LayerNorm(dim)
        self.attn = WindowAttention(dim)
        self.norm2 = nn.LayerNorm(dim)
        self.mlp = Mlp(dim, dim * 4)

    def forward(self, x):
        x = x + self.attn(self.norm1(x))
        x = x + self.mlp(self.norm2(x))
        return x


class SwinIR(nn.Module):
    def __init__(self, img_size=64, embed_dim=96, depths=6, in_chans=3):
        super().__init__()
        self.embed = nn.Conv2d(in_chans, embed_dim, 3, 1, 1)

        self.blocks = nn.Sequential(
            *[SwinBlock(embed_dim) for _ in range(depths)]
        )

        self.unembed = nn.Conv2d(embed_dim, in_chans, 3, 1, 1)

    def forward(self, x):
        B, C, H, W = x.shape
        x = self.embed(x)
        x = x.flatten(2).transpose(1, 2)   # B, HW, C
        x = self.blocks(x)
        x = x.transpose(1, 2).view(B, -1, H, W)
        x = self.unembed(x)
        return x


# ============================================================
# ADAPTER
# ============================================================

def run(image_path: str, out_root: str = ".", model_path: str = None, **params):

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    model = SwinIR().to(device)

    if model_path:
        model.load_state_dict(torch.load(model_path, map_location=device))

    model.eval()

    # -------------------------------
    # Load image
    # -------------------------------
    img = Image.open(image_path).convert("RGB")
    img_tensor = ToTensor()(img).unsqueeze(0).to(device)

    # -------------------------------
    # Restore
    # -------------------------------
    with torch.no_grad():
        restored = model(img_tensor)

    out_img = restored.squeeze().cpu().clamp(0, 1).numpy().transpose(1, 2, 0)
    out_img = (out_img * 255).astype(np.uint8)

    # -------------------------------
    # Prepare JSON
    # -------------------------------
    payload = {
        "tool": "SwinIR",
        "tool_version": {
            "torch": torch.__version__,
            "python": sys.version.split()[0]
        },
        "image": {
            "original_path": image_path,
            "file_name": os.path.basename(image_path),
            "original_shape": list(img.size[::-1]),
            "enhanced_shape": list(out_img.shape),
            "dtype": str(out_img.dtype)
        }
    }

    # -------------------------------
    # Paths
    # -------------------------------
    base = os.path.splitext(os.path.basename(image_path))[0]
    uid = uuid.uuid4().hex[:8]
    stem = f"{base}_swinir_{uid}"

    out_root_abs = os.path.abspath(out_root or ".")
    algo_dir = os.path.join(out_root_abs, "features", "swinir_outputs")
    os.makedirs(algo_dir, exist_ok=True)

    # Save JSON
    json_path = os.path.join(algo_dir, stem + ".json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=4)

    # Save image
    vis_path = os.path.join(algo_dir, stem + "_vis.jpg")
    Image.fromarray(out_img).save(vis_path)

    return os.path.abspath(json_path), os.path.abspath(vis_path)


# ============================================================
# CLI test
# ============================================================

if __name__ == "__main__":
    img_path = "your_image.jpg"
    out_dir = "./swinir_output"
    json_file, vis_file = run(img_path, out_dir, model_path="swinir_pretrained.pth")
    print("JSON:", json_file)
    print("Image:", vis_file)
