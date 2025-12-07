// src/lib/workflowTemplates.ts
import type { Edge, Node } from 'reactflow';
import type { CustomNodeData } from '../types';

// ============================================================
// Workflow Template Type (FINAL UPDATED VERSION)
// ============================================================
export type WorkflowTemplate = {
  desc?: any;
  name: string;
  descriptor?: { en: string; th: string }; // 👈 เพิ่มตรงนี้
  description: string;
  longDescription?: { en: string; th: string }; // 👈 เปลี่ยนเป็น object

  color: string;

  nodes: Node<CustomNodeData>[];
  edges: Edge[];
};

// ------------------------------------------------------------
// Import Template Groups
// ------------------------------------------------------------

// Feature & Matching
import { FEATURE_EXTRACTION_SINGLE } from './templates/feature';
import { FEATURE_MATCHING_PIPELINE } from './templates/matching';

// Classification (Separated)
import {
  OTSU_CLASSIFICATION_TEMPLATE,
  SNAKE_CLASSIFICATION_TEMPLATE,
} from './templates/classification';

// Alignment
import { OBJECT_ALIGNMENT_HOMOGRAPHY } from './templates/alignment';

// Quality (Separated)
import {
  PSNR_ASSESSMENT_TEMPLATE,
  BRISQUE_ASSESSMENT_TEMPLATE,
} from './templates/quality';

// ------------------------------------------------------------
//  FINAL TEMPLATE LIST (EXPORT)
// ------------------------------------------------------------
export const TEMPLATES: WorkflowTemplate[] = [
  // ====================================
  // Feature Extraction & Matching
  // ====================================
  FEATURE_EXTRACTION_SINGLE,
  FEATURE_MATCHING_PIPELINE,

  // ====================================
  // Quality Assessment (Separated)
  // ====================================
  PSNR_ASSESSMENT_TEMPLATE,
  BRISQUE_ASSESSMENT_TEMPLATE,

  // ====================================
  // Classification (Separated)
  // ====================================
  OTSU_CLASSIFICATION_TEMPLATE,
  SNAKE_CLASSIFICATION_TEMPLATE,

  // ====================================
  // Alignment
  // ====================================
  OBJECT_ALIGNMENT_HOMOGRAPHY,
];