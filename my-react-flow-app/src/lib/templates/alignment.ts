// File: src/lib/templates/alignment.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const IMG_1_URL = '/static/samples/1.png';
const IMG_2_URL = '/static/samples/2.png';

export const OBJECT_ALIGNMENT_HOMOGRAPHY: WorkflowTemplate = {
  name: 'Homography Estimation',
  descriptor: {
    en: 'Calculates a transformation matrix to map points from one perspective to another.',
    th: 'การคำนวณเมทริกซ์เพื่อแปลงมุมมองภาพ (Perspective) ให้ทับซ้อนกันได้อย่างถูกต้อง',
  },
  description: 'IMAGE + SIFT + FLANN + HOMOGRAPHY',

  longDescription: {
    en: `Homography computes a 3x3 matrix that relates two images of the same planar surface in space. It is used to "warp" the source image to align perfectly with the target image, correcting perspective distortions.
    
    This is essential for image stitching (panoramas) and perspective correction, offering more capabilities than standard Affine transformations.`,
    th: `Homography คือการหาความสัมพันธ์ทางเรขาคณิตระหว่างภาพสองภาพ ผลลัพธ์คือเมทริกซ์ขนาด 3x3 ที่ใช้ "บิด" (Warp) ภาพต้นฉบับให้เปลี่ยนมุมมองไปตรงกับภาพเป้าหมายได้
    
    เทคนิคนี้จำเป็นมากในการต่อภาพพาโนรามา หรือการแก้ภาพเบี้ยว (Perspective Correction) ซึ่งทำงานได้ครอบคลุมกว่าการแปลงแบบ Affine`
  },

  color: 'purple',

  nodes: [
    {
      id: "n1-ref",
      type: "image-input",
      position: { x: 50, y: 10.8 },
      data: {
        label: "Image Input (Reference)",
        status: "success",
        description: "Reference Image Loaded",
        payload: { 
          name: "1.png", 
          url: IMG_1_URL, 
          width: 512, 
          height: 288 
        }
      }
    } as Node,

    {
      id: "n3-sift-ref",
      type: "sift",
      position: { x: 450, y: 140.83 },
      data: {
        label: "SIFT Feature (Ref)",
        status: "idle",
        description: "Ready to extract...",
        payload: {
          params: { 
            nfeatures: 500, 
            nOctaveLayers: 3, 
            contrastThreshold: 0.04, 
            edgeThreshold: 12, 
            sigma: 1.6 
          }
        }
      }
    },

    {
      id: "n2-target",
      type: "image-input",
      position: { x: 50, y: 560 },
      data: {
        label: "Image Input (Target)",
        status: "success",
        description: "Target Image Loaded",
        payload: { 
          name: "2.png", 
          url: IMG_2_URL, 
          width: 310, 
          height: 240 
        }
      }
    },

    {
      id: "n4-sift-target",
      type: "sift",
      position: { x: 450, y: 713.9 },
      data: {
        label: "SIFT Feature (Target)",
        status: "idle", 
        description: "Ready to extract...",
        payload: {
          params: { 
            nfeatures: 0, 
            nOctaveLayers: 3, 
            contrastThreshold: 0.04, 
            edgeThreshold: 10, 
            sigma: 1.6 
          }
        }
      }
    },

    {
      id: "n5-flann",
      type: "flannmatcher",
      position: { x: 850, y: 420 },
      data: {
        label: "FLANN Matcher",
        status: "idle", 
        description: "Ready to match...",
        payload: {
          params: { 
            lowe_ratio: 0.4, 
            ransac_thresh: 5, 
            draw_mode: "good", 
            index_params: "AUTO", 
            search_params: "AUTO" 
          }
        }
      }
    },

    {
      id: "n6-homo",
      type: "homography-align",
      position: { x: 1250, y: 421.3 },
      data: {
        label: "Homography Warp",
        status: "idle", 
        description: "Ready to warp...",
        payload: {
          params: { 
            warp_mode: "image2_to_image1", 
            blend: true 
          }
        }
      }
    },

    
  ],

  edges: [
    { id: "e1", source: "n1-ref", target: "n3-sift-ref", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e2", source: "n2-target", target: "n4-sift-target", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e3", source: "n3-sift-ref", target: "n5-flann", targetHandle: "file1", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e4", source: "n4-sift-target", target: "n5-flann", targetHandle: "file2", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e5", source: "n5-flann", target: "n6-homo", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },

  ],
};