// src/lib/templates/quality.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';


const ORI_URL = '/static/samples/ori.png';
const NOISE_URL = '/static/samples/noise.jpg';
const MOON_URL = '/static/samples/Moonsample.jpg';
const PSNR_JSON = '/static/samples/json/quality/psnr_score.json';
const BRISQUE_JSON = '/static/samples/json/quality/brisque_score.json';


export const PSNR_ASSESSMENT_TEMPLATE: WorkflowTemplate = {
  name: 'PSNR (Peak Signal-to-Noise Ratio)',
  descriptor: {
    en: 'Measures image quality by comparing pixel differences against a reference image.',
    th: 'การวัดคุณภาพภาพโดยเปรียบเทียบสัญญาณต่อสัญญาณรบกวน โดยใช้ภาพต้นฉบับอ้างอิง'
  },
  description: 'IMAGE + PSNR',
  longDescription: {
    en: `PSNR is an engineering standard for measuring the reconstruction quality of an image (e.g., after compression). It calculates the error between the original image and the processed one. Higher values indicate better quality.
    
This works similarly to SSIM (Structural Similarity), but PSNR focuses purely on pixel-level error rather than structural perception.`,
    th: `PSNR คือมาตรวัดมาตรฐานที่ใช้ประเมินคุณภาพของภาพ (เช่น หลังการบีบอัด) โดยเปรียบเทียบหาค่าความผิดพลาดกับภาพต้นฉบับ (Reference Image) ยิ่งค่า PSNR สูง แสดงว่าคุณภาพภาพดี
    
หลักการทำงานคล้ายกับ SSIM แต่ PSNR จะเน้นคำนวณความต่างของเม็ดพิกเซลโดยตรงมากกว่าโครงสร้างภาพ`
  },
  color: 'blue',
  nodes: [
    {
      id: 'psnr-n1-ori',
      type: 'image-input',
      position: { x: 50, y: -200 },
      data: {
        label: 'Original (Ref)',
        status: 'success',
        description: 'Reference clean image',
        payload: { name: 'ori.png', url: ORI_URL, result_image_url: ORI_URL, width: 172, height: 172 },
      },
    } as Node,
    {
      id: 'psnr-n2-noise',
      type: 'image-input',
      position: { x: 50, y: 380 },
      data: {
        label: 'Processed / Noisy',
        status: 'success',
        description: 'Noisy / Denoised version',
        payload: { name: 'noise.jpg', url: NOISE_URL, result_image_url: NOISE_URL, width: 172, height: 172 },
      },
    } as Node,
    {
      id: 'psnr-n3-metric',
      type: 'psnr',
      position: { x: 430, y: 230 },
      data: {
        label: 'PSNR Metric',
        status: 'success',
        description: 'PSNR = 16.72 dB',
        payload: { quality_score: 16.72, json_url: PSNR_JSON, json_path: PSNR_JSON, json: { quality_score: 16.72 } },
      },
    } as Node,
    {
      id: 'psnr-n4-save-json',
      type: 'save-json',
      position: { x: 820, y: 297.95 },
      data: {
        label: 'Save PSNR JSON',
        status: 'idle',
      },
    } as Node,
  ],
  edges: [
    { id: 'psnr-e1', source: 'psnr-n1-ori', target: 'psnr-n3-metric', targetHandle: 'input1', type: 'smoothstep', style: { strokeWidth: 2, stroke: '#64748b' } },
    { id: 'psnr-e2', source: 'psnr-n2-noise', target: 'psnr-n3-metric', targetHandle: 'input2', type: 'smoothstep', style: { strokeWidth: 2, stroke: '#64748b' } },
    { id: 'psnr-e3', source: 'psnr-n3-metric', target: 'psnr-n4-save-json', type: 'smoothstep', style: { strokeWidth: 2, stroke: '#64748b' } },
  ],
};

// =============================================================================
// TEMPLATE 2: BRISQUE ONLY (No-Reference Quality)
// =============================================================================
export const BRISQUE_ASSESSMENT_TEMPLATE: WorkflowTemplate = {
  name: 'BRISQUE (Blind/Referenceless Image Spatial Quality Evaluator)',
  descriptor: {
    en: 'Evaluates image quality without a reference image using Natural Scene Statistics.',
    th: 'การวัดคุณภาพภาพแบบ "ไม่ต้องใช้ภาพต้นฉบับ" โดยวิเคราะห์จากสถิติของภาพธรรมชาติ'
  },
  description: 'IMAGE + BRISQUE',
  longDescription: {
    en: `Unlike PSNR, BRISQUE does not need an original image to compare against. It evaluates quality based on "Natural Scene Statistics," analyzing deviations in pixel distribution.
    
It can detect distortions like blur or noise by checking if the image statistics match those typically found in high-quality natural images.`,
    th: `ต่างจาก PSNR ตรงที่ BRISQUE ไม่ต้องใช้ภาพต้นฉบับมาเปรียบเทียบ แต่จะประเมินคุณภาพโดยใช้องค์ความรู้เรื่อง "สถิติของภาพธรรมชาติ" (Natural Scene Statistics)
    
    อัลกอริทึมจะตรวจสอบความผิดปกติของการกระจายตัวของแสง หากภาพมีความเบลอหรือ Noise สถิติเหล่านี้จะเพี้ยนไป ทำให้สามารถให้คะแนนคุณภาพได้ทันที`
  },
  color: 'blue',
  nodes: [
    {
      id: 'brisque-n1-img',
      type: 'image-input',
      position: { x: 50, y: 134.5 },
      data: {
        label: 'Input Image (Moon)',
        status: 'success',
        description: 'Example for BRISQUE metric',
        payload: { name: 'Moonsample.jpg', url: MOON_URL, result_image_url: MOON_URL, width: 600, height: 570 },
      },
    } as Node,
    {
      id: 'brisque-n2-metric',
      type: 'brisque',
      position: { x: 430, y: 279 },
      data: {
        label: 'BRISQUE Metric',
        status: 'success',
        description: 'BRISQUE = 33.60',
        payload: { quality_score: 33.6, json_url: BRISQUE_JSON, json_path: BRISQUE_JSON, json: { score: 33.6 } },
      },
    } as Node,
    {
      id: 'brisque-n3-save-json',
      type: 'save-json',
      position: { x: 820, y: 346.95 },
      data: {
        label: 'Save BRISQUE JSON',
        status: 'idle',
      },
    } as Node,
  ],
  edges: [
    { id: 'brisque-e1', source: 'brisque-n1-img', target: 'brisque-n2-metric', type: 'smoothstep', style: { strokeWidth: 2, stroke: '#64748b' } },
    { id: 'brisque-e2', source: 'brisque-n2-metric', target: 'brisque-n3-save-json', type: 'smoothstep', style: { strokeWidth: 2, stroke: '#64748b' } },
  ],
};