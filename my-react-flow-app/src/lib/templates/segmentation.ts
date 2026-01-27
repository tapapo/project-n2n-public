// File: src/lib/templates/segmentation.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const SAMPLE_IMG = '/static/samples/placeholder_segmentation.jpg';

const INPUT_NODE: Node = {
  id: 'n1-seg',
  type: 'image-input',
  position: { x: 250, y: 50 },
  data: {
    label: 'Input Image',
    status: 'success',
    description: "Sample Image Loaded",
    payload: {
      name: 'sample.jpg',
      url: SAMPLE_IMG,
      width: 800,
      height: 600
    }
  }
};

export const SEGMENTATION_DEEPLAB_TEMPLATE: WorkflowTemplate = {
  name: 'DeepLab V3+ (Semantic Segmentation)',
  descriptor: {
    en: 'Deep learning model for pixel-level object classification and segmentation.',
    th: 'โมเดล Deep Learning สำหรับจำแนกประเภทวัตถุในระดับพิกเซล (Semantic Segmentation)',
  },
  description: 'IMAGE + DEEPLAB',
  longDescription: {
    en: `DeepLab V3+ is a state-of-the-art semantic segmentation model developed by Google. It employs "atrous convolution" to effectively capture multi-scale context without losing resolution, and an encoder-decoder structure to refine object boundaries.
    
It is widely used for tasks like autonomous driving, medical imaging, and background removal, assigning a specific class label to every pixel in the image.`,
    th: `DeepLab V3+ เป็นโมเดล Semantic Segmentation ชั้นนำจาก Google ที่โดดเด่นด้วยการใช้เทคนิค "Atrous Convolution" เพื่อวิเคราะห์บริบทของภาพในหลายระดับสเกล และโครงสร้าง Encoder-Decoder ที่ช่วยให้ขอบของวัตถุมีความคมชัดแม่นยำ
    
นิยมใช้ในงานรถยนต์ไร้คนขับ การวิเคราะห์ภาพทางการแพทย์ หรือการลบพื้นหลัง โดยโมเดลจะทำการระบุประเภทวัตถุ (Class Label) ให้กับทุกๆ พิกเซลในภาพ`
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
    { id: 'e1', source: 'n1-seg', target: 'n2-deeplab', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
    { id: 'e2', source: 'n2-deeplab', target: 'n3-save-seg-img', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
    { id: 'e3', source: 'n2-deeplab', target: 'n4-save-seg-json', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
  ]
};