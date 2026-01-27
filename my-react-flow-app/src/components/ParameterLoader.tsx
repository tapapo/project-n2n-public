import React, { useRef, useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import { Upload } from 'lucide-react';

interface ParameterLoaderProps {
  nodeId?: string;
  onLoad?: (params: any) => void;
  checkTool?: string;
}

export const ParameterLoader: React.FC<ParameterLoaderProps> = ({ nodeId, onLoad, checkTool }) => {
  const { setNodes } = useReactFlow();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonContent = JSON.parse(e.target?.result as string);

        const fileToolName = 
            jsonContent.tool ||             
            jsonContent.matching_tool ||    
            jsonContent.feature_tool;      

        if (checkTool && fileToolName) {
           const fileTool = String(fileToolName).toUpperCase(); 
           const targetTool = String(checkTool).toUpperCase();  

           
           if (!fileTool.includes(targetTool) && !targetTool.includes(fileTool)) {
               alert(`❌ Tool Mismatch!\n\nThis file is for: "${fileToolName}"\nBut this node expects: "${checkTool}"`);
               return; 
           }
        }

        let newParams: any = null;

        if (jsonContent.params) {
            newParams = jsonContent.params;
        } 
        else if (jsonContent.payload?.params) {
            newParams = jsonContent.payload.params;
        } 
        else {
            const paramKey = Object.keys(jsonContent).find(k => k.endsWith('_parameters_used'));
            if (paramKey) {
                newParams = jsonContent[paramKey];
            } 
            else if (jsonContent.parameters_hash || jsonContent.tool || jsonContent.matching_tool) {
                newParams = jsonContent; 
            }
        }

        if (!newParams) {
            alert("⚠️ No valid parameters found in this JSON file.");
            return;
        }

        if (onLoad) {
            onLoad(newParams);
        } else if (nodeId) {
            setNodes((nodes) => nodes.map((node) => {
              if (node.id === nodeId) {
                const currentParams = node.data.payload?.params || {};
                return {
                  ...node,
                  data: {
                    ...node.data,
                    payload: {
                      ...node.data.payload,
                      params: { ...currentParams, ...newParams }
                    }
                  }
                };
              }
              return node;
            }));
        }

      } catch (err) {
        console.error("Failed to parse JSON", err);
        alert("❌ Invalid JSON file.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsText(file);
  }, [setNodes, nodeId, onLoad, checkTool]);

  return (
    <div className="mt-4 pt-3 border-t border-gray-700/50">
      <input type="file" ref={fileInputRef} accept=".json" className="hidden" onChange={handleFileChange} />
      <button
        onClick={() => fileInputRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 bg-slate-800 hover:bg-slate-700 border border-dashed border-slate-600 rounded transition-colors"
        title={`Import parameters for ${checkTool || 'Node'}`}
      >
        <Upload size={14} /> 
        Load Params from JSON
      </button>
    </div>
  );
};