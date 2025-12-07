// src/lib/flowConfig.ts
import { MarkerType, type NodeTypes, type DefaultEdgeOptions } from 'reactflow';

// Import Components ทั้งหมด
import ImageInputNode from '../components/nodes/ImageInputNode';
import SiftNode from '../components/nodes/SiftNode';
import SurfNode from '../components/nodes/SurfNode';
import OrbNode from '../components/nodes/OrbNode';
import BrisqueNode from '../components/nodes/BrisqueNode';
import PsnrNode from '../components/nodes/PsnrNode';
import SsimNode from '../components/nodes/SsimNode';
import BFMatcherNode from '../components/nodes/BFMatcherNode';
import FLANNMatcherNode from '../components/nodes/FLANNMatcherNode';
import HomographyAlignNode from '../components/nodes/HomographyAlignNode';
import AffineAlignNode from '../components/nodes/AffineAlignNode';
import OtsuNode from '../components/nodes/OtsuNode';
import SnakeNode from '../components/nodes/SnakeNode';
import SaveImageNode from '../components/nodes/SaveImageNode';
import SaveJsonNode from '../components/nodes/SaveJsonNode';

// ✅ ประกาศ nodeTypes เป็นค่าคงที่ (Static) ที่นี่
export const nodeTypes: NodeTypes = {
  'image-input': ImageInputNode,
  sift: SiftNode,
  surf: SurfNode,
  orb: OrbNode,
  brisque: BrisqueNode,
  psnr: PsnrNode,
  ssim: SsimNode,
  bfmatcher: BFMatcherNode,
  flannmatcher: FLANNMatcherNode,
  'homography-align': HomographyAlignNode,
  'affine-align': AffineAlignNode,
  otsu: OtsuNode,
  snake: SnakeNode,
  'save-image': SaveImageNode,
  'save-json': SaveJsonNode,
};

// ✅ ประกาศ Edge Options ที่นี่
export const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed },
  style: { strokeWidth: 2, stroke: '#64748b' },
};