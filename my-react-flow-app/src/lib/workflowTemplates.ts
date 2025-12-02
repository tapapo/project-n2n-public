import type { Node, Edge } from 'reactflow';
import type { CustomNodeData } from '../types';

export type WorkflowTemplate = {
  name: string;
  description: string;
  color: string; // เพิ่มสีเพื่อให้ Sidebar เอาไปใช้แสดงผล
  nodes: Node<CustomNodeData>[];
  edges: Edge[];
};

// =============================================================================
// 🟢 JOB 1: Feature Extraction (SIFT)
// =============================================================================
const templateFeature: WorkflowTemplate = {
  name: 'Feature Extraction (SIFT)',
  description: 'Detect keypoints using SIFT and save descriptors as JSON.',
  color: 'green',
  nodes: [
    { id: 't1-img', type: 'image-input', position: { x: 50, y: 100 }, data: { label: 'Input Image', status: 'idle' } },
    { id: 't1-sift', type: 'sift', position: { x: 400, y: 100 }, data: { label: 'SIFT', status: 'idle' } },
    { id: 't1-save', type: 'save-json', position: { x: 750, y: 100 }, data: { label: 'Save Features', status: 'idle' } },
  ],
  edges: [
    { id: 'e1-1', source: 't1-img', target: 't1-sift', type: 'smoothstep' },
    { id: 'e1-2', source: 't1-sift', target: 't1-save', type: 'smoothstep' },
  ],
};

// =============================================================================
// 🟠 JOB 2: Matching (Features + Matcher)
// =============================================================================
const templateMatching: WorkflowTemplate = {
  name: 'Feature Matching (SIFT + BF)',
  description: 'Extract features from two images and match them.',
  color: 'orange',
  nodes: [
    { id: 't2-img1', type: 'image-input', position: { x: 50, y: 50 }, data: { label: 'Image 1', status: 'idle' } },
    { id: 't2-img2', type: 'image-input', position: { x: 50, y: 300 }, data: { label: 'Image 2', status: 'idle' } },
    
    { id: 't2-sift1', type: 'sift', position: { x: 400, y: 50 }, data: { label: 'SIFT 1', status: 'idle' } },
    { id: 't2-sift2', type: 'sift', position: { x: 400, y: 300 }, data: { label: 'SIFT 2', status: 'idle' } },
    
    { id: 't2-bf', type: 'bfmatcher', position: { x: 750, y: 175 }, data: { label: 'BF Matcher', status: 'idle' } },
    
    { id: 't2-save', type: 'save-json', position: { x: 1100, y: 175 }, data: { label: 'Save Matches', status: 'idle' } },
  ],
  edges: [
    { id: 'e2-1', source: 't2-img1', target: 't2-sift1', type: 'smoothstep' },
    { id: 'e2-2', source: 't2-img2', target: 't2-sift2', type: 'smoothstep' },
    
    { id: 'e2-3', source: 't2-sift1', target: 't2-bf', targetHandle: 'file1', type: 'smoothstep' },
    { id: 'e2-4', source: 't2-sift2', target: 't2-bf', targetHandle: 'file2', type: 'smoothstep' },
    
    { id: 'e2-5', source: 't2-bf', target: 't2-save', type: 'smoothstep' },
  ],
};

// =============================================================================
// 🟣 JOB 3: Object Alignment (Homography)
// =============================================================================
const templateAlignment: WorkflowTemplate = {
  name: 'Object Alignment (Homography)',
  description: 'Full pipeline: Features -> Matcher -> Homography Warp.',
  color: 'purple',
  nodes: [
    { id: 't3-img1', type: 'image-input', position: { x: 50, y: 50 }, data: { label: 'Reference', status: 'idle' } },
    { id: 't3-img2', type: 'image-input', position: { x: 50, y: 300 }, data: { label: 'Target', status: 'idle' } },
    
    { id: 't3-orb1', type: 'orb', position: { x: 400, y: 50 }, data: { label: 'ORB 1', status: 'idle' } },
    { id: 't3-orb2', type: 'orb', position: { x: 400, y: 300 }, data: { label: 'ORB 2', status: 'idle' } },
    
    { id: 't3-flann', type: 'flannmatcher', position: { x: 750, y: 175 }, data: { label: 'FLANN', status: 'idle' } },
    
    { id: 't3-homo', type: 'homography-align', position: { x: 1100, y: 175 }, data: { label: 'Homography', status: 'idle' } },
    
    { id: 't3-save', type: 'save-image', position: { x: 1450, y: 175 }, data: { label: 'Save Result', status: 'idle' } },
  ],
  edges: [
    { id: 'e3-1', source: 't3-img1', target: 't3-orb1', type: 'smoothstep' },
    { id: 'e3-2', source: 't3-img2', target: 't3-orb2', type: 'smoothstep' },
    
    { id: 'e3-3', source: 't3-orb1', target: 't3-flann', targetHandle: 'file1', type: 'smoothstep' },
    { id: 'e3-4', source: 't3-orb2', target: 't3-flann', targetHandle: 'file2', type: 'smoothstep' },
    
    { id: 'e3-5', source: 't3-flann', target: 't3-homo', type: 'smoothstep' },
    { id: 'e3-6', source: 't3-homo', target: 't3-save', type: 'smoothstep' },
  ],
};

// =============================================================================
// 🌸 JOB 4: Classification / Segmentation (Snake)
// =============================================================================
const templateClassification: WorkflowTemplate = {
  name: 'Classification (Otsu / Snake)',
  description: 'Extract object using Active Contour or Thresholding.',
  color: 'pink',
  nodes: [
    { id: 't4-img', type: 'image-input', position: { x: 50, y: 100 }, data: { label: 'Input Image', status: 'idle' } },
    
    // Otsu Branch
    { id: 't4-otsu', type: 'otsu', position: { x: 400, y: 50 }, data: { label: 'Otsu Threshold', status: 'idle' } },
    
    // Snake Branch
    { id: 't4-snake', type: 'snake', position: { x: 400, y: 350 }, data: { label: 'Snake', status: 'idle' } },
    
    { id: 't4-save1', type: 'save-image', position: { x: 750, y: 50 }, data: { label: 'Save Otsu', status: 'idle' } },
    { id: 't4-save2', type: 'save-image', position: { x: 750, y: 350 }, data: { label: 'Save Snake', status: 'idle' } },
  ],
  edges: [
    { id: 'e4-1', source: 't4-img', target: 't4-otsu', type: 'smoothstep' },
    { id: 'e4-2', source: 't4-img', target: 't4-snake', type: 'smoothstep' },
    
    { id: 'e4-3', source: 't4-otsu', target: 't4-save1', type: 'smoothstep' },
    { id: 'e4-4', source: 't4-snake', target: 't4-save2', type: 'smoothstep' },
  ],
};

// =============================================================================
// 🔵 JOB 5: Quality Assessment (BRISQUE/PSNR)
// =============================================================================
const templateQuality: WorkflowTemplate = {
  name: 'Quality Assessment',
  description: 'Compare Original vs Processed image quality.',
  color: 'blue',
  nodes: [
    { id: 't5-img1', type: 'image-input', position: { x: 50, y: 50 }, data: { label: 'Original', status: 'idle' } },
    { id: 't5-img2', type: 'image-input', position: { x: 50, y: 300 }, data: { label: 'Processed', status: 'idle' } },
    
    // No-Reference Metric
    { id: 't5-brisque', type: 'brisque', position: { x: 400, y: 50 }, data: { label: 'BRISQUE', status: 'idle' } },
    
    // Full-Reference Metric
    { id: 't5-psnr', type: 'psnr', position: { x: 400, y: 200 }, data: { label: 'PSNR', status: 'idle' } },
    { id: 't5-ssim', type: 'ssim', position: { x: 400, y: 450 }, data: { label: 'SSIM', status: 'idle' } },
  ],
  edges: [
    // Brisque (Single)
    { id: 'e5-1', source: 't5-img1', target: 't5-brisque', type: 'smoothstep' },
    
    // PSNR (Dual)
    { id: 'e5-2', source: 't5-img1', target: 't5-psnr', targetHandle: 'input1', type: 'smoothstep' },
    { id: 'e5-3', source: 't5-img2', target: 't5-psnr', targetHandle: 'input2', type: 'smoothstep' },

    // SSIM (Dual)
    { id: 'e5-4', source: 't5-img1', target: 't5-ssim', targetHandle: 'input1', type: 'smoothstep' },
    { id: 'e5-5', source: 't5-img2', target: 't5-ssim', targetHandle: 'input2', type: 'smoothstep' },
  ],
};

export const TEMPLATES = [
  templateFeature,
  templateMatching,
  templateAlignment,
  templateClassification,
  templateQuality
];