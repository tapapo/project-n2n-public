// สถานะของ Node
export type NodeStatus = 'idle' | 'start' | 'running' | 'success' | 'fault';

// คำนิยาม Port (ถ้ามีใช้ในอนาคต)
export interface PortDef { 
  id: string; 
  label?: string 
}

// ข้อมูลหลักของ Node (Data)
export interface CustomNodeData {
  [x: string]: any; // ยอมรับ key อื่นๆ เพิ่มเติม (เช่น onRunNode)
  label: string;
  description?: string;
  status?: NodeStatus;
  inputs?: PortDef[];
  outputs?: PortDef[];
  payload?: Record<string, any>; // เก็บผลลัพธ์จาก Backend (เช่น json, urls)
}

// ✅ เพิ่มส่วนนี้สำหรับระบบ Log Panel
export interface LogEntry {
  id: string;          // ID ของ Log (ใช้เป็น key ใน list)
  timestamp: string;   // เวลาที่เกิด Log
  type: 'info' | 'success' | 'error' | 'warning'; // ประเภทของ Log (เพื่อเปลี่ยนสี)
  message: string;     // ข้อความที่จะแสดง
  nodeId?: string;     // (Optional) ID ของ Node ที่เกี่ยวข้อง เผื่อคลิกแล้ววิ่งไปหา
}