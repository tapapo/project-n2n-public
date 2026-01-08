import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

// Placeholder Paths
const SAMPLE_IMG = '/static/samples/placeholder_restoration.jpg';
const RESULT_IMG = '/static/samples/json/restoration/result_placeholder.jpg';
const RESULT_JSON = '/static/samples/json/restoration/result_placeholder.json';

const INPUT_NODE: Node = {
  id: 'n1-restore',
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
      width: 256,
      height: 256
    }
  }
};

export const RESTORATION_REALESRGAN_TEMPLATE: WorkflowTemplate = {
  name: 'Real-ESRGAN (Super Resolution & Restoration)',
  descriptor: {
    en: 'Explain later (อธิบายสะไอเล่)',
    th: 'อธิบายสะไอเล่ (ไทย)',
  },
  description: 'IMAGE + REAL-ESRGAN',
  longDescription: {
    en: `Explain later (Detailed description here)...`,
    th: `อธิบายสะไอเล่ (คำอธิบายแบบละเอียด)...`
  },
  color: 'red', 
  nodes: [
    INPUT_NODE,
    {
      id: 'n2-realesrgan',
      type: 'realesrgan',
      position: { x: 650, y: 100 },
      data: {
        label: 'Real-ESRGAN',
        status: 'success',
        description: "Upscaled x4",
        payload: {
          params: { model_name: 'RealESRGAN_x4plus', face_enhance: false },
          result_image_url: RESULT_IMG,
          output_image: RESULT_IMG,
          json_url: RESULT_JSON,
          json: { status: "success", scale: 4, output_image: RESULT_IMG }
        }
      }
    } as Node,
    {
      id: 'n3-save-restore',
      type: 'save-image',
      position: { x: 1050, y: 150 },
      data: { label: 'Save Upscaled', status: 'idle' }
    } as Node
  ],
  edges: [
    // ✅ แก้สีเส้นเป็น #64748b (สีปกติ)
    { id: 'e1', source: 'n1-restore', target: 'n2-realesrgan', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
    { id: 'e2', source: 'n2-realesrgan', target: 'n3-save-restore', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
  ]
};