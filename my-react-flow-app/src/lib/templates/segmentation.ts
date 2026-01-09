// File: my-react-flow-app/src/lib/templates/segmentation.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

// Placeholder Paths
const SAMPLE_IMG = '/static/samples/placeholder_segmentation.jpg';
const RESULT_IMG = '/static/samples/json/segmentation/result_placeholder.png';
const RESULT_JSON = '/static/samples/json/segmentation/result_placeholder.json';

const INPUT_NODE: Node = {
  id: 'n1-seg',
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
      width: 800,
      height: 600
    }
  }
};

export const SEGMENTATION_DEEPLAB_TEMPLATE: WorkflowTemplate = {
  name: 'DeepLab V3+ (Semantic Segmentation)',
  descriptor: {
    en: 'Explain later (อธิบายสะไอเล่)',
    th: 'อธิบายสะไอเล่ (ไทย)',
  },
  description: 'IMAGE + DEEPLAB',
  longDescription: {
    en: `Explain later (Detailed description here)...`,
    th: `อธิบายสะไอเล่ (คำอธิบายแบบละเอียด)...`
  },
  color: 'yellow',
  nodes: [
    INPUT_NODE,
    {
      id: 'n2-deeplab',
      type: 'deeplab',
      position: { x: 650, y: 100 },
      data: {
        label: 'DeepLab v3+',
        status: 'success',
        description: "Segmented",
        payload: {
          params: { backbone: 'resnet50', dataset: 'coco', output_stride: 16 },
          result_image_url: RESULT_IMG,
          output_image: RESULT_IMG,
          json_url: RESULT_JSON,
          json: { status: "success", classes_found: ["person", "car"], output_image: RESULT_IMG }
        }
      }
    } as Node,
    {
      id: 'n3-save-seg-img',
      type: 'save-image',
      position: { x: 1050, y: 50 },
      data: { label: 'Save Mask Image', status: 'idle' }
    } as Node,
    {
      id: 'n4-save-seg-json',
      type: 'save-json',
      position: { x: 1050, y: 250 },
      data: { label: 'Save Classes', status: 'idle' }
    } as Node
  ],
  edges: [
    // ✅ แก้สีเส้นเป็น #64748b (สีปกติ)
    { id: 'e1', source: 'n1-seg', target: 'n2-deeplab', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
    { id: 'e2', source: 'n2-deeplab', target: 'n3-save-seg-img', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
    { id: 'e3', source: 'n2-deeplab', target: 'n4-save-seg-json', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
  ]
};