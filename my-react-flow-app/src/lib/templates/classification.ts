// src/lib/templates/classification.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

const MOON_URL = '/static/samples/Moonsample.jpg';

const INPUT_NODE: Node = {
  id: 'n1-moon',
  type: 'image-input',
  position: { x: 250, y: 75.5 },
  data: {
    label: 'Image Input (Moon)',
    status: 'success', 
    description: "Moon Image Loaded",
    payload: {
      name: 'Moonsample.jpg',
      url: MOON_URL,
      width: 600,
      height: 570
    }
  }
};

export const OTSU_CLASSIFICATION_TEMPLATE: WorkflowTemplate = {
  name: 'Otsu Thresholding',
  descriptor: {
    en: 'Automatically calculates the optimal threshold value to separate foreground from background.',
    th: 'การแยกวัตถุออกจากพื้นหลังแบบอัตโนมัติ โดยหาค่าความเข้มแสงที่เหมาะสมที่สุด',
  },
  description: 'IMAGE + OTSU',
  longDescription: {
    en: `Otsu's method is a global thresholding technique used for binarization. It analyzes the image histogram to find a threshold value that minimizes the intra-class variance between black and white pixels.
    
It is the most standard way to segment objects without manually guessing the threshold value.`,
    th: `Otsu เป็นเทคนิคพื้นฐานในการทำภาพขาว-ดำ (Binarization) โดยไม่ต้องกำหนดค่าเอง อัลกอริทึมจะวิเคราะห์ฮิสโตแกรมของภาพ และคำนวณหาจุดตัดที่ทำให้ความแปรปรวนของพิกเซลสีดำและขาวน้อยที่สุด
    
วิธีนี้เป็นมาตรฐานในการแยกวัตถุออกจากพื้นหลังที่มีความต่างของแสงชัดเจน`
  },
  color: 'pink',
  nodes: [
    INPUT_NODE, 
    {
      id: 'n2-otsu',
      type: 'otsu',
      position: { x: 680, y: 100 },
      data: {
        label: 'Otsu Threshold',
        status: 'idle',
        description: "Ready to calculate...",
        payload: {
          params: { 
            gaussian_blur: true, 
            blur_ksize: 5, 
            invert: false, 
            morph_open: false, 
            morph_close: false, 
            morph_kernel: 3, 
            show_histogram: true 
          }
        }
      }
    } as Node,
    {
      id: 'n3-save-otsu',
      type: 'save-image',
      position: { x: 1100, y: 200 }, 
      data: { label: 'Save Binary Mask', status: 'idle' }
    } as Node,
    {
      id: 'n4-save-otsu-json',
      type: 'save-json',
      position: { x: 1100, y: 370 }, 
      data: { label: 'Save Threshold Info', status: 'idle' }
    } as Node
  ],
  edges: [
    { id: 'e1', source: 'n1-moon', target: 'n2-otsu', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 }},
    { id: 'e2', source: 'n2-otsu', target: 'n3-save-otsu', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 }},
    { id: 'e3', source: 'n2-otsu', target: 'n4-save-otsu-json', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 }},
  ]
};

export const SNAKE_CLASSIFICATION_TEMPLATE: WorkflowTemplate = {
  name: 'Active Contour (Snake)',
  descriptor: {
    en: 'An iterative algorithm that fits a contour to object boundaries using energy minimization.',
    th: 'การหาขอบเขตวัตถุโดยใช้เส้นโค้งที่ค่อยๆ บีบรัดเข้าหาวัตถุด้วยการลดค่าพลังงาน',
  },
  description: 'IMAGE + SNAKE',
  longDescription: {
    en: `A "Snake" is a synthesized curve that moves and adapts within an image to lock onto object edges. It works by minimizing "energy"—balancing internal forces (smoothness) and external forces (image edges).
    
This is useful for segmenting objects with irregular shapes where simple thresholding might fail.`,
    th: `Snake คือเส้นโค้งสังเคราะห์ที่จะค่อยๆ เคลื่อนตัวรัดเข้าหาขอบของวัตถุโดยอัตโนมัติ หลักการคือการลดค่า "พลังงาน" โดยอาศัยแรงภายใน (รักษาความโค้งมน) และแรงภายนอก (ดึงเข้าหาขอบภาพ)
    
เหมาะสำหรับการหาขอบเขตของวัตถุที่มีรูปร่างซับซ้อน ซึ่งการทำ Threshold ธรรมดาอาจทำไม่ได้`
  },
  color: 'pink',
  nodes: [
    INPUT_NODE,
    {
      id: 'n2-snake',
      type: 'snake',
      position: { x: 680, y: 99 },
      data: {
        label: 'Snake Contour',
        status: 'idle',
        description: "Ready to iterate...",
        payload: {
          params: { 
            alpha: 0.015, 
            beta: 10, 
            gamma: 0.1, 
            w_line: 0, 
            w_edge: 1, 
            max_iterations: 250, 
            gaussian_blur_ksize: 0, 
            convergence: 0.001, 
            init_mode: 'circle', 
            init_radius: "250", 
            init_points: 400 
          }
        }
      }
    } as Node,
    {
      id: 'n3-save-snake',
      type: 'save-image',
      position: { x: 1100, y: 200 },
      data: { label: 'Save Snake Overlay', status: 'idle' }
    } as Node,
    {
      id: 'n4-save-snake-json',
      type: 'save-json',
      position: { x: 1100, y: 370 },
      data: { label: 'Save Contour Points', status: 'idle' }
    } as Node
  ],
  edges: [
    { id: 'e1', source: 'n1-moon', target: 'n2-snake', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 }},
    { id: 'e2', source: 'n2-snake', target: 'n3-save-snake', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 }},
    { id: 'e3', source: 'n2-snake', target: 'n4-save-snake-json', type: 'smoothstep', style: { stroke: "#64748b", strokeWidth: 2 }},
  ]
};