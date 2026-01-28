// File: src/lib/templates/segmentation.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const SAMPLE_IMG = '/static/samples/lele.jpg'; 

const INPUT_NODE: Node = {
  id: 'n1-seg',
  type: 'image-input',
  position: { x: 250, y: 50 },
  data: {
    label: 'Input Image',
    status: 'success',
    description: "Sample Image Loaded",
    payload: {
      name: 'sample.jpg', // แก้ชื่อไฟล์ตามต้องการ ให้ตรงกับภาพที่ใช้จริง
      url: SAMPLE_IMG,
      width: 800, // แก้ขนาดของภาพเองดูจากรูปที่ใช้จริง
      height: 600 // แก้ขนาดของภาพเองดูจากรูปที่ใช้จริง
    }
  }
};

export const SEGMENTATION_DEEPLAB_TEMPLATE: WorkflowTemplate = {
  name: 'DeepLab V3+ (Semantic Segmentation)',
  descriptor: {
    en: 'ใส่สะอิ้ง',// แก้คำอธิบายเป็นภาษาอังกฤษ
    th: 'ใส่สะ',// แก้คำอธิบายเป็นภาษาไทย
  },
  description: 'IMAGE + DEEPLAB',
  longDescription: {
    en: `ใส่สะอิ้ง`,// แก้คำอธิบายยาวเป็นภาษาอังกฤษ
    th: `ใส่สะ`// แก้คำอธิบายยาวเป็นภาษาไทย
  },
  color: 'yellow',
  nodes: [
    INPUT_NODE,
    {
      id: 'n2-deeplab',
      type: 'deeplab',
      position: { x: 650, y: 300 }, // ปรับตำแหน่งตามต้องการ ปรับแต่ y
      data: {
        label: 'DeepLab v3+',
        status: 'idle', 
        description: "Ready to segment...",
        payload: {
          params: { 
            backbone: 'resnet50', 
            dataset: 'coco', 
            output_stride: 16 
          }
        }
      }
    } as Node,
    
  ],
  edges: [
    { id: 'e1', source: 'n1-seg', target: 'n2-deeplab', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },

  ]
};