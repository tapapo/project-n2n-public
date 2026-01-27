// File: src/lib/templates/enhancement.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const SAMPLE_IMG = '/static/samples/placeholder_enhancement.jpg';

const INPUT_NODE: Node = {
  id: 'n1-enhance',
  type: 'image-input',
  position: { x: 250, y: 50 },
  data: {
    label: 'Input Image',
    status: 'success', 
    description: "Sample Image Loaded",
    payload: {
      name: 'sample.jpg',
      url: SAMPLE_IMG,
      width: 512,
      height: 512
    }
  }
};

export const ENHANCEMENT_CLAHE_TEMPLATE: WorkflowTemplate = {
  name: 'CLAHE (Contrast Limited Adaptive Histogram Equalization)',
  descriptor: {
    en: 'Enhances local contrast and edge definition using adaptive histogram equalization.',
    th: 'การเพิ่มความคมชัดของภาพโดยการปรับกราฟ Histogram แบบเฉพาะจุด (Local) ช่วยดึงรายละเอียดในเงามืด',
  },
  description: 'IMAGE + CLAHE',
  longDescription: {
    en: `CLAHE is a variant of Adaptive Histogram Equalization (AHE) that takes care of over-amplification of contrast. It operates on small regions in the image, called tiles, rather than the entire image.
    
It is particularly useful for improving the contrast of medical images, underwater images, or images captured in low-light conditions.`,
    th: `CLAHE เป็นเทคนิคที่พัฒนาต่อจาก AHE เพื่อแก้ปัญหาการเร่งความคมชัด (Contrast) ที่มากเกินไปจนเกิด Noise โดยจะแบ่งภาพออกเป็นส่วนย่อยๆ (Tiles) แล้วปรับ Histogram ในแต่ละส่วนแยกกัน
    
เหมาะสำหรับภาพถ่ายทางการแพทย์ ภาพใต้น้ำ หรือภาพถ่ายในที่แสงน้อยที่ต้องการดึงรายละเอียดในเงามืดออกมาโดยไม่ทำให้ภาพแตก`
  },
  color: 'indigo', 
  nodes: [
    INPUT_NODE,
    {
      id: 'n2-clahe',
      type: 'clahe',
      position: { x: 650, y: 100 },
      data: {
        label: 'CLAHE Enhancement',
        status: 'idle', 
        description: "Ready to enhance...",
        payload: {
          params: { 
            clip_limit: 2.0, 
            tile_grid_size: 8 
          }
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
    { id: 'e1', source: 'n1-enhance', target: 'n2-clahe', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
    { id: 'e2', source: 'n2-clahe', target: 'n3-save-enhance', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
  ]
};