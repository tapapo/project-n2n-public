// src/types.ts
export type NodeStatus = 'idle' | 'start' | 'running' | 'success' | 'fault';

export interface PortDef { id: string; label?: string }

export interface CustomNodeData {
  [x: string]: any;
  label: string;
  description?: string;
  status?: NodeStatus;
  inputs?: PortDef[];
  outputs?: PortDef[];
  payload?: Record<string, any>;
}
