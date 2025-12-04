import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

// =============================================================================
// 1. CONSTANTS: File Paths (ใช้ชื่อไฟล์ที่สั้นลงแล้วตามที่เราคุยกัน)
// =============================================================================

// Input Image
const MOON_URL = '/static/samples/Moon.jpg';

// Otsu Results (จาก JSON ที่คุณส่งมา: Hash 0b1a..._771a...)
const OTSU_JSON = '/static/samples/json/classification/otsu_moon.json';
const OTSU_BIN  = '/static/samples/json/classification/otsu_moon_bin.png'; // Binary image is the result

// Snake Results (จาก JSON ที่คุณส่งมา: Hash 0b1a..._db35...)
const SNAKE_JSON = '/static/samples/json/classification/snake_moon.json';
const SNAKE_VIS  = '/static/samples/json/classification/snake_moon_vis.png'; // Overlay
const SNAKE_MASK = '/static/samples/json/classification/snake_moon_mask.png'; // Mask


// =============================================================================
// 2. TEMPLATE DEFINITION
// =============================================================================

export const MOON_CLASSIFICATION: WorkflowTemplate = {
  name: 'Image Classification (Otsu & Snake)',
  description: 'Compare two approaches to isolate an object: Global Thresholding (Otsu) vs. Active Contours (Snake).',
  color: 'pink',
  nodes: [
    // ------------------------------------------------------
    // 1. INPUT (ตำแหน่งที่คุณจัดมา x: 50, y: 300)
    // ------------------------------------------------------
    { 
      id: 'n1-moon', 
      type: 'image-input', 
      position: { x: 50, y: 300 }, 
      data: { 
        label: 'Image Input (Moon)', 
        status: 'success', 
        description: "Moon Image Loaded",
        payload: { 
            name: 'Moon.jpg', 
            url: MOON_URL, 
            result_image_url: MOON_URL, 
            width: 800, // ใช้ขนาดจริง
            height: 600 
        } 
      } 
    } as Node,
    
    // ------------------------------------------------------
    // 2. OTSU THRESHOLD (ตำแหน่งที่คุณจัดมา x: 680, y: -115)
    // ------------------------------------------------------
    { 
      id: 'n2-otsu', 
      type: 'otsu', 
      position: { x: 680, y: -115 }, 
      data: { 
        label: 'Otsu Threshold', 
        status: 'success', // 🟢 Pre-computed
        description: "Threshold = 49", // ✅ ข้อมูลตาม JSON
        payload: { 
            // Params ที่คุณใช้ตอนรัน
            params: { gaussian_blur: true, blur_ksize: 5, invert: false, morph_open: false, morph_close: false, morph_kernel: 3, show_histogram: true },
            
            // ✅ ผลลัพธ์ที่ดึงมาจาก JSON
            result_image_url: OTSU_BIN,
            preview_url: OTSU_BIN,
            json_url: OTSU_JSON,
            json_path: OTSU_JSON,

            json: {
                threshold_value: 49,
                binary_url: OTSU_BIN
            }
        } 
      } 
    } as Node,

    // ------------------------------------------------------
    // 3. SNAKE CONTOUR (ตำแหน่งที่คุณจัดมา x: 684, y: 640)
    // ------------------------------------------------------
    { 
      id: 'n3-snake', 
      type: 'snake', 
      position: { x: 684, y: 640 }, 
      data: { 
        label: 'Snake Contour', 
        status: 'success', // 🟢 Pre-computed
        description: "Done (250 iters)", 
        payload: { 
            // Params ที่คุณใช้ตอนรัน
            params: { alpha: 0.015, beta: 10, gamma: 0.1, w_line: 0, w_edge: 1, max_iterations: 250, gaussian_blur_ksize: 0, convergence: 0.001, init_mode: 'circle', init_radius: "250", init_points: 400, real_width: 600, real_height: 570 },
            
            // ✅ ผลลัพธ์ที่ดึงมาจาก JSON
            result_image_url: SNAKE_VIS, 
            preview_url: SNAKE_VIS,
            overlay_url: SNAKE_VIS,       
            mask_url: SNAKE_MASK,
            
            json_url: SNAKE_JSON,
            json_path: SNAKE_JSON,
            
            json: {
                iterations: 250,
                output: {
                    overlay_url: SNAKE_VIS,
                    mask_url: SNAKE_MASK
                }
            }
        } 
      } 
    } as Node,
    
    // ------------------------------------------------------
    // 4. SAVERS (ปรับตำแหน่งตาม Node หลัก)
    // ------------------------------------------------------
    { 
      id: 'n4-save-otsu', 
      type: 'save-image', 
      position: { x: 1100, y: -115 }, 
      data: { label: 'Save Otsu Mask', status: 'idle' } 
    } as Node,

    { 
      id: 'n5-save-snake', 
      type: 'save-image', 
      position: { x: 1100, y: 640 }, 
      data: { label: 'Save Snake Overlay', status: 'idle' } 
    } as Node,
  ],
  
  // ------------------------------------------------------
  // EDGES (เชื่อมต่อตาม ID และ Logic เดิม)
  // ------------------------------------------------------
  edges: [
    { id: 'e1', source: 'n1-moon', target: 'n2-otsu', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e2', source: 'n1-moon', target: 'n3-snake', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e3', source: 'n2-otsu', target: 'n4-save-otsu', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e4', source: 'n3-snake', target: 'n5-save-snake', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
  ],
};