// src/components/WorkflowTabs.tsx
import React, { useState, useRef, useEffect } from 'react';

// Interface สำหรับข้อมูลเบื้องต้นของ Tab ที่ต้องใช้แสดงผล
export interface TabSummary {
  id: string;
  name: string;
}

interface WorkflowTabsProps {
  tabs: TabSummary[];
  activeTabId: string;
  onSwitch: (id: string) => void;
  onAdd: () => void;
  onClose: (id: string) => void;
  // ✅ เพิ่ม Prop รับฟังก์ชัน Rename
  onRename: (id: string, newName: string) => void;
}

export default function WorkflowTabs({ 
  tabs, 
  activeTabId, 
  onSwitch, 
  onAdd, 
  onClose,
  onRename 
}: WorkflowTabsProps) {
  
  // State สำหรับเก็บว่ากำลังแก้ Tab ไหนอยู่
  const [editingTabId, setEditingTabId] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto focus เมื่อเข้าโหมดแก้ไข
  useEffect(() => {
    if (editingTabId && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select(); // คลุมดำข้อความให้เลย เพื่อให้พิมพ์ทับได้ง่าย
    }
  }, [editingTabId]);

  // ฟังก์ชันเริ่มแก้ไข (เมื่อคลิกขวา หรือ ดับเบิ้ลคลิก)
  const startEditing = (e: React.MouseEvent, tab: TabSummary) => {
    e.preventDefault(); // ป้องกันเมนูคลิกขวาของ Browser
    e.stopPropagation();
    setEditingTabId(tab.id);
    setTempName(tab.name);
  };

  // ฟังก์ชันบันทึก
  const saveRename = () => {
    if (editingTabId) {
      onRename(editingTabId, tempName);
      setEditingTabId(null); // ออกจากโหมดแก้ไข
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') saveRename();
    if (e.key === 'Escape') setEditingTabId(null); // ยกเลิก
  };
  
  return (
    <div className="flex items-center bg-gray-900 border-b border-gray-700 w-full h-9 select-none">
      
      {/* Scrollable Tab Area */}
      <div className="flex-1 flex overflow-x-auto no-scrollbar h-full">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isEditing = tab.id === editingTabId;
          
          return (
            <div
              key={tab.id}
              // ถ้ากำลังแก้ชื่ออยู่ คลิกลงไปห้ามสลับ Tab (เดี๋ยว Input หลุด focus)
              onClick={() => !isEditing && onSwitch(tab.id)} 
              onContextMenu={(e) => startEditing(e, tab)}    // ✅ คลิกขวาเพื่อแก้ชื่อ
              onDoubleClick={(e) => startEditing(e, tab)}    // ✅ ดับเบิ้ลคลิกก็แก้ชื่อได้
              className={`
                group flex items-center min-w-[140px] max-w-[200px] px-3 border-r border-gray-700 cursor-pointer transition-all h-full
                ${isActive 
                  ? 'bg-gray-800 text-teal-400 border-t-2 border-t-teal-500' 
                  : 'bg-gray-900 text-gray-400 hover:bg-gray-800 hover:text-gray-200 border-t-2 border-t-transparent'}
              `}
              title={isEditing ? '' : "Right-click to rename"}
            >
              {/* Tab Icon */}
              <span className={`mr-2 ${isActive ? 'opacity-100' : 'opacity-50'}`}>
                📄
              </span>

              {/* ✅ Logic สลับระหว่าง ชื่อ กับ ช่องกรอก */}
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={tempName}
                  onChange={(e) => setTempName(e.target.value)}
                  onBlur={saveRename} // คลิกข้างนอก = เซฟและปิด
                  onKeyDown={handleKeyDown}
                  className="flex-1 w-full bg-gray-700 text-white text-xs px-1 py-0.5 rounded outline-none border border-teal-500"
                  onClick={(e) => e.stopPropagation()} // คลิกที่ input อย่าไป trigger tab switch
                />
              ) : (
                <span className="flex-1 truncate text-xs font-medium font-mono pt-0.5">
                  {tab.name}
                </span>
              )}

              {/* Close Button (ซ่อนตอนกำลังแก้ชื่อ) */}
              {!isEditing && (
                <button
                  onClick={(e) => {
                    e.stopPropagation(); // ป้องกันไม่ให้ trigger onSwitch
                    onClose(tab.id);
                  }}
                  className={`
                    ml-1 p-0.5 rounded-md hover:bg-gray-700 hover:text-red-400 transition-opacity
                    ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}
                  `}
                  title="Close Tab"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Button */}
      <button
        onClick={onAdd}
        className="flex items-center justify-center w-10 h-full text-gray-500 hover:text-teal-400 hover:bg-gray-800 border-l border-gray-700 transition-colors"
        title="New Workflow"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
      </button>
    </div>
  );
}