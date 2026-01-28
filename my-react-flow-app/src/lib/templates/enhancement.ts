// File: src/lib/templates/enhancement.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const SAMPLE_IMG = '/static/samples/lele.jpg';  //  Path และชื่อไฟล์ให้ตรงกับรูปที่มีอยู่จริงในโปรเจกต์

const INPUT_NODE: Node = {
  id: 'n1-enhance',
  type: 'image-input',
  position: { x: 250, y: 50 },
  data: {
    label: 'Input Image',
    status: 'success', 
    description: "Sample Image Loaded",
    payload: {
      name: 'sample.jpg',//แก้ชื่อไฟล์ให้ตรงกับรูปที่มีอยู่จริง
      url: SAMPLE_IMG,
      width: 512, // แก้ขนาดของภาพเองดูจากรูปที่ใช้จริง
      height: 512 // แก้ขนาดของภาพเองดูจากรูปที่ใช้จริง
    }
  }
};

export const ENHANCEMENT_CLAHE_TEMPLATE: WorkflowTemplate = {
  name: 'CLAHE (Contrast Limited Adaptive Histogram Equalization)',
  descriptor: {
    en: 'ใส่สะอิ้ง',
    th: 'ใส่สะ',
  },
  description: 'IMAGE + CLAHE',
  longDescription: {
    en: `ใส่สะอิ้ง`,
    th: `ใส่สะ`
  },
  color: 'indigo', 
  nodes: [
    INPUT_NODE,
    {
      id: 'n2-clahe',
      type: 'clahe',
      position: { x: 650, y: 204.52 }, // ปรับตำแหน่งตามต้องการ ปรับแต่ y
      data: {
        label: 'CLAHE Enhancement',
        status: 'idle', 
        description: "Ready to enhance...",
        payload: {
          params: { 
            clipLimit: 2.0,      // ค่าจำกัดการเพิ่ม Contrast
            tileGridSizeX: 8,    // ขนาดกริดในแนวนอน
            tileGridSizeY: 8      // ขนาดกริดในแนวตั้ง
          }
        }
      }
    } as Node,
  ],
  edges: [
    { id: 'e1', source: 'n1-enhance', target: 'n2-clahe', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
  ]
};