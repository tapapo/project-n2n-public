// File: src/lib/validation.ts
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData } from '../types';

export type ValidationResult = {
  isValid: boolean;
  message?: string;
};


const getDescriptorDimension = (node?: Node<CustomNodeData>): number => {
    if (!node) return 0;
    const type = node.type?.toLowerCase() || '';
    
    const params = node.data?.params || node.data?.payload?.params || {};

    if (type === 'sift') {
        return 128; 
    }
    
    if (type === 'orb') {
        return 32; 
    }

    if (type === 'surf') {
        const isExtended = params.extended === true || params.extended === 1 || params.extended === '1';
        return isExtended ? 128 : 64;
    }

    return 0; 
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
  const type = (node.type || '').toLowerCase();

  switch (type) {
    // 1. Image Source
    case 'image-input':
      if (!node.data?.payload?.url && !node.data?.payload?.image_path) {
         if (node.data.status !== 'success') {
             return { isValid: false, message: 'Please upload an image first.' };
         }
      }
      break;

    // 2. Matchers 
    case 'bfmatcher':
    case 'flannmatcher':
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Feature A & Feature B).' };
      }

      const sourceNodes = incomingEdges.map(e => nodes.find(n => n.id === e.source));
      const nodeA = sourceNodes[0];
      const nodeB = sourceNodes[1];

      const dimA = getDescriptorDimension(nodeA);
      const dimB = getDescriptorDimension(nodeB);

      if (dimA > 0 && dimB > 0) {
          if (nodeA?.type !== nodeB?.type) {
             return { 
                isValid: false, 
                message: `Type Mismatch: Cannot match '${nodeA?.type?.toUpperCase()}' with '${nodeB?.type?.toUpperCase()}'.` 
             };
          }

          if (dimA !== dimB) {
              return { 
                  isValid: false, 
                  message: `Dimension Mismatch: Input A is ${dimA}-dim, but Input B is ${dimB}-dim. Check 'Extended' parameter settings.` 
              };
          }
      }
      break;

    // 3. Quality Comparison
    case 'psnr':
    case 'ssim':
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Original & Processed).' };
      }
      break;

    // 4. Single Input Nodes 
    default:
      if (inputCount < 1 && ![
          'image-input' 
      ].includes(type)) {
          return { isValid: false, message: 'Missing input connection.' };
      }
      break;
  }

  return { isValid: true };
}