import React, { useMemo, useState } from 'react';

const Sidebar = () => {
  const [openJobs, setOpenJobs] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  const jobs = useMemo(() => ([
    { name: 'Input', algorithms: [
      { type: 'image-input', label: 'Image Input', color: 'bg-teal-600' },
    ]},
    { name: 'Saver', algorithms: [
      { type: 'save-image', label: 'Save Image', color: 'bg-gray-600' },
      { type: 'save-json', label: 'Save JSON', color: 'bg-gray-600' },
    ]},
    { name: 'Feature Extraction', algorithms: [
      { type: 'sift', label: 'SIFT', color: 'bg-green-500' },
      { type: 'surf', label: 'SURF', color: 'bg-green-500' },
      { type: 'orb', label: 'ORB', color: 'bg-green-500' },
    ]},
    { name: 'Matching', algorithms: [
      { type: 'bfmatcher', label: 'BFMatcher', color: 'bg-orange-500' },
      { type: 'flannmatcher', label: 'FLANN Matcher', color: 'bg-orange-500' },
    ]},
    { name: 'Object Alignment', algorithms: [
      { type: 'homography-align', label: 'Homography Align', color: 'bg-purple-500' },
      { type: 'affine-align', label: 'Affine Align', color: 'bg-purple-500' },
    ]},
    { name: 'Quality Assessment', algorithms: [
      { type: 'brisque', label: 'BRISQUE', color: 'bg-blue-500' },
      { type: 'psnr', label: 'PSNR', color: 'bg-blue-500' },
      { type: 'ssim', label: 'SSIM', color: 'bg-blue-500' },
    ]},
    { name: 'Classification', algorithms: [
      { type: 'otsu', label: "Otsu's Threshold", color: 'bg-pink-500' },
      { type: 'snake', label: 'Snake (Active Contour)', color: 'bg-pink-500' },
    ]},
    
  ]), []);

  const toggleJob = (jobName: string) => {
    setOpenJobs(prev => ({ ...prev, [jobName]: !prev[jobName] }));
  };

  const expandAll = () => {
    const next: Record<string, boolean> = {};
    jobs.forEach(j => { next[j.name] = true; });
    setOpenJobs(next);
  };

  const collapseAll = () => {
    const next: Record<string, boolean> = {};
    jobs.forEach(j => { next[j.name] = false; });
    setOpenJobs(next);
  };

  return (
    <aside
      className={[
        'border-r border-gray-700 bg-gray-800 h-full shadow-xl flex flex-col transition-all duration-300',
        collapsed ? 'w-12' : 'w-72',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center gap-2 p-3">
        {!collapsed && (
          <div className="text-lg font-bold text-teal-400 flex-1">
            Image Processing Job
          </div>
        )}
        <button
          title={collapsed ? 'OPEN' : 'CLOSE'}
          onClick={() => setCollapsed(s => !s)}
          className="h-7 w-7 rounded-full bg-gray-700 hover:bg-gray-600 text-gray-200 flex items-center justify-center transition"
        >
          <svg
            className={`w-4 h-4 transform transition-transform ${collapsed ? '' : 'rotate-180'}`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M12.707 15.707a1 1 0 01-1.414 0l-5-5a1 1 0 010-1.414l5-5a1 1 0 111.414 1.414L8.414 10l4.293 4.293a1 1 0 010 1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {/* ปุ่มเปิด/ปิดทั้งหมด */}
      {!collapsed && (
        <div className="px-3 pb-2 flex gap-2">
          <button
            onClick={expandAll}
            className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-100 hover:bg-gray-600"
          >
            Open All
          </button>
          <button
            onClick={collapseAll}
            className="text-xs px-2 py-1 rounded bg-gray-700 text-gray-100 hover:bg-gray-600"
          >
            Close All
          </button>
        </div>
      )}

      {/* รายการ jobs */}
      {!collapsed ? (
        <div className="flex flex-col gap-2 overflow-y-auto flex-grow px-2 pb-3 scrollbar-thin scrollbar-thumb-gray-600 scrollbar-track-gray-800">
          {jobs.map((job) => (
            <div key={job.name} className="mt-1">
              <div
                className="flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-gray-700 transition-colors duration-200 mt-2"
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
                      title={`Drag to canvas: ${alg.label}`}
                    >
                      {alg.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="flex-grow flex flex-col items-center gap-3 py-3 text-gray-400">
          <div className="w-5 h-1.5 bg-gray-700 rounded" />
          <div className="w-5 h-1.5 bg-gray-700 rounded" />
          <div className="w-5 h-1.5 bg-gray-700 rounded" />
        </div>
      )}
    </aside>
  );
};

export default Sidebar;