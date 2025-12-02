// src/types.ts

// สถานะของ Node
export type NodeStatus = 'idle' | 'start' | 'running' | 'success' | 'fault';

// คำนิยาม Port (ถ้ามีใช้ในอนาคต)
export interface PortDef { 
  id: string; 
  label?: string 
}

// ข้อมูลหลักของ Node (Data)
export interface CustomNodeData {
  label: string;
  description?: string;
  status?: NodeStatus;
  
  // ฟังก์ชันสำหรับกดปุ่ม Run (ใส่ไว้เพื่อให้ TS รู้จัก)
  onRunNode?: (id: string) => void;

  inputs?: PortDef[];
  outputs?: PortDef[];
  
  // เก็บผลลัพธ์จาก Backend (เช่น json, urls, params)
  payload?: Record<string, any>; 

  // ยอมรับ key อื่นๆ เพิ่มเติม
  [key: string]: any; 
}

// ✅ ส่วนสำหรับระบบ Log Panel
export interface LogEntry {
  id: string;          // ID ของ Log
  timestamp: string;   // เวลาที่เกิด Log
  type: 'info' | 'success' | 'error' | 'warning'; // ประเภท
  message: string;     // ข้อความ
  nodeId?: string;     // ID ของ Node ที่เกี่ยวข้อง
}