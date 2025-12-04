import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const IMG1_URL = '/static/samples/1.png';

export const FEATURE_EXTRACTION_SINGLE: WorkflowTemplate = {
  name: 'Feature Extraction (1.png Only)',
  description: 'Single image SIFT extraction test.',
  color: 'green',
  nodes: [
    { 
      id: 'n1-img1', 
      type: 'image-input', 
      position: { x: 50, y: 50 }, 
      data: { 
        label: 'Input Image 1', 
        status: 'success', 
        description: "Image uploaded",
        payload: { name: '1.png', url: IMG1_URL, result_image_url: IMG1_URL, width: 512, height: 288 } 
      } 
    } as Node,
    // Feature Extraction (SIFT) - ใช้ไฟล์ผลลัพธ์ SIFT ที่มีอยู่แล้ว
    { 
      id: 'n2-sift', 
      type: 'sift', 
      position: { x: 450, y: 50 }, 
      data: { 
        label: 'SIFT Extractor', 
        status: 'success', 
        description: "Found 500 keypoints",
        payload: {
            params: { nfeatures: 500, nOctaveLayers: 3, contrastThreshold: 0.04, edgeThreshold: 12, sigma: 1.6 },
            num_keypoints: 500,
            vis_url: '/static/samples/json/feature/sift_1_vis.jpg',
            result_image_url: '/static/samples/json/feature/sift_1_vis.jpg',
            json_url: '/static/samples/json/feature/sift_1.json',
            json_path: '/static/samples/json/feature/sift_1.json',
            json: { num_keypoints: 500, vis_url: '/static/samples/json/feature/sift_1_vis.jpg' }
        }
      } 
    } as Node,
    { 
      id: 'n3-save', 
      type: 'save-json', 
      position: { x: 850, y: 50 }, 
      data: { label: 'Save Keypoints', status: 'idle' } 
    } as Node,
  ],
  edges: [
    { id: 'e1', source: 'n1-img1', target: 'n2-sift', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e2', source: 'n2-sift', target: 'n3-save', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
  ],
};