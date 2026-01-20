// File: src/lib/validation.ts
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData } from '../types';

export type ValidationResult = {
  isValid: boolean;
  message?: string;
};

// ✅ Helper: คำนวณ Dimension ของ Descriptor ตามการตั้งค่า
// ฟังก์ชันนี้จะเจาะเข้าไปดู Parameter เพื่อบอกว่า Node นี้จะผลิต Descriptor ขนาดเท่าไหร่
const getDescriptorDimension = (node?: Node<CustomNodeData>): number => {
    if (!node) return 0;
    const type = node.type?.toLowerCase() || '';
    
    // ดึงค่า params (รองรับทั้งที่อยู่ใน data โดยตรง หรือใน payload)
    const params = node.data?.params || node.data?.payload?.params || {};

    if (type === 'sift') {
        return 128; // SIFT ปกติคือ 128
    }
    
    if (type === 'orb') {
        return 32; // ORB ปกติคือ 32 (Binary)
    }

    if (type === 'surf') {
        // ⚠️ เช็คค่า extended: ถ้าเป็น true หรือ 1 จะได้ 128, ถ้าไม่ตั้งหรือเป็น false จะได้ 64
        const isExtended = params.extended === true || params.extended === 1 || params.extended === '1';
        return isExtended ? 128 : 64;
    }

    return 0; // ไม่ทราบขนาด (หรืออาจไม่ใช่ Feature Node)
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
         // ถ้าสถานะเป็น Success แล้ว อาจจะยอมให้ผ่าน (กรณี Load Workflow)
         if (node.data.status !== 'success') {
             return { isValid: false, message: 'Please upload an image first.' };
         }
      }
      break;

    // 2. Matchers (จุดที่แก้!)
    case 'bfmatcher':
    case 'flannmatcher':
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Feature A & Feature B).' };
      }

      const sourceNodes = incomingEdges.map(e => nodes.find(n => n.id === e.source));
      const nodeA = sourceNodes[0];
      const nodeB = sourceNodes[1];

      // คำนวณขนาด Vector ของทั้ง 2 ฝั่ง
      const dimA = getDescriptorDimension(nodeA);
      const dimB = getDescriptorDimension(nodeB);

      // ถ้าเป็น Feature Node ทั้งคู่ (มี dimension > 0)
      if (dimA > 0 && dimB > 0) {
          // 1. เช็คชนิด (เช่น SIFT vs SURF)
          if (nodeA?.type !== nodeB?.type) {
             return { 
                isValid: false, 
                message: `Type Mismatch: Cannot match '${nodeA?.type?.toUpperCase()}' with '${nodeB?.type?.toUpperCase()}'.` 
             };
          }

          // 2. 🔥 เช็คขนาด Dimension (SURF 64 vs SURF 128)
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

    // 4. Single Input Nodes (อื่นๆ)
    default:
      if (inputCount < 1 && ![
          'image-input' // ยกเว้น Image Input ที่ไม่ต้องมี Input
      ].includes(type)) {
          return { isValid: false, message: 'Missing input connection.' };
      }
      break;
  }

  return { isValid: true };
}