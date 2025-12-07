
//src/lib/validation.ts
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData } from '../types';

export type ValidationResult = {
  isValid: boolean;
  message?: string;
};

/**
 * ฟังก์ชันตรวจสอบว่า Node พร้อมทำงานไหม (มี Input ครบหรือยัง?)
 */
export function validateNodeInput(
  nodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
): ValidationResult {
  // 1. หาตัวตนของ Node
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) {
    return { isValid: false, message: 'Node not found in graph.' };
  }

  // 2. นับจำนวนเส้นที่วิ่งเข้าหา Node นี้ (Incoming Edges)
  const incomingEdges = edges.filter((e) => e.target === nodeId);
  const inputCount = incomingEdges.length;

  // 3. ตรวจสอบกฎตามประเภทของ Node
  switch (node.type) {
    // ----------------------------------------------------
    // กลุ่ม Source: ไม่ต้องมี Input แต่ต้องมีข้อมูลในตัว
    // ----------------------------------------------------
    case 'image-input':
      // ต้องมี URL รูปภาพใน payload (แสดงว่าอัปโหลดแล้ว)
      if (!node.data?.payload?.url && !node.data?.payload?.image_path) {
        return { isValid: false, message: 'Please upload an image first.' };
      }
      break;

    // ----------------------------------------------------
    // กลุ่ม Single Input: ต้องการ 1 เส้น
    // ----------------------------------------------------
    case 'sift':
    case 'surf':
    case 'orb':
    case 'brisque':       // No-reference metric (รูปเดียว)
    case 'otsu':
    case 'snake':
    case 'save-image':    // ต้องการรูปมาเซฟ
    case 'save-json':     // ต้องการข้อมูลมาเซฟ
    case 'homography-align': // รับ Matches JSON (1 เส้น)
    case 'affine-align':     // รับ Matches JSON (1 เส้น)
      if (inputCount < 1) {
        return { isValid: false, message: 'Missing input connection (Drag a line to this node).' };
      }
      break;

    // ----------------------------------------------------
    // กลุ่ม Dual Input: ต้องการ 2 เส้น (เปรียบเทียบ)
    // ----------------------------------------------------
    case 'bfmatcher':
    case 'flannmatcher':
      // ต้องการ Features 2 ชุดมาเทียบกัน
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Feature A & Feature B).' };
      }
      break;

    case 'psnr':
    case 'ssim':
      // Full-reference metric ต้องการรูปต้นฉบับ vs รูปผลลัพธ์
      if (inputCount < 2) {
        return { isValid: false, message: 'Requires 2 inputs (Original & Processed).' };
      }
      break;

    default:
      break;
  }

  return { isValid: true };
}