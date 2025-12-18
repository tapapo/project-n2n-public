
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
    
    case 'image-input':
      if (!node.data?.payload?.url && !node.data?.payload?.image_path) {
        return { isValid: false, message: 'Please upload an image first.' };
      }
      break;

   
    case 'sift':
    case 'surf':
    case 'orb':
    case 'brisque':    
    case 'otsu':
    case 'snake':
    case 'save-image':    
    case 'save-json':     
    case 'homography-align': 
    case 'affine-align':     
      if (inputCount < 1) {
        return { isValid: false, message: 'Missing input connection (Drag a line to this node).' };
      }
      break;

    
    case 'bfmatcher':
    case 'flannmatcher':
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Feature A & Feature B).' };
      }
      break;

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