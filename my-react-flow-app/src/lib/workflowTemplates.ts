import type { Edge, Node } from 'reactflow';
import type { CustomNodeData } from '../types';

export type WorkflowTemplate = {
  name: string;
  description: string;
  color: string;
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
};

// 1. นำเข้า Template ย่อยทั้งหมด (รวมถึงไฟล์ที่แก้ใหม่)
import { FEATURE_EXTRACTION_SINGLE } from './templates/feature'; 
import { FEATURE_MATCHING_PIPELINE } from './templates/matching'; 
import { MOON_CLASSIFICATION } from './templates/classification'; 
import { OBJECT_ALIGNMENT_HOMOGRAPHY } from './templates/alignment'; 

// 🔑 FIX: Import เฉพาะชื่อ QUALITY_ASSESSMENT ที่ถูก Export แล้ว
import { QUALITY_ASSESSMENT } from './templates/quality'; 


// 2. รวมทั้งหมดใน Array TEMPLATES หลัก (ใช้ชื่อเดียวเท่านั้นสำหรับ Quality)
export const TEMPLATES: WorkflowTemplate[] = [
    // ----------------------------------------------------
    // กลุ่ม Feature & Matching
    // ----------------------------------------------------
    FEATURE_EXTRACTION_SINGLE, 
    FEATURE_MATCHING_PIPELINE, 

    // ----------------------------------------------------
    // กลุ่ม Quality Assessment (ตอนนี้รวมเป็น Lesson 5 เพียงอันเดียว)
    // ----------------------------------------------------
    QUALITY_ASSESSMENT,      // ✅ ใช้ชื่อที่ถูกต้อง
    
    // ----------------------------------------------------
    // กลุ่ม Classification & Alignment
    // ----------------------------------------------------
    MOON_CLASSIFICATION,     
    OBJECT_ALIGNMENT_HOMOGRAPHY, 
];