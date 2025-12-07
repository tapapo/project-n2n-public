//src/lib/runners/saver.ts
import type { Node, Edge } from 'reactflow';
import type { CustomNodeData } from '../../types';
import { abs } from '../api'; 
import { updateNodeStatus, findInputImage } from './utils';

// Helper: ดาวน์โหลดไฟล์ผ่าน Browser
function triggerBrowserDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper: หา Node ต้นทาง (เพื่อเอาชื่อมาตั้งชื่อไฟล์)
function getSourceNode(nodeId: string, nodes: Node<CustomNodeData>[], edges: Edge[]) {
  const edge = edges.find((e) => e.target === nodeId);
  if (!edge) return null;
  return nodes.find((n) => n.id === edge.source);
}

// Helper: สร้างชื่อไฟล์จากชื่อโหนด + เวลา
function generateFilename(node: Node<CustomNodeData>, extension: string): string {
  const now = new Date();
  
  // จัดรูปแบบเวลา: YYYYMMDD_HHmmss
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const minute = String(now.getMinutes()).padStart(2, '0');
  const second = String(now.getSeconds()).padStart(2, '0');
  const timestamp = `${year}${month}${day}_${hour}${minute}${second}`;

  // ดึงชื่อโหนด (Label) ถ้าไม่มีให้ใช้ Type
  const rawLabel = node.data.label || node.type || "output";
  // ลบอักขระพิเศษและเว้นวรรค
  const cleanLabel = rawLabel.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');

  return `${cleanLabel}_${timestamp}.${extension}`;
}

// Helper: หา JSON จากโหนดต้นทาง (Strict Version)
function findInputJson(
  nodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
): any {
  const incomingEdge = edges.find((e) => e.target === nodeId);
  if (!incomingEdge) return null;

  const parentNode = nodes.find((n) => n.id === incomingEdge.source);
  if (!parentNode || !parentNode.data) return null;

  const payload = parentNode.data.payload;
  if (!payload) return null;

  // ต้องมีคีย์ 'json' เท่านั้น
  if ((payload as any).json) {
    return (payload as any).json;
  }

  return null;
}

// ============================================================
// 1. RUN SAVE IMAGE
// ============================================================
export async function runSaveImage(
  node: Node<CustomNodeData>,
  setNodes: React.Dispatch<React.SetStateAction<Node<CustomNodeData>[]>>,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
) {
  const nodeId = node.id;
  await updateNodeStatus(nodeId, 'running', setNodes);

  try {
    const imageUrlPath = findInputImage(nodeId, nodes, edges);

    if (!imageUrlPath) {
      throw new Error("No image found to download (Please check input connection).");
    }

    const fetchUrl = abs(imageUrlPath);
    if (!fetchUrl) throw new Error(`Invalid Image URL generated from: ${imageUrlPath}`);

    console.log(`[SaveImage] Downloading from: ${fetchUrl}`);

    const response = await fetch(fetchUrl, {
      method: 'GET',
      mode: 'cors', 
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
    }

    const blob = await response.blob();
    
    let ext = 'png';
    if (blob.type === 'image/jpeg') ext = 'jpg';
    else if (blob.type === 'image/png') ext = 'png';
    else if (typeof imageUrlPath === 'string' && imageUrlPath.toLowerCase().endsWith('.jpg')) ext = 'jpg';

    // ✅ หาโหนดต้นทางเพื่อเอามาตั้งชื่อ
    const sourceNode = getSourceNode(nodeId, nodes, edges);
    // ถ้ามีโหนดต้นทางใช้ชื่อโหนดต้นทาง ถ้าไม่มีใช้ชื่อโหนด Save เอง
    const targetNamingNode = sourceNode || node;
    const filename = generateFilename(targetNamingNode, ext);

    triggerBrowserDownload(blob, filename);

    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                status: 'success',
                output: { saved_path: "Downloaded" },
              },
            }
          : n
      )
    );
  } catch (err: any) {
    console.error("❌ Save Image Error:", err);
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw new Error(err.message || "Failed to download image"); 
  }
}

// ============================================================
// 2. RUN SAVE JSON
// ============================================================
export async function runSaveJson(
  node: Node<CustomNodeData>,
  setNodes: React.Dispatch<React.SetStateAction<Node<CustomNodeData>[]>>,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
) {
  const nodeId = node.id;
  await updateNodeStatus(nodeId, 'running', setNodes);

  try {
    const rawData = findInputJson(nodeId, nodes, edges);

    if (!rawData) {
      throw new Error("Input node does not have JSON result data (Image cannot be saved as JSON).");
    }

    let finalData = rawData;

    if (rawData.json_url) {
      try {
        const fetchUrl = abs(rawData.json_url);
        if (fetchUrl) {
          const res = await fetch(fetchUrl);
          if (res.ok) {
            finalData = await res.json();
          }
        }
      } catch (err) {
        console.warn("[SaveJSON] Failed to fetch full JSON, saving payload instead:", err);
      }
    }

    const jsonString = JSON.stringify(finalData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    
    // ✅ หาโหนดต้นทางเพื่อเอามาตั้งชื่อ
    const sourceNode = getSourceNode(nodeId, nodes, edges);
    const targetNamingNode = sourceNode || node;
    const filename = generateFilename(targetNamingNode, 'json');

    triggerBrowserDownload(blob, filename);

    setNodes((nds) =>
      nds.map((n) =>
        n.id === nodeId
          ? {
              ...n,
              data: {
                ...n.data,
                status: 'success',
                output: { saved_path: "Downloaded Full JSON" },
              },
            }
          : n
      )
    );
  } catch (err: any) {
    console.error("❌ Save JSON Error:", err.message);
    await updateNodeStatus(nodeId, 'fault', setNodes);
    throw err;
  }
}