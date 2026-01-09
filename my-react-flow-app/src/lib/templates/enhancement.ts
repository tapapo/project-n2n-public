// File: my-react-flow-app/src/lib/templates/enhancement.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

// Placeholder Paths
const SAMPLE_IMG = '/static/samples/placeholder_enhancement.jpg';
const RESULT_IMG = '/static/samples/json/enhancement/result_placeholder.jpg';
const RESULT_JSON = '/static/samples/json/enhancement/result_placeholder.json';

const INPUT_NODE: Node = {
  id: 'n1-enhance',
  type: 'image-input',
  position: { x: 250, y: 50 },
  data: {
    label: 'Input Image',
    status: 'success',
    description: "Sample Image",
    payload: {
      name: 'sample.jpg',
      url: SAMPLE_IMG,
      result_image_url: SAMPLE_IMG,
      width: 512,
      height: 512
    }
  }
};

export const ENHANCEMENT_CLAHE_TEMPLATE: WorkflowTemplate = {
  name: 'CLAHE (Contrast Limited Adaptive Histogram Equalization)',
  descriptor: {
    en: 'Explain later (อธิบายสะไอเล่)',
    th: 'อธิบายสะไอเล่ (ไทย)',
  },
  description: 'IMAGE + CLAHE',
  longDescription: {
    en: `Explain later (Detailed description here)...`,
    th: `อธิบายสะไอเล่ (คำอธิบายแบบละเอียด)...`
  },
  color: 'indigo', 
  nodes: [
    INPUT_NODE,
    {
      id: 'n2-clahe',
      type: 'clahe',
      position: { x: 650, y: 100 },
      data: {
        label: 'CLAHE',
        status: 'success',
        description: "Done",
        payload: {
          params: { clip_limit: 2.0, tile_grid_size: 8 },
          result_image_url: RESULT_IMG,
          preview_url: RESULT_IMG,
          json_url: RESULT_JSON,
          json: { status: "success", output_image: RESULT_IMG }
        }
      }
    } as Node,
    {
      id: 'n3-save-enhance',
      type: 'save-image',
      position: { x: 1050, y: 150 },
      data: { label: 'Save Result', status: 'idle' }
    } as Node
  ],
  edges: [
    // ✅ แก้สีเส้นเป็น #64748b (สีปกติ)
    { id: 'e1', source: 'n1-enhance', target: 'n2-clahe', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
    { id: 'e2', source: 'n2-clahe', target: 'n3-save-enhance', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
  ]
};