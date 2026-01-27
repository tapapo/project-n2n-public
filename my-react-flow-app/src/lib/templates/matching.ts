// src/lib/templates/matching.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const IMG_1_URL = '/static/samples/1.png';
const IMG_2_URL = '/static/samples/2.png';

export const FEATURE_MATCHING_PIPELINE: WorkflowTemplate = {
  name: 'FLANN (Fast Library for Approximate Nearest Neighbors)',
  descriptor: {
    en: 'A high-speed matcher optimized for large datasets using approximate nearest neighbor search.',
    th: 'ตัวจับคู่จุดเด่นที่เน้นความเร็วสูง โดยใช้การค้นหาแบบประมาณค่า (Approximate)'
  },
  
  description: 'IMAGE + SIFT + FLANN',
  
  longDescription: {
    en: `Once features are extracted, FLANN helps match them between images efficiently. Unlike Brute-Force matchers that check every possibility, FLANN uses optimized data structures (like KD-Trees) to find the "nearest" matches much faster.
    
It provides an approximate result, trading a tiny bit of accuracy for significant speed, making it ideal for large image databases.`,
    th: `เมื่อสกัดจุดเด่นได้แล้ว FLANN จะช่วยจับคู่จุดเหล่านั้นระหว่างภาพได้อย่างรวดเร็ว ต่างจากการจับคู่แบบ Brute-Force ที่ตรวจสอบทุกความเป็นไปได้ โดย FLANN ใช้โครงสร้างข้อมูลพิเศษ (เช่น KD-Tree) เพื่อค้นหาคู่ที่ "ใกล้เคียงที่สุด"
    
เหมาะสำหรับงานที่มีชุดข้อมูลขนาดใหญ่หรือต้องการความเร็วสูง โดยแลกมาด้วยความแม่นยำที่ลดลงเพียงเล็กน้อยจากการประมาณค่า`
  },
  color: 'orange',
  nodes: [
    { 
      id: 'n1-img1', 
      type: 'image-input', 
      position: { x: 50, y: 10.8 }, 
      data: { 
        label: 'Input Image 1', 
        status: 'success', 
        description: "Image uploaded (512×288)",
        payload: { 
          name: '1.png', 
          url: IMG_1_URL, 
          width: 512, 
          height: 288 
        }
      } 
    } as Node,

    { 
      id: 'n3-sift-1', 
      type: 'sift', 
      position: { x: 450, y: 50 }, 
      data: { 
        label: 'SIFT (Img 1)', 
        status: 'idle', 
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
    } as Node,

    { 
      id: 'n2-img2', 
      type: 'image-input', 
      position: { x: 50, y: 560 }, 
      data: { 
        label: 'Input Image 2', 
        status: 'success', 
        description: "Image uploaded (310×240)",
        payload: { 
          name: '2.png', 
          url: IMG_2_URL, 
          width: 310, 
          height: 240 
        }
      } 
    } as Node,

    { 
      id: 'n4-sift-2', 
      type: 'sift', 
      position: { x: 450, y: 596.8 }, 
      data: { 
        label: 'SIFT (Img 2)', 
        status: 'idle', 
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
    } as Node,

    { 
      id: 'n5-flann', 
      type: 'flannmatcher', 
      position: { x: 850, y: 319.3 }, 
      data: { 
        label: 'FLANN Matcher', 
        status: 'idle', 
        description: "Ready to match...",
        payload: {
          params: { 
            lowe_ratio: 0.4, 
            ransac_thresh: 5.0, 
            draw_mode: "good", 
            index_params: "AUTO", 
            search_params: "AUTO" 
          }
        }
      } 
    } as Node,

    { 
      id: 'n6-save', 
      type: 'save-json', 
      position: { x: 1250, y: 472.3 }, 
      data: { 
        label: 'Save Matches', 
        status: 'idle',
      } 
    } as Node,
  ],

  edges: [
    { id: 'e1', source: 'n1-img1', target: 'n3-sift-1', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e2', source: 'n2-img2', target: 'n4-sift-2', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e3', source: 'n3-sift-1', target: 'n5-flann', targetHandle: 'file1', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e4', source: 'n4-sift-2', target: 'n5-flann', targetHandle: 'file2', type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e5', source: 'n5-flann', target: 'n6-save', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
  ],
};