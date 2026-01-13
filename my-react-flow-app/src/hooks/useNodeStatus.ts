// File: src/hooks/useNodeStatus.ts
import { useMemo } from 'react';
import type { CustomNodeData } from '../types';

export const useNodeStatus = (data: CustomNodeData | undefined) => {
  return useMemo(() => {
    const status = data?.status;
    const payload = data?.payload;
    
    const isRunning = status === 'start' || status === 'running';
    const isFault = status === 'fault';

    // เช็คว่ามีผลลัพธ์ค้างอยู่หรือไม่ (รวมทุก key ที่เป็นไปได้)
    const hasResult = !!(
        payload?.result_image_url || 
        payload?.json_url || 
        payload?.url || 
        payload?.output ||
        payload?.mask_url ||
        payload?.overlay_url
    );

    // ✅ สูตรลับ: ถ้าสถานะบอกว่าเสร็จ หรือ (มีของครบ และไม่ได้กำลังรัน/Error) = ไฟเขียว
    const isSuccess = status === 'success' || (hasResult && !isRunning && !isFault);

    return {
      isRunning,
      isFault,
      isSuccess,
      statusDot: (active: boolean, color: string) => 
        `h-4 w-4 rounded-full ${active ? color : 'bg-gray-600'} flex-shrink-0 shadow-inner transition-colors duration-200`
    };
  }, [data]);
};