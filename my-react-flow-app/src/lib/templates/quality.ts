import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

// =============================================================================
// 1. CONSTANTS: File Paths
// =============================================================================

// Input Images
const ORI_URL = '/static/samples/ori.png';
const NOISE_URL = '/static/samples/noise.jpg';
const MOON_URL = '/static/samples/Moon.jpg';

// Pre-computed Results
const PSNR_JSON = '/static/samples/json/quality/psnr_score.json';
const BRISQUE_JSON = '/static/samples/json/quality/brisque_score.json';


// =============================================================================
// TEMPLATE: QUALITY ASSESSMENT (รวม PSNR และ BRISQUE)
// =============================================================================
export const QUALITY_ASSESSMENT: WorkflowTemplate = {
  name: 'Quality Assessment (PSNR + BRISQUE)', 
  description: 'Measures image quality using PSNR (Full-Reference) and BRISQUE (No-Reference) metrics simultaneously.',
  color: 'blue',
  nodes: [
    // ------------------------------------------------------
    // 1. INPUTS (Full Reference - PSNR Group)
    // ------------------------------------------------------
    { 
      id: 'n1-ori', 
      type: 'image-input', 
      position: { x: 50, y: 50 }, // แถวบนสุด
      data: { label: 'Original (Ref)', status: 'success', payload: { name: 'ori.png', url: ORI_URL, result_image_url: ORI_URL, width: 172, height: 172 } } 
    } as Node,
    { 
      id: 'n2-noise', 
      type: 'image-input', 
      position: { x: 50, y: 500 }, // ห่าง 400px (สำหรับ Target/Noise)
      data: { label: 'Processed (Test)', status: 'success', payload: { name: 'noise.jpg', url: NOISE_URL, result_image_url: NOISE_URL, width: 172, height: 172 } } 
    } as Node,
    
    // ------------------------------------------------------
    // 2. METRIC (PSNR - Full Reference)
    // ------------------------------------------------------
    { 
      id: 'n3-psnr', 
      type: 'psnr', 
      position: { x: 400, y: 350 }, 
      data: { 
        label: 'PSNR Metric', 
        status: 'success', 
        description: "PSNR = 16.72 dB",
        payload: { quality_score: 16.72, json_url: PSNR_JSON, json_path: PSNR_JSON, json: { quality_score: 16.72 } }
      } 
    } as Node,
    
    // ------------------------------------------------------
    // 3. INPUT (No Reference - BRISQUE Group)
    // ------------------------------------------------------
    { 
      id: 'n8-moon', 
      type: 'image-input', 
      position: { x: 50, y: 950 }, // ⚠️ เพิ่มระยะห่าง: ห่างจาก n2-noise ไปอีก 500px (450 -> 950)
      data: { label: 'Moon (BRISQUE Input)', status: 'success', payload: { name: 'Moon.jpg', url: MOON_URL, result_image_url: MOON_URL, width: 600, height: 570 } } 
    } as Node,
    
    // ------------------------------------------------------
    // 4. METRIC (BRISQUE - No Reference)
    // ------------------------------------------------------
    { 
      id: 'n9-brisque', 
      type: 'brisque', 
      position: { x: 400, y: 950 }, // จัดให้อยู่แนวเดียวกับ n8-moon
      data: { 
        label: 'BRISQUE Metric', 
        status: 'success', 
        description: "BRISQUE = 33.60",
        payload: { quality_score: 33.60, json_url: BRISQUE_JSON, json_path: BRISQUE_JSON, json: { score: 33.60 } }
      } 
    } as Node,

    // ------------------------------------------------------
    // 5. SAVERS
    // ------------------------------------------------------
    { id: 'n5-save-p', type: 'save-json', position: { x: 750, y: 300 }, data: { label: 'Save PSNR', status: 'idle' } } as Node,
    { id: 'n10-save-b', type: 'save-json', position: { x: 750, y: 950 }, data: { label: 'Save BRISQUE', status: 'idle' } } as Node,
  ],
  edges: [
    // PSNR Dual Input (Full Reference)
    { id: 'e1', source: 'n1-ori', target: 'n3-psnr', targetHandle: 'input1', type: 'smoothstep' },
    { id: 'e2', source: 'n2-noise', target: 'n3-psnr', targetHandle: 'input2', type: 'smoothstep' },
    
    // BRISQUE Single Input (No Reference)
    { id: 'e3', source: 'n8-moon', target: 'n9-brisque', type: 'smoothstep' },
    
    // Savers
    { id: 'e4', source: 'n3-psnr', target: 'n5-save-p', type: 'smoothstep' },
    { id: 'e5', source: 'n9-brisque', target: 'n10-save-b', type: 'smoothstep' },
  ],
};

// Export Template หลัก
export const DENOISE_ASSESSMENT = QUALITY_ASSESSMENT; 

// ลบ Template ที่ไม่ต้องการแล้ว
export const BRISQUE_MOON_CHECK = QUALITY_ASSESSMENT;