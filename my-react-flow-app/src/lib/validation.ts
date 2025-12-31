//src/lib/validation.ts
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData } from '../types';

export type ValidationResult = {
  isValid: boolean;
  message?: string;
};

export function validateNodeInput(
  nodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
): ValidationResult {
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return { isValid: false, message: 'Node not found in graph.' };
  }

  const incomingEdges = edges.filter((e) => e.target === nodeId);
  const inputCount = incomingEdges.length;

  switch (node.type) {
    
    // 1. Image Source
    case 'image-input':
      if (!node.data?.payload?.url && !node.data?.payload?.image_path) {
        return { isValid: false, message: 'Please upload an image first.' };
      }
      break;

    // 2. Single Input Nodes (ต้องการอย่างน้อย 1 เส้น)
    // Feature Extraction
    case 'sift':
    case 'surf':
    case 'orb':
    // Quality
    case 'brisque':
    // Segmentation / Classification
    case 'otsu':
    case 'snake':
    case 'deeplab':   // ✅ เพิ่ม
    case 'unet':      // ✅ เพิ่ม
    case 'mask-rcnn': // ✅ เพิ่ม
    // Enhancement
    case 'clahe':     // ✅ เพิ่ม
    case 'msrcr':     // ✅ เพิ่ม
    case 'zero-dce':  // ✅ เพิ่ม
    // Restoration
    case 'dncnn':       // ✅ เพิ่ม
    case 'swinir':      // ✅ เพิ่ม
    case 'real-esrgan': // ✅ เพิ่ม
    // Utilities / Alignment
    case 'save-image':    
    case 'save-json':     
    case 'homography-align': 
    case 'affine-align':     
      if (inputCount < 1) {
        return { isValid: false, message: 'Missing input connection (Drag a line to this node).' };
      }
      break;

    // 3. Dual Input Nodes (ต้องการอย่างน้อย 2 เส้น)
    // Matchers
    case 'bfmatcher':
    case 'flannmatcher':
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Feature A & Feature B).' };
      }
      break;

    // Quality Comparison
    case 'psnr':
    case 'ssim':
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Original & Processed).' };
      }
      break;

    default:
      break;
  }

  return { isValid: true };
}