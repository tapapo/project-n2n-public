import type { WorkflowTemplate } from '../workflowTemplates';
import type { Node } from 'reactflow';

// =============================================================================
// 1. CONSTANTS: File Paths
// =============================================================================

// Input Images
const IMG_1_URL = '/static/samples/1.png';
const IMG_2_URL = '/static/samples/2.png';

// Feature Results (SIFT)
const SIFT_1_JSON = '/static/samples/json/feature/sift_1.json';
const SIFT_1_VIS  = '/static/samples/json/feature/sift_1_vis.jpg';

const SIFT_2_JSON = '/static/samples/json/feature/sift_2.json';
const SIFT_2_VIS  = '/static/samples/json/feature/sift_2_vis.jpg';

// Matching Results (เปลี่ยนเป็น FLANN)
const FLANN_JSON = '/static/samples/json/matching/flann_sift.json';
const FLANN_VIS  = '/static/samples/json/matching/flann_sift_vis.jpg';

export const FEATURE_MATCHING_PIPELINE: WorkflowTemplate = {
  name: 'Feature Matching (SIFT + FLANN)',
  description: 'Learn how to match SIFT features between two images using FLANN Matcher (Fast Library for Approximate Nearest Neighbors).',
  color: 'orange',
  nodes: [
    // ------------------------------------------------------
    // ROW 1: Image 1 Pipeline
    // ------------------------------------------------------
    { 
      id: 'n1-img1', 
      type: 'image-input', 
      position: { x: 50, y: 50 }, 
      data: { 
        label: 'Input Image 1', 
        status: 'success', 
        description: "Image uploaded (512×288)",
        payload: { 
            name: '1.png', 
            url: IMG_1_URL, 
            result_image_url: IMG_1_URL, 
            width: 512, height: 288 
        } 
      } 
    } as Node,

    { 
      id: 'n3-sift-1', 
      type: 'sift', 
      position: { x: 450, y: 50 }, 
      data: { 
        label: 'SIFT (Img 1)', 
        status: 'success', 
        description: "Found 500 keypoints",
        payload: {
            params: { nfeatures: 500, nOctaveLayers: 3, contrastThreshold: 0.04, edgeThreshold: 12, sigma: 1.6 },
            // Result Data
            num_keypoints: 500,
            vis_url: SIFT_1_VIS,
            result_image_url: SIFT_1_VIS,
            json_url: SIFT_1_JSON,
            json_path: SIFT_1_JSON,
            json: { num_keypoints: 500, vis_url: SIFT_1_VIS, json_url: SIFT_1_JSON, image: { processed_shape: [288, 512] } }
        }
      } 
    } as Node,

    // ------------------------------------------------------
    // ROW 2: Image 2 Pipeline (Y: 550)
    // ------------------------------------------------------
    { 
      id: 'n2-img2', 
      type: 'image-input', 
      position: { x: 50, y: 550 }, 
      data: { 
        label: 'Input Image 2', 
        status: 'success', 
        description: "Image uploaded (310×240)",
        payload: { 
            name: '2.png', 
            url: IMG_2_URL, 
            result_image_url: IMG_2_URL, 
            width: 310, height: 240 
        } 
      } 
    } as Node,

    { 
      id: 'n4-sift-2', 
      type: 'sift', 
      position: { x: 450, y: 550 }, 
      data: { 
        label: 'SIFT (Img 2)', 
        status: 'success', 
        description: "Found 89 keypoints",
        payload: {
            params: { nfeatures: 0, nOctaveLayers: 3, contrastThreshold: 0.04, edgeThreshold: 10, sigma: 1.6 },
            // Result Data
            num_keypoints: 89,
            vis_url: SIFT_2_VIS,
            result_image_url: SIFT_2_VIS,
            json_url: SIFT_2_JSON,
            json_path: SIFT_2_JSON,
            json: { num_keypoints: 89, vis_url: SIFT_2_VIS, json_url: SIFT_2_JSON, image: { processed_shape: [240, 310] } }
        }
      } 
    } as Node,
    
    // ------------------------------------------------------
    // ROW 3: Matcher (Center) - เปลี่ยนเป็น FLANN
    // ------------------------------------------------------
    { 
      id: 'n5-flann', 
      type: 'flannmatcher', // ✅ เปลี่ยน type
      position: { x: 850, y: 300 }, 
      data: { 
        label: 'FLANN Matcher', 
        status: 'success', 
        description: "28 inliers / 30 good matches",
        payload: {
            params: { lowe_ratio: 0.4, ransac_thresh: 5.0, draw_mode: "good", index_params: "AUTO", search_params: "AUTO" },
            
            vis_url: FLANN_VIS,
            json_url: FLANN_JSON,
            json_path: FLANN_JSON,

            json: {
                matching_statistics: { num_inliers: 28, num_good_matches: 30, summary: "28 inliers / 30 good matches" },
                vis_url: FLANN_VIS,
                json_url: FLANN_JSON,
                // Mock Info สำหรับ UI
                input_features_details: {
                    image1: { num_keypoints: 500, image_shape: [288, 512] },
                    image2: { num_keypoints: 89, image_shape: [240, 310] }
                },
                inputs: {
                    image1: { width: 512, height: 288 },
                    image2: { width: 310, height: 240 }
                }
            }
        }
      } 
    } as Node,
    
    // ------------------------------------------------------
    // Output
    // ------------------------------------------------------
    { 
      id: 'n6-save', 
      type: 'save-json', 
      position: { x: 1250, y: 300 }, 
      data: { label: 'Save Matches', status: 'idle' } 
    } as Node,
  ],
  edges: [
    { id: 'e1', source: 'n1-img1', target: 'n3-sift-1', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e2', source: 'n2-img2', target: 'n4-sift-2', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e3', source: 'n3-sift-1', target: 'n5-flann', targetHandle: 'file1', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e4', source: 'n4-sift-2', target: 'n5-flann', targetHandle: 'file2', type: "smoothstep", style: { strokeWidth: 2, stroke: "#64748b" } },
    { id: 'e5', source: 'n5-flann', target: 'n6-save', type: 'smoothstep', style: { strokeWidth: 2, stroke: "#64748b" } },
  ],
};