import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Background,
    BackgroundVariant,
    Controls,
    MiniMap,
    PanOnScrollMode,
    ReactFlow,
    ReactFlowProvider,
    useEdgesState,
    useNodesState,
    useReactFlow,
} from '@xyflow/react';
import type { Edge, NodeMouseHandler } from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { calculateLayout } from '@/core/layout';
import { usePlannerStore } from '@/core/store';
import { mockCourses } from '@/data/mockCourses';
import type { Course } from '@/types/curriculum';
import { CourseNode } from './components/CourseNode';
import type { ExtendedCourseNodeData } from './components/CourseNode';
import { SwimlaneHeaderNode } from './components/SwimlaneHeader';
import {
    applyGraphHighlights,
    getDownstreamCourseIds,
    getUpstreamCourseIds,
    type AnyCanvasNode,
} from './utils/graphHighlight';

// Register node types at module level
const nodeTypes = {
    courseNode: CourseNode,
    swimlaneHeader: SwimlaneHeaderNode,
};

const defaultEdgeOptions: Partial<Edge> = {
    type: 'smoothstep',
    animated: false,
};

export interface CurriculumCanvasProps {
    courses?: Course[];
    programName?: string;
    className?: string;
}

function InnerCurriculumCanvas({
    courses = mockCourses,
    programName = 'Computer Engineering',
    className = '',
}: CurriculumCanvasProps) {
    const { setViewport, getViewport } = useReactFlow();

    // Selection and hover states
    const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
    const [hoveredCourseId, setHoveredCourseId] = useState<string | null>(null);

    // Active course is the hovered one (temporary focus) or clicked one (locked focus)
    const activeCourseId = hoveredCourseId || selectedCourseId;

    // Zustand store action to inspect course in slide-over drawer
    const openCourseDrawer = usePlannerStore((state) => state.openCourseDrawer);

    // 1. Calculate deterministic top-to-bottom layout from courses
    const layout = useMemo(() => {
        return calculateLayout(courses);
    }, [courses]);

    // 2. React Flow node and edge state collections
    const [nodes, setNodes, onNodesChange] = useNodesState<AnyCanvasNode>(layout.nodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(layout.edges);

    // Derived active dependency statistics for the HUD overlay
    const { upstreamCount, downstreamCount } = useMemo(() => {
        if (!activeCourseId) {
            return { upstreamCount: 0, downstreamCount: 0 };
        }
        const u = getUpstreamCourseIds(activeCourseId, layout.edges);
        const d = getDownstreamCourseIds(activeCourseId, layout.edges);
        return {
            upstreamCount: u.size,
            downstreamCount: d.size,
        };
    }, [activeCourseId, layout.edges]);

    // 3. Re-apply dependency illumination & dimming whenever active course or layout changes
    useEffect(() => {
        const { nodes: updatedNodes, edges: updatedEdges } = applyGraphHighlights(
            activeCourseId,
            layout.nodes,
            layout.edges
        );
        setNodes(updatedNodes);
        setEdges(updatedEdges);
    }, [activeCourseId, layout, setNodes, setEdges]);

    // Adjust local selection state during render when courses dataset changes
    const [prevCourses, setPrevCourses] = useState(courses);
    if (prevCourses !== courses) {
        setPrevCourses(courses);
        setSelectedCourseId(null);
        setHoveredCourseId(null);
    }

    // 4. Hover handlers
    const handleNodeMouseEnter: NodeMouseHandler<AnyCanvasNode> = useCallback((_, node) => {
        if (node.type === 'courseNode') {
            setHoveredCourseId(node.id);
        }
    }, []);

    const handleNodeMouseLeave: NodeMouseHandler<AnyCanvasNode> = useCallback(() => {
        setHoveredCourseId(null);
    }, []);

    // 5. Selection handlers (click node to toggle selection, click canvas pane to deselect)
    const handleNodeClick: NodeMouseHandler<AnyCanvasNode> = useCallback(
        (_, node) => {
            if (node.type === 'courseNode' && 'course' in node.data) {
                const course = (node.data as { course: Course }).course;
                setSelectedCourseId((prev) => (prev === node.id ? null : node.id));
                openCourseDrawer(course);
            }
        },
        [openCourseDrawer]
    );

    const handlePaneClick = useCallback(() => {
        setSelectedCourseId(null);
        setHoveredCourseId(null);
    }, []);

    // 6. Smooth Jump to Semester Handler
    const handleJumpToSemester = useCallback(
        (semesterY: number) => {
            const current = getViewport();
            setViewport(
                {
                    x: current.x,
                    y: -semesterY * current.zoom + 80,
                    zoom: current.zoom,
                },
                { duration: 400 }
            );
        },
        [getViewport, setViewport]
    );

    // Lookup active course model for the HUD info banner
    const activeCourse = useMemo(() => {
        if (!activeCourseId) return null;
        return courses.find((c) => c.id === activeCourseId) ?? null;
    }, [activeCourseId, courses]);

    // Responsive initial viewport positioning
    const initialViewport = useMemo(() => {
        if (typeof window === 'undefined') return { x: 40, y: 30, zoom: 0.95 };
        const windowW = window.innerWidth;
        const targetW = 1360;
        const zoom = Math.min(1.0, Math.max(0.75, (windowW - 80) / targetW));
        const x = Math.max(20, (windowW - targetW * zoom) / 2);
        return { x, y: 30, zoom };
    }, []);

    return (
        <div className={`relative w-full h-full bg-slate-950 overflow-hidden ${className}`}>
            {/* Top HUD: Program Info, Graph Highlight Legend & Semester Jump Bar */}
            <div className="absolute top-4 left-4 z-10 flex flex-wrap items-center gap-3 bg-slate-900/90 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-800 shadow-2xl pointer-events-auto">
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                    <span className="text-xs font-bold text-white tracking-wide">
                        {programName}
                    </span>
                    <span className="text-slate-500 text-xs">|</span>
                    <span className="text-xs font-mono text-slate-400">
                        {courses.length} Courses
                    </span>
                </div>

                <div className="h-4 w-[1px] bg-slate-800 hidden sm:block" />

                {/* Graph Highlight Legend */}
                <div className="flex items-center gap-3 text-[11px]">
                    <div className="flex items-center gap-1.5 text-cyan-400">
                        <span className="w-2 h-2 rounded-full bg-cyan-400" />
                        <span>Prerequisite</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span>Unlocked</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-indigo-400">
                        <span className="w-2 h-2 rounded-full bg-indigo-400" />
                        <span>Active</span>
                    </div>
                </div>

                <div className="h-4 w-[1px] bg-slate-800 hidden md:block" />

                {/* Quick Semester Jump Pills */}
                <div className="flex items-center gap-1">
                    {layout.semesters.map((sem) => (
                        <button
                            key={`jump-${sem.semesterIndex}`}
                            type="button"
                            onClick={() => handleJumpToSemester(sem.y)}
                            className="px-2 py-0.5 text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-slate-800/90 rounded border border-transparent hover:border-slate-700 transition-colors font-mono cursor-pointer"
                            title={`Jump to Semester ${sem.semesterIndex}`}
                        >
                            S{sem.semesterIndex}
                        </button>
                    ))}
                </div>
            </div>

            {/* Active Selection Banner (Bottom Center) */}
            {activeCourse && (
                <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 bg-slate-900/95 backdrop-blur-md px-4 py-2.5 rounded-xl border border-slate-700/80 shadow-2xl text-xs text-slate-200">
                    <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-400">
                            {activeCourse.code}
                        </span>
                        <span className="text-slate-400 line-clamp-1 max-w-[220px]">
                            {activeCourse.title}
                        </span>
                    </div>
                    <div className="h-3.5 w-[1px] bg-slate-800" />
                    <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-cyan-400">
                            {upstreamCount} upstream
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-emerald-400">
                            {downstreamCount} unlocked
                        </span>
                    </div>
                    {selectedCourseId && (
                        <button
                            type="button"
                            onClick={handlePaneClick}
                            className="ml-1 text-[10px] font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 px-2 py-0.5 rounded border border-slate-700 transition-colors"
                        >
                            Clear
                        </button>
                    )}
                </div>
            )}

            {/* React Flow Viewport */}
            <ReactFlow
                nodes={nodes}
                edges={edges}
                onNodesChange={onNodesChange}
                onEdgesChange={onEdgesChange}
                onNodeMouseEnter={handleNodeMouseEnter}
                onNodeMouseLeave={handleNodeMouseLeave}
                onNodeClick={handleNodeClick}
                onPaneClick={handlePaneClick}
                nodeTypes={nodeTypes}
                defaultEdgeOptions={defaultEdgeOptions}
                panOnScroll={true}
                panOnScrollMode={PanOnScrollMode.Vertical}
                zoomOnScroll={false}
                defaultViewport={initialViewport}
                minZoom={0.4}
                maxZoom={1.5}
                nodesConnectable={false}
                elementsSelectable={true}
                proOptions={{ hideAttribution: true }}
                className="w-full h-full"
            >
                {/* Viewport Controls: Zoom, Pan, Reset */}
                <Controls
                    showInteractive={false}
                    className="!bg-slate-900/90 !border !border-slate-800 !rounded-xl !shadow-2xl !p-1 [&>button]:!bg-slate-800 [&>button]:!border-slate-700 [&>button]:!fill-slate-300 [&>button:hover]:!bg-slate-700"
                />

                {/* Canvas Background with Subtle Dot Grid */}
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={20}
                    size={1.2}
                    color="#334155"
                />

                {/* Minimap for Canvas Navigation */}
                <MiniMap
                    nodeColor={(n) => {
                        if (n.type === 'swimlaneHeader') return '#3b82f6';
                        const data = n.data as unknown as ExtendedCourseNodeData;
                        if (data.highlightStatus === 'active') return '#6366f1';
                        if (data.highlightStatus === 'upstream') return '#06b6d4';
                        if (data.highlightStatus === 'downstream') return '#10b981';
                        if (data.highlightStatus === 'dimmed') return '#1e293b';

                        const course = (n.data as { course?: Course })?.course;
                        switch (course?.type) {
                            case 'CORE':
                                return '#3b82f6';
                            case 'ELECTIVE':
                                return '#a855f7';
                            case 'CAPSTONE':
                                return '#f59e0b';
                            case 'LAB':
                                return '#10b981';
                            default:
                                return '#64748b';
                        }
                    }}
                    nodeStrokeWidth={2}
                    zoomable
                    pannable
                    className="!bg-slate-900/90 !border !border-slate-800 !rounded-xl !shadow-2xl"
                    maskColor="rgba(15, 23, 42, 0.75)"
                />
            </ReactFlow>
        </div>
    );
}

export function CurriculumCanvas(props: CurriculumCanvasProps) {
    return (
        <ReactFlowProvider>
            <InnerCurriculumCanvas {...props} />
        </ReactFlowProvider>
    );
}
