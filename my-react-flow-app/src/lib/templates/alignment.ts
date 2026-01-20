// File: src/lib/templates/alignment.ts
import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

// Input Images
const IMG_1_URL = '/static/samples/1.png';
const IMG_2_URL = '/static/samples/2.png';

// Feature Results (SIFT)
const SIFT_1_JSON = '/static/samples/json/feature/sift_1.json';
const SIFT_1_VIS  = '/static/samples/json/feature/sift_1_vis.jpg';

const SIFT_2_JSON = '/static/samples/json/feature/sift_2.json';
const SIFT_2_VIS  = '/static/samples/json/feature/sift_2_vis.jpg';

// Matching Result (FLANN)
const FLANN_JSON = '/static/samples/json/matching/flann_sift.json';
const FLANN_VIS  = '/static/samples/json/matching/flann_sift_vis.jpg';

// Alignment Result (Homography)
const HOMO_JSON = '/static/samples/json/alignment/homo_sift.json';
const HOMO_IMG  = '/static/samples/json/alignment/homo_sift.jpg';

export const OBJECT_ALIGNMENT_HOMOGRAPHY: WorkflowTemplate = {
  name: 'Homography Estimation',
  descriptor: {
    en: 'Calculates a transformation matrix to map points from one perspective to another.',
    th: 'การคำนวณเมทริกซ์เพื่อแปลงมุมมองภาพ (Perspective) ให้ทับซ้อนกันได้อย่างถูกต้อง',
  },
  description: 'IMAGE + SIFT + FLANN + HOMOGRAPHY',

  longDescription: {
    en: `Homography computes a 3x3 matrix that relates two images of the same planar surface in space. It is used to "warp" the source image to align perfectly with the target image, correcting perspective distortions.
    
    This is essential for image stitching (panoramas) and perspective correction, offering more capabilities than standard Affine transformations.`,
    th: `Homography คือการหาความสัมพันธ์ทางเรขาคณิตระหว่างภาพสองภาพ ผลลัพธ์คือเมทริกซ์ขนาด 3x3 ที่ใช้ "บิด" (Warp) ภาพต้นฉบับให้เปลี่ยนมุมมองไปตรงกับภาพเป้าหมายได้
    
    เทคนิคนี้จำเป็นมากในการต่อภาพพาโนรามา หรือการแก้ภาพเบี้ยว (Perspective Correction) ซึ่งทำงานได้ครอบคลุมกว่าการแปลงแบบ Affine`
  },

  color: 'purple',

  nodes: [
    {
      id: "n1-ref",
      type: "image-input",
      position: { x: 50, y: 10.8 },
      data: {
        label: "Image Input (Reference)",
        status: "success",
        description: "Reference Image Loaded",
        payload: { name: "1.png", url: IMG_1_URL, result_image_url: IMG_1_URL, width: 512, height: 288 }
      }
    } as Node,

    {
      id: "n3-sift-ref",
      type: "sift",
      position: { x: 450, y: 50 },
      data: {
        label: "SIFT Feature (Ref)",
        status: "success",
        description: "Found 500 keypoints",
        payload: {
          params: { nfeatures: 500, nOctaveLayers: 3, contrastThreshold: 0.04, edgeThreshold: 12, sigma: 1.6 },
          num_keypoints: 500,
          
          // ✅ เพิ่มขนาดรูป
          image_shape: [288, 512],

          vis_url: SIFT_1_VIS,
          result_image_url: SIFT_1_VIS,
          json_path: SIFT_1_JSON,
          json_url: SIFT_1_JSON,
          json: { num_keypoints: 500, vis_url: SIFT_1_VIS, json_url: SIFT_1_JSON, image: { processed_shape: [288, 512] } }
        }
      }
    },

    {
      id: "n2-target",
      type: "image-input",
      position: { x: 50, y: 560 },
      data: {
        label: "Image Input (Target)",
        status: "success",
        description: "Target Image Loaded",
        payload: { name: "2.png", url: IMG_2_URL, result_image_url: IMG_2_URL, width: 310, height: 240 }
      }
    },

    {
      id: "n4-sift-target",
      type: "sift",
      position: { x: 450, y: 596.8 },
      data: {
        label: "SIFT Feature (Target)",
        status: "success",
        description: "Found 89 keypoints",
        payload: {
          params: { nfeatures: 0, nOctaveLayers: 3, contrastThreshold: 0.04, edgeThreshold: 10, sigma: 1.6 },
          num_keypoints: 89,
          
          // ✅ เพิ่มขนาดรูป
          image_shape: [240, 310],

          vis_url: SIFT_2_VIS,
          result_image_url: SIFT_2_VIS,
          json_path: SIFT_2_JSON,
          json_url: SIFT_2_JSON,
          json: { num_keypoints: 89, vis_url: SIFT_2_VIS, json_url: SIFT_2_JSON, image: { processed_shape: [240, 310] } }
        }
      }
    },

    {
      id: "n5-flann",
      type: "flannmatcher",
      position: { x: 850, y: 320 },
      data: {
        label: "FLANN Matcher",
        status: "success",
        description: "28 inliers / 30 good matches",
        payload: {
          params: { lowe_ratio: 0.4, ransac_thresh: 5, draw_mode: "good", index_params: "AUTO", search_params: "AUTO" },
          result_image_url: FLANN_VIS,
          vis_url: FLANN_VIS,
          json_path: FLANN_JSON,
          json_url: FLANN_JSON,
          json: {
            matching_statistics: { num_inliers: 28, num_good_matches: 30, summary: "28 inliers / 30 good matches" },
            vis_url: FLANN_VIS,
            json_url: FLANN_JSON,
            input_features_details: { image1: { num_keypoints: 500, image_shape: [288, 512] }, image2: { num_keypoints: 89, image_shape: [240, 310] } },
            inputs: { image1: { width: 512, height: 288 }, image2: { width: 310, height: 240 } }
          }
        }
      }
    },

    {
      id: "n6-homo",
      type: "homography-align",
      position: { x: 1250, y: 327 },
      data: {
        label: "Homography Warp",
        status: "success",
        description: "Homography aligned (28 inliers)",
        payload: {
          params: { warp_mode: "image2_to_image1", blend: true },
          
          // ✅✅✅ ใส่ aligned_shape เพื่อให้ Homography Node แสดง Output Size
          aligned_shape: [288, 512], // เท่ากับ Ref

          aligned_url: HOMO_IMG,
          result_image_url: HOMO_IMG,
          json_path: HOMO_JSON,
          json_url: HOMO_JSON,
          json: { num_inliers: 28, output: { aligned_url: HOMO_IMG, aligned_image: HOMO_IMG, aligned_shape: [288, 512] } }
        }
      }
    },

    {
      id: "n7-save-img",
      type: "save-image",
      position: { x: 1650, y: 390 },
      data: { label: "Save Result", status: "idle" }
    },
    {
      id: "n8-save-json",
      type: "save-json",
      position: { x: 1650, y: 550 },
      data: { label: "Save JSON", status: "idle" }
    }
  ],

  edges: [
    { id: "e1", source: "n1-ref", target: "n3-sift-ref", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e2", source: "n2-target", target: "n4-sift-target", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e3", source: "n3-sift-ref", target: "n5-flann", targetHandle: "file1", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e4", source: "n4-sift-target", target: "n5-flann", targetHandle: "file2", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e5", source: "n5-flann", target: "n6-homo", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e6", source: "n6-homo", target: "n7-save-img", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: "e7", source: "n6-homo", target: "n8-save-json", type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } }
  ],
};