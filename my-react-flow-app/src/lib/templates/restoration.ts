// File: src/lib/templates/restoration.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const SAMPLE_IMG = '/static/samples/placeholder_restoration.jpg';

const INPUT_NODE: Node = {
  id: 'n1-restore',
  type: 'image-input',
  position: { x: 250, y: 50 },
  data: {
    label: 'Input Image',
    status: 'success', 
    description: "Sample Image Loaded",
    payload: {
      name: 'sample.jpg',
      url: SAMPLE_IMG,
      width: 256,
      height: 256
    }
  }
};

export const RESTORATION_REALESRGAN_TEMPLATE: WorkflowTemplate = {
  name: 'Real-ESRGAN (Super Resolution & Restoration)',
  descriptor: {
    en: 'Restores and upscales low-quality images using deep learning (GANs).',
    th: 'ฟื้นฟูและขยายขนาดภาพความละเอียดต่ำให้คมชัดด้วยเทคโนโลยี Deep Learning (GANs)',
  },
  description: 'IMAGE + REAL-ESRGAN',
  longDescription: {
    en: `Real-ESRGAN is a practical algorithm for general image restoration. It extends the powerful ESRGAN model to handle real-world degradations (blur, noise, compression artifacts).
    
It is highly effective for upscaling anime images or old photos by 4x while synthesizing realistic textures and sharpening details.`,
    th: `Real-ESRGAN เป็นอัลกอริทึมยอดนิยมสำหรับการกู้คืนคุณภาพของภาพ โดยพัฒนาต่อจาก ESRGAN เพื่อให้รองรับความเสียหายของภาพในโลกจริงได้ดียิ่งขึ้น (เช่น ภาพเบลอ, Noise, หรือภาพแตกไฟล์ JPEG)
    
เหมาะอย่างยิ่งสำหรับการขยายภาพอนิเมะหรือภาพถ่ายเก่าๆ ให้ใหญ่ขึ้น 4 เท่า โดยยังคงรายละเอียดและความคมชัดไว้อย่างสมจริง`
  },
  color: 'red', 
  nodes: [
    INPUT_NODE,
    {
      id: 'n2-realesrgan',
      type: 'realesrgan',
      position: { x: 650, y: 100 },
      data: {
        label: 'Real-ESRGAN Upscaler',
        status: 'idle', 
        description: "Ready to upscale (x4)...",
        payload: {
          params: { 
            model_name: 'RealESRGAN_x4plus', 
            face_enhance: false 
          }
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
    { id: 'e1', source: 'n1-restore', target: 'n2-realesrgan', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
    { id: 'e2', source: 'n2-realesrgan', target: 'n3-save-restore', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 } },
  ]
};