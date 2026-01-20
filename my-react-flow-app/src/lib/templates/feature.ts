// src/lib/templates/feature.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const IMG1_URL = '/static/samples/1.png';
const SIFT_VIS = '/static/samples/json/feature/sift_1_vis.jpg';
const SIFT_JSON = '/static/samples/json/feature/sift_1.json';

export const FEATURE_EXTRACTION_SINGLE: WorkflowTemplate = {
  name: 'SIFT (Scale-Invariant Feature Transform)',
  descriptor: {
    en: 'Extracts robust keypoints and descriptors invariant to image scale and rotation.',
    th: 'อัลกอริทึมค้นหาจุดเด่น (Keypoints) ที่ทนทานต่อการย่อขยายและการหมุนของภาพ'
  },
  description: 'IMAGE + SIFT',
  longDescription: {
    en: `SIFT is a powerful algorithm for detecting local features in an image. It identifies "keypoints" that remain stable even when the image is resized, rotated, or has changed illumination. It works by constructing image pyramids to find features at multiple scales.
    
Similar algorithms in this category include SURF (faster version) and ORB (efficient alternative for real-time apps).`,
    th: `SIFT เป็นอัลกอริทึมทรงพลังในการระบุ "จุดสนใจ" ภายในภาพ จุดเด่นที่หาได้จะมีคุณสมบัติพิเศษคือไม่เปลี่ยนแปลงแม้ภาพจะถูกย่อขยาย (Scale) หรือหมุน (Rotation) โดยเริ่มจากการสร้าง Image Pyramids เพื่อหาจุดเด่นในทุกขนาด
    
ในกลุ่มนี้ยังมีอัลกอริทึมอื่นๆ เช่น SURF และ ORB ที่ทำงานด้วยหลักการคล้ายกันแต่มีความเร็วและวิธีการคำนวณต่างกัน`
  },
  color: 'green',
  nodes: [
    {
      id: 'n1-img1',
      type: 'image-input',
      position: { x: 50, y: 10.8 },
      data: {
        label: 'Input Image 1',
        status: 'success',
        description: 'Image loaded from sample dataset.',
        payload: {
          name: '1.png',
          url: IMG1_URL,
          result_image_url: IMG1_URL,
          width: 512,
          height: 288
        }
      }
    } as Node,

    {
      id: 'n2-sift',
      type: 'sift',
      position: { x: 450, y: 50 },
      data: {
        label: 'SIFT Extractor',
        status: 'success',
        description: '500 keypoints detected.',
        payload: {
          params: { nfeatures: 500, nOctaveLayers: 3, contrastThreshold: 0.04, edgeThreshold: 12, sigma: 1.6 },
          num_keypoints: 500,
          
          // ✅ เพิ่มบรรทัดนี้: ใส่ [Height, Width] เพื่อให้ UI แสดง Dimensions
          image_shape: [288, 512],

          vis_url: SIFT_VIS,
          result_image_url: SIFT_VIS,
          preview_url: SIFT_VIS,
          json_url: SIFT_JSON,
          json_path: SIFT_JSON,
          json: { num_keypoints: 500, vis_url: SIFT_VIS }
        }
      }
    } as Node,

    {
      id: 'n3-save',
      type: 'save-json',
      position: { x: 850, y: 199.3 },
      data: {
        label: 'Save Keypoints',
        status: 'idle'
      }
    } as Node
  ],
  edges: [
    { id: 'e1', source: 'n1-img1', target: 'n2-sift', type: 'smoothstep', style: { strokeWidth: 2, stroke: '#64748b' } },
    { id: 'e2', source: 'n2-sift', target: 'n3-save', type: 'smoothstep', style: { strokeWidth: 2, stroke: '#64748b' } }
  ]
};