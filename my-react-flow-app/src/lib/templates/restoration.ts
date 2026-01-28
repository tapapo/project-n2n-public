// File: src/lib/templates/restoration.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

//  Path และชื่อไฟล์ให้ตรงกับรูปที่มีอยู่จริงในโปรเจกต์
const SAMPLE_IMG = '/static/samples/64x64.png';  //  Path และชื่อไฟล์ให้ตรงกับรูปที่มีอยู่จริงในโปรเจกต์

const INPUT_NODE: Node = {
  id: 'n1-restore',
  type: 'image-input',
  position: { x: 250, y: 50 },
  data: {
    label: 'Input Image',
    status: 'success', 
    description: "Sample Image Loaded",
    payload: {
      name: 'sample_64x64.png', //แก้ชื่อไฟล์ให้ตรงกับรูปที่มีอยู่จริง
      url: SAMPLE_IMG,
      width: 64,  // แก้ขนาดของภาพเองดูจากรูปที่ใช้จริง
      height: 64  //  แก้ขนาดของภาพเองดูจากรูปที่ใช้จริง
    }
  }
};

export const RESTORATION_REALESRGAN_TEMPLATE: WorkflowTemplate = {
  name: 'Real-ESRGAN (Super Resolution & Restoration)',
  descriptor: {
    en: 'ใส่สะอิ้ง',
    th: 'ใส่สะ',
  },
  description: 'IMAGE + REAL-ESRGAN',
  longDescription: {
    en: `ใส่สะอิ้ง`,
    th: `ใส่สะ`
  },
  color: 'red', 
  nodes: [
    INPUT_NODE,
    {
      id: 'n2-realesrgan',
      type: 'realesrgan',
      position: { x: 650, y: 100 }, // ปรับตำแหน่งตามต้องการ ปรับแต่ y
      data: {
        label: 'Real-ESRGAN Upscaler',
        status: 'idle', 
        description: "Ready to upscale (x4)...",
        payload: {
          params: { 
            scale: 4,      // แก้ขนาดการขยายตามต้องการ (2, 4, 8)
            denoise: 0.4,   // ปรับค่าลดสัญญาณรบกวน (0.0-1.0)
            model_name: 'RealESRGAN_x4plus'
          }
        }
      }
    } as Node,
  ],
  edges: [
    { id: 'e1', source: 'n1-restore', target: 'n2-realesrgan', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
  ]
};