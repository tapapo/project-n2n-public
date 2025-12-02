import React, { useMemo, useState } from 'react';
import { TEMPLATES, type WorkflowTemplate } from '../lib/workflowTemplates';

interface SidebarProps {
  onLoadTemplate?: (template: WorkflowTemplate) => void;
}

// --- Icons Collection (เก็บไว้ใช้กับปุ่ม Tab ตอนกางออก) ---
const Icons: Record<string, React.FC<{ className?: string }>> = {
  Input: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>,
  Template: (p) => <svg {...p} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
};

const Sidebar = ({ onLoadTemplate }: SidebarProps) => {
  const [activeTab, setActiveTab] = useState<'nodes' | 'templates'>('nodes');
  
  // Default: ปิดทุกหมวด
  const [openJobs, setOpenJobs] = useState<Record<string, boolean>>({});
  const [collapsed, setCollapsed] = useState(false);

  const onDragStart = (event: React.DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  // ✅ เพิ่ม headerColor ให้ครบทุกหมวด
  const jobs = useMemo(() => ([
    { 
      name: 'Input', headerColor: 'text-teal-400', algorithms: [
      { type: 'image-input', label: 'Image Input', color: 'bg-teal-600' },
    ]},
    { 
      name: 'Feature Extraction', headerColor: 'text-green-400', algorithms: [
      { type: 'sift', label: 'SIFT', color: 'bg-green-600' },
      { type: 'surf', label: 'SURF', color: 'bg-green-600' },
      { type: 'orb', label: 'ORB', color: 'bg-green-600' },
    ]},
    { 
      name: 'Matching', headerColor: 'text-orange-400', algorithms: [
      { type: 'bfmatcher', label: 'BFMatcher', color: 'bg-orange-600' },
      { type: 'flannmatcher', label: 'FLANN Matcher', color: 'bg-orange-600' },
    ]},
    { 
      name: 'Object Alignment', headerColor: 'text-purple-400', algorithms: [
      { type: 'homography-align', label: 'Homography Align', color: 'bg-purple-600' },
      { type: 'affine-align', label: 'Affine Align', color: 'bg-purple-600' },
    ]},
    { 
      name: 'Classification', headerColor: 'text-pink-400', algorithms: [
      { type: 'otsu', label: "Otsu's Threshold", color: 'bg-pink-600' },
      { type: 'snake', label: 'Snake (Active Contour)', color: 'bg-pink-600' },
    ]},
    { 
      name: 'Quality Assessment', headerColor: 'text-blue-400', algorithms: [
      { type: 'brisque', label: 'BRISQUE', color: 'bg-blue-600' },
      { type: 'psnr', label: 'PSNR', color: 'bg-blue-600' },
      { type: 'ssim', label: 'SSIM', color: 'bg-blue-600' },
    ]},
    { 
      name: 'Saver', headerColor: 'text-gray-400', algorithms: [
      { type: 'save-image', label: 'Save Image', color: 'bg-gray-600' },
      { type: 'save-json', label: 'Save JSON', color: 'bg-gray-600' },
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
    setOpenJobs({});
  };

  // Helper สำหรับสี Template
  const getTemplateStyles = (color: string) => {
    const colorMap: Record<string, { border: string, stripe: string, text: string, hoverText: string }> = {
      green:  { border: 'hover:border-green-500/50',  stripe: 'bg-green-500',  text: 'text-green-400',  hoverText: 'group-hover:text-green-300' },
      pink:   { border: 'hover:border-pink-500/50',   stripe: 'bg-pink-500',   text: 'text-pink-400',   hoverText: 'group-hover:text-pink-300' },
      orange: { border: 'hover:border-orange-500/50', stripe: 'bg-orange-500', text: 'text-orange-400', hoverText: 'group-hover:text-orange-300' },
      purple: { border: 'hover:border-purple-500/50', stripe: 'bg-purple-500', text: 'text-purple-400', hoverText: 'group-hover:text-purple-300' },
      blue:   { border: 'hover:border-blue-500/50',   stripe: 'bg-blue-500',   text: 'text-blue-400',   hoverText: 'group-hover:text-blue-300' },
      teal:   { border: 'hover:border-teal-500/50',   stripe: 'bg-teal-500',   text: 'text-teal-400',   hoverText: 'group-hover:text-teal-300' },
    };
    return colorMap[color] || colorMap['teal'];
  };

  return (
    <aside
      className={[
        'border-r border-gray-800 bg-gray-900 h-full shadow-2xl flex flex-col transition-all duration-300 z-20',
        collapsed ? 'w-14' : 'w-72',
      ].join(' ')}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-gray-900">
        {!collapsed && (
          <div className="text-sm font-bold text-teal-400 tracking-wider uppercase">
            Node Library
          </div>
        )}
        <button
          title={collapsed ? 'Expand' : 'Collapse'}
          onClick={() => setCollapsed(s => !s)}
          className="h-8 w-8 rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white flex items-center justify-center transition shadow-sm border border-gray-700"
        >
          <svg
            className={`w-4 h-4 transform transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`}
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          >
            <path d="M13 17l5-5-5-5M6 17l5-5-5-5" />
          </svg>
        </button>
      </div>

      {/* Tab Switcher */}
      {!collapsed && (
        <div className="flex p-2 gap-1 border-b border-gray-800">
           <button 
             onClick={() => setActiveTab('nodes')}
             className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center justify-center gap-1
               ${activeTab === 'nodes' ? 'bg-teal-600/20 text-teal-400 border border-teal-500/50' : 'text-gray-500 hover:bg-gray-800'}`}
           >
             <Icons.Input className="w-3 h-3" /> NODES
           </button>
           <button 
             onClick={() => setActiveTab('templates')}
             className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-colors flex items-center justify-center gap-1
               ${activeTab === 'templates' ? 'bg-teal-600/20 text-teal-400 border border-teal-500/50' : 'text-gray-500 hover:bg-gray-800'}`}
           >
             <Icons.Template className="w-3 h-3" /> TEMPLATES
           </button>
        </div>
      )}

      {/* Content */}
      {!collapsed ? (
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent">
          
          {/* 1️⃣ Nodes View */}
          {activeTab === 'nodes' && (
            <>
              <div className="px-1 pb-2 flex gap-2 mb-1">
                  <button onClick={expandAll} className="flex-1 text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-gray-800 text-gray-500 hover:text-white hover:bg-gray-700 transition">Expand All</button>
                  <button onClick={collapseAll} className="flex-1 text-[10px] uppercase tracking-wide px-2 py-1 rounded bg-gray-800 text-gray-500 hover:text-white hover:bg-gray-700 transition">Collapse</button>
              </div>

              {jobs.map((job) => {
                const isOpen = openJobs[job.name];

                return (
                  <div key={job.name} className="rounded-lg overflow-hidden border border-gray-800/50 bg-gray-800/30 mb-1">
                    <div
                      className={`flex items-center justify-between p-2.5 cursor-pointer transition-colors duration-200 ${isOpen ? 'bg-gray-800 text-gray-200' : 'hover:bg-gray-800 text-gray-400'}`}
                      onClick={() => toggleJob(job.name)}
                    >
                      <div className="flex items-center gap-2">
                        {/* ✅ ใช้ job.headerColor เปลี่ยนสีข้อความ */}
                        <span className={`text-xs font-bold uppercase tracking-wide ${isOpen ? job.headerColor : ''}`}>{job.name}</span>
                      </div>
                      <svg className={`w-3 h-3 text-gray-500 transform transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3"><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                    </div>

                    {isOpen && (
                      <div className="px-2 pb-2 pt-1 space-y-1 bg-gray-900/50">
                        {job.algorithms.map((alg) => (
                          <div
                            key={alg.type}
                            onDragStart={(event) => onDragStart(event, alg.type)}
                            draggable
                            className={`${alg.color} group flex items-center p-2 rounded-md cursor-grab active:cursor-grabbing shadow-sm hover:shadow-md hover:translate-x-1 transition-all duration-200 border border-white/10`}
                            title={`Drag to add ${alg.label}`}
                          >
                            <span className="text-xs font-medium text-white drop-shadow-md w-full text-center">{alg.label}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* 2️⃣ Templates View */}
          {activeTab === 'templates' && (
             <div className="space-y-2 mt-1">
                {TEMPLATES.map((t, idx) => {
                    const style = getTemplateStyles(t.color || 'teal');
                    return (
                        <div 
                            key={idx} 
                            onClick={() => onLoadTemplate?.(t)}
                            className={`group p-3 rounded-lg border border-gray-700 bg-gray-800/50 hover:bg-gray-800 ${style.border} cursor-pointer transition-all duration-200 relative overflow-hidden`}
                        >
                            <div className={`absolute left-0 top-0 bottom-0 w-1 ${style.stripe} opacity-0 group-hover:opacity-100 transition-opacity`} />
                            <h3 className={`text-xs font-bold ${style.text} ${style.hoverText} mb-1`}>
                               {t.name}
                            </h3>
                            <p className="text-[10px] text-gray-400 leading-tight">{t.description}</p>
                        </div>
                    );
                })}
             </div>
          )}

        </div>
      ) : (
        // Collapsed View (Empty)
        <div className="flex-1 flex flex-col items-center gap-4 py-4 bg-gray-900">
        </div>
      )}
      
      {/* Footer */}
      {!collapsed && <div className="p-3 text-[10px] text-center text-gray-600 border-t border-gray-800">N2N Pipeline v2.0</div>}
    </aside>
  );
};

export default Sidebar;