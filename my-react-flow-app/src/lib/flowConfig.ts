// src/lib/flowConfig.ts
import { MarkerType, type NodeTypes, type DefaultEdgeOptions } from 'reactflow';

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

// โหนดของเพื่อน
import CLAHENode from '../components/nodes/CLAHE';
import MSRCRNode from '../components/nodes/MSRCR';
import ZeroDCENode from '../components/nodes/ZERO';
import DnCNNNode from '../components/nodes/DCNN';
import RealESRGANNode from '../components/nodes/REAL';
import SwinIRNode from '../components/nodes/SWINIR';
import DeepLabNode from '../components/nodes/DEEP';
import MaskRCNNNode from '../components/nodes/MASK';
import UNetNode from '../components/nodes/UNET';

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

  // --- โหนดของเพื่อน (ลงทะเบียนดักไว้ทั้งชื่อสั้นและชื่อยาว) ---
  'clahe': CLAHENode,
  
  'msrcr': MSRCRNode,
  
  'zero': ZeroDCENode,
  'zeroDce': ZeroDCENode, // ✅ ดัก Error: zeroDce not found
  
  'dcnn': DnCNNNode,
  'dncnn': DnCNNNode,     // ✅ ดัก Error: dncnn not found
  
  'real': RealESRGANNode,
  'realesrgan': RealESRGANNode, // ✅ ดัก Error: realesrgan not found
  
  'swinir': SwinIRNode,
  
  'deep': DeepLabNode,
  'deeplab': DeepLabNode, // ✅ ดัก Error: deeplab not found
  
  'mask': MaskRCNNNode,
  'maskrcnn': MaskRCNNNode, // ✅ ดัก Error: maskrcnn not found
  
  'unet': UNetNode,
};

export const defaultEdgeOptions: DefaultEdgeOptions = {
  type: 'smoothstep',
  markerEnd: { type: MarkerType.ArrowClosed, color: '#64748b' },
  style: { strokeWidth: 2, stroke: '#64748b' },
};