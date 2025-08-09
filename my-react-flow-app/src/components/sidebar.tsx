import React, { useState } from 'react';

const Sidebar = () => {
  const [openJobs, setOpenJobs] = useState<Record<string, boolean>>({});

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const jobs = [
    // ... (โค้ด jobs เดิม)
    {
      name: 'Enhancement',
      algorithms: [
        { type: 'enhancement-1', label: 'Enhancement 1', color: 'bg-indigo-500' },
        { type: 'enhancement-2', label: 'Enhancement 2', color: 'bg-indigo-500' },
        { type: 'enhancement-3', label: 'Enhancement 3', color: 'bg-indigo-500' },
      ],
    },
    {
      name: 'Restoration',
      algorithms: [
        { type: 'restoration-1', label: 'Restoration 1', color: 'bg-red-500' },
        { type: 'restoration-2', label: 'Restoration 2', color: 'bg-red-500' },
        { type: 'restoration-3', label: 'Restoration 3', color: 'bg-red-500' },
      ],
    },
    {
      name: 'Segmentation',
      algorithms: [
        { type: 'segmentation-1', label: 'Segmentation 1', color: 'bg-yellow-500' },
        { type: 'segmentation-2', label: 'Segmentation 2', color: 'bg-yellow-500' },
        { type: 'segmentation-3', label: 'Segmentation 3', color: 'bg-yellow-500' },
      ],
    },
    {
      name: 'Quality Assessment',
      algorithms: [
        { type: 'brisqe', label: 'BRISQUE', color: 'bg-blue-500' },
        { type: 'psnr', label: 'PSNR', color: 'bg-blue-500' },
        { type: 'ssim', label: 'SSIM', color: 'bg-blue-500' },
      ],
    },
    {
      name: 'Feature Extraction',
      algorithms: [
        { type: 'sift', label: 'SIFT', color: 'bg-green-500' },
        { type: 'surf', label: 'SURF', color: 'bg-green-500' },
        { type: 'orb', label: 'ORB', color: 'bg-green-500' },
      ],
    },
    {
      name: 'Matching',
      algorithms: [
        { type: 'bfmatcher', label: 'BFMatcher', color: 'bg-orange-500' },
        { type: 'flann-matcher', label: 'FlannMatcher', color: 'bg-orange-500' },
      ],
    },
    {
      name: 'Object Alignment',
      algorithms: [
        { type: 'affine', label: 'Affine', color: 'bg-purple-500' },
        { type: 'homography-estimation', label: 'Homography Estimation', color: 'bg-purple-500' },
      ],
    },
    {
      name: 'Classification',
      algorithms: [
        { type: 'classification-1', label: 'Classification 1', color: 'bg-pink-500' },
        { type: 'classification-2', label: 'Classification 2', color: 'bg-pink-500' },
        { type: 'classification-3', label: 'Classification 3', color: 'bg-pink-500' },
      ],
    },
  ];

  const toggleJob = (jobName: string) => {
    setOpenJobs(prev => ({
      ...prev,
      [jobName]: !prev[jobName],
    }));
  };

  return (
    <aside className="border-r border-gray-700 p-4 w-72 bg-gray-800 h-full shadow-xl flex flex-col">
      {/* หัวข้อจะอยู่ข้างบนและไม่ Scroll */}
      <div className="text-xl font-bold mb-4 text-teal-400 flex-shrink-0">Image Processing Job</div>
      
      {/* รายการ Job จะเป็นส่วนที่ Scroll ได้ */}
      <div className="flex flex-col gap-2 overflow-y-auto flex-grow">
        {jobs.map((job) => (
          <div key={job.name}>
            <div
              className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors duration-200 mt-4"
              onClick={() => toggleJob(job.name)}
            >
              <span className="text-sm font-semibold text-gray-200">{job.name}</span>
              <svg
                className={`w-4 h-4 text-gray-400 transform transition-transform duration-200 ${openJobs[job.name] ? 'rotate-90' : ''}`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            
            {openJobs[job.name] && (
              <div className="mt-2 space-y-2">
                {job.algorithms.map((alg) => (
                  <div
                    key={alg.type}
                    className={`dndnode ${alg.color} text-white p-2 ml-4 rounded-lg text-center cursor-grab shadow-lg transition-transform duration-100 ease-in-out hover:scale-105`}
                    onDragStart={(event) => onDragStart(event, alg.type)}
                    draggable
                  >
                    {alg.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
};

export default Sidebar;