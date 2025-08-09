import React, { useCallback } from 'react';
import ReactFlow, {
    MiniMap,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
    addEdge,
    useReactFlow,
    type Connection,
    type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import CustomNode from './components/nodes/CustomNode';

const nodeTypes = {
    'enhancement-1': CustomNode,
    'enhancement-2': CustomNode,
    'enhancement-3': CustomNode,
    'restoration-1': CustomNode,
    'restoration-2': CustomNode,
    'restoration-3': CustomNode,
    'segmentation-1': CustomNode,
    'segmentation-2': CustomNode,
    'segmentation-3': CustomNode,
    sift: CustomNode,
    surf: CustomNode,
    orb: CustomNode,
    bfmatcher: CustomNode,
    'flann-matcher': CustomNode,
    brisqe: CustomNode,
    psnr: CustomNode,
    ssim: CustomNode,
    affine: CustomNode,
    'homography-estimation': CustomNode,
    'classification-1': CustomNode,
    'classification-2': CustomNode,
    'classification-3': CustomNode,
};

let id = 0;
const getId = () => `dndnode_${id++}`;

interface FlowCanvasProps {
    isRunning: boolean; // <-- เพิ่มบรรทัดนี้เข้ามา
}

const FlowCanvas = ({ isRunning }: FlowCanvasProps) => {
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    const { screenToFlowPosition } = useReactFlow();

    const onConnect = useCallback((params: Edge | Connection) => setEdges((eds) => addEdge(params, eds)), [setEdges]);

    const onDragOver = useCallback((event: React.DragEvent) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }, []);

    const onDrop = useCallback(
        (event: React.DragEvent) => {
            event.preventDefault();
            const type = event.dataTransfer.getData('application/reactflow');
            if (typeof type === 'undefined' || !type) {
                return;
            }

            const position = screenToFlowPosition({
                x: event.clientX,
                y: event.clientY,
            });

            const newNode = {
                id: getId(),
                type,
                position,
                data: {
                    label: type.split('-').map(s => s.charAt(0).toUpperCase() + s.slice(1)).join(' '),
                    status: 'idle',
                },
            };

            setNodes((nds) => nds.concat(newNode));
        },
        [screenToFlowPosition, setNodes]
    );

    return (
        <div className="flex-grow h-full" onDrop={onDrop} onDragOver={onDragOver}>
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onConnect={onConnect}
                nodeTypes={nodeTypes}
                fitView
            >
                <MiniMap />
                <Controls />
                <Background color="#aaa" gap={16} />
            </ReactFlow>
        </div>
    );
};

export default FlowCanvas;