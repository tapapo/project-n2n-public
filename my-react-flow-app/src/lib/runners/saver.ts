import type { Node, Edge } from 'reactflow';
import type { CustomNodeData } from '../../types';

// ⚙️ Config: Backend URL
const API_BASE_URL = 'http://localhost:8000';

export interface SaveResponse {
  path: string;
  url: string;
}

// --------------------------------------------------------
// ✅ Helper Functions
// --------------------------------------------------------

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

async function localUpdateStatus(
  nodeId: string,
  status: 'idle' | 'running' | 'start' | 'success' | 'fault', 
  setNodes: React.Dispatch<React.SetStateAction<Node<CustomNodeData>[]>>
) {
  setNodes((nds) =>
    nds.map((n) => {
      if (n.id === nodeId) {
        return { ...n, data: { ...n.data, status: status } };
      }
      return n;
    })
  );
  await new Promise((r) => setTimeout(r, 50));
}

// Helper: หาข้อมูลจาก Node แม่ (อัปเดตให้ฉลาดขึ้นเพื่อหา Visualization)
function findInputFromUpstream(
  nodeId: string,
  nodes: Node<CustomNodeData>[],
  edges: Edge[],
  type: 'image' | 'json'
): any {
  const incomingEdge = edges.find((e) => e.target === nodeId);
  if (!incomingEdge) return null;

  const parentNode = nodes.find((n) => n.id === incomingEdge.source);
  if (!parentNode || !parentNode.data) return null;

  const dataSrc = parentNode.data.output || parentNode.data.payload;
  if (!dataSrc) return null;

  if (type === 'image') {
    if (typeof dataSrc === 'string') return dataSrc;
    if (typeof dataSrc === 'object') {
      const inner = (dataSrc as any).json || dataSrc;
      
      // ✅✅✅ เพิ่มรายการ Key ที่เป็นรูปภาพ Visualization จาก Node ต่างๆ ✅✅✅
      return (inner as any).vis_url ||             // Feature Matching / Keypoints
             (inner as any).binary_url ||          // Otsu (ภาพขาวดำ)
             (inner as any).overlay_url ||         // Snake (ภาพซ้อนเส้น)
             (inner as any).mask_url ||            // Snake (ภาพ Mask)
             (inner as any).histogram_url ||       // Histogram Plot
             (inner as any).aligned_url ||         // Homography/Affine Result
             (inner as any).aligned_image ||       // (Legacy key)
             (inner as any).result_image_url ||    // General Result
             (inner as any).url ||                 // Image Input
             (inner as any).preview_url ||         // Image Input
             (inner as any).saved_path ||          // Saved output
             (inner as any).image_path || 
             null;
    }
  } else if (type === 'json') {
    if ((dataSrc as any).json) {
      return (dataSrc as any).json;
    }
    return dataSrc;
  }
  return null;
}

// --------------------------------------------------------
// ✅ Main Runners
// --------------------------------------------------------

// Runner: Save Image (Download)
export async function runSaveImage(
  node: Node<CustomNodeData>,
  setNodes: React.Dispatch<React.SetStateAction<Node<CustomNodeData>[]>>,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
) {
  await localUpdateStatus(node.id, 'running', setNodes);

  try {
    const imageUrlPath = findInputFromUpstream(node.id, nodes, edges, 'image');

    if (!imageUrlPath) {
      throw new Error("⚠️ No visual image found in the connected node.");
    }

    console.log(`[SaveImage] Target: ${imageUrlPath}`);

    let fetchUrl = imageUrlPath;
    if (fetchUrl.startsWith('/')) {
      fetchUrl = `${API_BASE_URL}${fetchUrl}`;
    }

    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`Failed to fetch image: ${response.statusText}`);

    const blob = await response.blob();
    
    // พยายามตั้งนามสกุลไฟล์ให้ถูก
    let ext = 'png';
    if (blob.type === 'image/jpeg') ext = 'jpg';
    else if (blob.type === 'image/png') ext = 'png';
    else if (imageUrlPath.endsWith('.jpg')) ext = 'jpg';
    
    const filename = `visual_${node.id}.${ext}`;

    triggerBrowserDownload(blob, filename);

    setNodes((nds) => nds.map((n) => n.id === node.id ? {
        ...n, data: { ...n.data, status: 'success', output: { saved_path: "Downloaded Visual" } }
    } : n));

  } catch (err: any) {
    console.error("❌ Save Image Error:", err.message);
    await localUpdateStatus(node.id, 'fault', setNodes);
  }
}

// Runner: Save JSON (Fetch Full & Download)
export async function runSaveJson(
  node: Node<CustomNodeData>,
  setNodes: React.Dispatch<React.SetStateAction<Node<CustomNodeData>[]>>,
  nodes: Node<CustomNodeData>[],
  edges: Edge[]
) {
  await localUpdateStatus(node.id, 'running', setNodes);

  try {
    const rawData = findInputFromUpstream(node.id, nodes, edges, 'json');

    if (!rawData) {
      throw new Error("⚠️ No JSON data found.");
    }

    let finalData = rawData;

    // Logic ดึงตัวเต็ม
    if (rawData.json_url) {
      console.log(`[SaveJSON] Fetching full details...`);
      try {
        let fetchUrl = rawData.json_url;
        if (fetchUrl.startsWith('/')) {
          fetchUrl = `${API_BASE_URL}${fetchUrl}`;
        }
        const res = await fetch(fetchUrl);
        if (res.ok) {
          finalData = await res.json();
        }
      } catch (err) {
        console.warn("[SaveJSON] Error fetching full JSON:", err);
      }
    }

    const jsonString = JSON.stringify(finalData, null, 2);
    const blob = new Blob([jsonString], { type: "application/json" });
    const filename = `data_${node.id}.json`;

    triggerBrowserDownload(blob, filename);

    setNodes((nds) => nds.map((n) => n.id === node.id ? {
        ...n, data: { ...n.data, status: 'success', output: { saved_path: "Downloaded Full JSON" } }
    } : n));

  } catch (err: any) {
    console.error("❌ Save JSON Error:", err.message);
    await localUpdateStatus(node.id, 'fault', setNodes);
  }
}