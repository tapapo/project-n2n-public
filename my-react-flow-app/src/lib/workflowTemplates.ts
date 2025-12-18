// src/lib/workflowTemplates.ts
import type { Edge, Node } from 'reactflow';
import type { CustomNodeData } from '../types';


export type WorkflowTemplate = {
  desc?: any;
  name: string;
  descriptor?: { en: string; th: string }; 
  description: string;
  longDescription?: { en: string; th: string }; 

  color: string;

  nodes: Node<CustomNodeData>[];
  edges: Edge[];
};

// Import Template Groups

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
export const TEMPLATES: WorkflowTemplate[] = [
  
  FEATURE_EXTRACTION_SINGLE,
  FEATURE_MATCHING_PIPELINE,
  PSNR_ASSESSMENT_TEMPLATE,
  BRISQUE_ASSESSMENT_TEMPLATE,
  OTSU_CLASSIFICATION_TEMPLATE,
  SNAKE_CLASSIFICATION_TEMPLATE,
  OBJECT_ALIGNMENT_HOMOGRAPHY,
];