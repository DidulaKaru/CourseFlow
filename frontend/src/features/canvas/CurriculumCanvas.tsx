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
import { Compass } from 'lucide-react';

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
    const [showMobileRadar, setShowMobileRadar] = useState(false);

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

    // 6. Responsive Viewport Scaling & Auto-Centering Engine
    const getResponsiveViewport = useCallback((windowW: number) => {
        const targetW = 1360; // 5 columns (1280px) + horizontal breathing margin
        // Responsive margins: phones use tight margins (16px) to maximize screen area
        const horizontalPadding = windowW < 640 ? 16 : windowW < 1024 ? 36 : 80;
        const calculatedZoom = Math.min(1.0, (windowW - horizontalPadding) / targetW);
        // Allow zoom down to 0.15 so small phones never clamp to an oversized card
        const zoom = Math.max(0.15, calculatedZoom);
        const x = Math.max(8, (windowW - targetW * zoom) / 2);
        const y = windowW < 640 ? 60 : 30;
        return { x, y, zoom };
    }, []);

    // Initial viewport calculation for React Flow
    const initialViewport = useMemo(() => {
        if (typeof window === 'undefined') return { x: 40, y: 30, zoom: 0.95 };
        return getResponsiveViewport(window.innerWidth);
    }, [getResponsiveViewport]);

    // Live auto-fit on window resize or mobile orientation change
    useEffect(() => {
        const handleResize = () => {
            if (typeof window === 'undefined') return;
            const nextVp = getResponsiveViewport(window.innerWidth);
            const current = getViewport();
            setViewport({
                x: nextVp.x,
                y: current.y,
                zoom: nextVp.zoom,
            });
        };

        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [getResponsiveViewport, getViewport, setViewport]);

    // Adapt viewport when courses dataset changes
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const nextVp = getResponsiveViewport(window.innerWidth);
            setViewport(nextVp);
        }
    }, [courses, getResponsiveViewport, setViewport]);

    // Fit Graph Width action
    const handleFitWidth = useCallback(() => {
        if (typeof window === 'undefined') return;
        const nextVp = getResponsiveViewport(window.innerWidth);
        setViewport(nextVp, { duration: 400 });
    }, [getResponsiveViewport, setViewport]);

    // 7. Smooth Jump to Semester Handler with responsive header offset
    const handleJumpToSemester = useCallback(
        (semesterY: number) => {
            const current = getViewport();
            const headerOffset = typeof window !== 'undefined' && window.innerWidth < 640 ? 90 : 70;
            setViewport(
                {
                    x: current.x,
                    y: -semesterY * current.zoom + headerOffset,
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

    return (
        <div className={`relative w-full h-full bg-[#030508] skyrim-canvas-bg overflow-hidden ${className}`}>
            {/* Top HUD: Program Info, Constellation Legend & Semester Jump Bar */}
            <div className="absolute top-2 left-2 right-2 sm:right-auto sm:top-4 sm:left-4 z-10 flex flex-wrap items-center gap-2 sm:gap-3 bg-[#030508]/90 backdrop-blur-md px-3 py-1.5 sm:px-4 sm:py-2 rounded-sm border border-white/10 shadow-2xl pointer-events-auto max-w-[calc(100vw-1rem)] sm:max-w-none">
                <div className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 rotate-45 border border-white/60 bg-[var(--star-pip)] shadow-[0_0_6px_var(--constellation-beam)] shrink-0" />
                    <span className="font-serif uppercase font-bold text-[11px] sm:text-xs tracking-[0.12em] sm:tracking-[0.15em] text-slate-200 whitespace-nowrap">
                        {programName}
                    </span>
                    <span className="text-white/20 text-xs font-mono">|</span>
                    <span className="text-[11px] sm:text-xs font-mono text-slate-400 whitespace-nowrap">
                        {courses.length} Courses
                    </span>
                </div>

                <div className="h-4 w-[1px] bg-white/10 hidden md:block" />

                {/* Skyrim Constellation Graph Highlight Legend */}
                <div className="hidden sm:flex items-center gap-3 text-[11px] font-mono">
                    <div className="flex items-center gap-1.5 text-cyan-300">
                        <span className="w-1.5 h-1.5 rotate-45 bg-[#00F0FF] shadow-[0_0_6px_rgba(0,240,255,0.7)]" />
                        <span>Prerequisite</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-300">
                        <span className="w-1.5 h-1.5 rotate-45 bg-[#10B981] shadow-[0_0_6px_rgba(16,185,129,0.7)]" />
                        <span>Unlocked</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-[var(--accent-primary)]">
                        <span className="w-1.5 h-1.5 rotate-45 bg-[var(--constellation-beam)] shadow-[0_0_6px_var(--constellation-beam-glow)]" />
                        <span>Active</span>
                    </div>
                </div>

                <div className="h-4 w-[1px] bg-white/10 hidden lg:block" />

                {/* Quick Semester Jump Pills with Mobile Horizontal Scroll */}
                <div className="flex items-center gap-1 overflow-x-auto max-w-full pb-0.5 sm:pb-0 scrollbar-none">
                    <button
                        type="button"
                        onClick={handleFitWidth}
                        className="px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-[var(--accent-primary)] hover:text-white hover:bg-white/10 rounded-none border border-[var(--accent-primary)]/40 hover:border-white/20 transition-colors cursor-pointer shrink-0"
                        title="Fit entire constellation to screen width"
                    >
                        Fit Width
                    </button>
                    {layout.semesters.map((sem) => (
                        <button
                            key={`jump-${sem.semesterIndex}`}
                            type="button"
                            onClick={() => handleJumpToSemester(sem.y)}
                            className="px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-white hover:bg-white/10 rounded-none border border-transparent hover:border-white/15 transition-colors cursor-pointer shrink-0"
                            title={`Jump to Semester ${sem.semesterIndex}`}
                        >
                            S{sem.semesterIndex}
                        </button>
                    ))}
                </div>
            </div>

            {/* Mobile Radar Toggle Button */}
            <div className="absolute top-2 right-2 md:hidden z-10">
                <button
                    type="button"
                    onClick={() => setShowMobileRadar((prev) => !prev)}
                    className="p-1.5 bg-[#030508]/90 border border-white/10 rounded-none text-slate-300 hover:text-white transition-colors shadow-lg"
                    title="Toggle Armillary Radar Minimap"
                    aria-label="Toggle Radar Minimap"
                >
                    <Compass className="w-4 h-4" />
                </button>
            </div>

            {/* Active Selection Banner (Bottom Center) */}
            {activeCourse && (
                <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 sm:gap-3 bg-[#030508]/95 backdrop-blur-md px-3 py-1.5 sm:px-4 sm:py-2 rounded-sm border border-white/10 shadow-2xl text-xs text-slate-200 font-mono max-w-[calc(100vw-2rem)] truncate">
                    <div className="flex items-center gap-1.5 sm:gap-2 truncate">
                        <span className="font-bold text-[var(--accent-primary)] tracking-wider shrink-0">
                            {activeCourse.code}
                        </span>
                        <span className="text-slate-400 truncate max-w-[120px] sm:max-w-[220px]">
                            {activeCourse.title}
                        </span>
                    </div>
                    <div className="h-3.5 w-[1px] bg-white/10 shrink-0" />
                    <div className="flex items-center gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] shrink-0">
                        <span className="text-cyan-300">
                            {upstreamCount} upstream
                        </span>
                        <span className="text-slate-600">•</span>
                        <span className="text-emerald-300">
                            {downstreamCount} unlocked
                        </span>
                    </div>
                    {selectedCourseId && (
                        <button
                            type="button"
                            onClick={handlePaneClick}
                            className="ml-1 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 px-1.5 sm:px-2 py-0.5 rounded-none border border-white/15 transition-colors shrink-0"
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
                zoomOnPinch={true}
                panOnDrag={true}
                defaultViewport={initialViewport}
                minZoom={0.12}
                maxZoom={2.5}
                nodesConnectable={false}
                elementsSelectable={true}
                proOptions={{ hideAttribution: true }}
                className="w-full h-full"
            >
                {/* Viewport Controls: Minimal Translucent Floating Glass Stack */}
                <Controls
                    showInteractive={false}
                    className="!bg-[#030508]/85 !backdrop-blur-md !border !border-white/10 !rounded-sm !shadow-2xl !p-0.5 [&>button]:!bg-transparent [&>button]:!border-b [&>button]:!border-white/10 [&>button]:!fill-slate-300 [&>button:hover]:!bg-white/10 [&>button:last-child]:!border-b-0 [&>button]:!rounded-none [&>button]:!w-7 [&>button]:!h-7 sm:[&>button]:!w-8 sm:[&>button]:!h-8"
                />

                {/* Celestial Dot Starfield Grid */}
                <Background
                    variant={BackgroundVariant.Dots}
                    gap={24}
                    size={1}
                    color="rgba(255, 255, 255, 0.08)"
                />

                {/* Minimap: Celestial Armillary Radar (Visible on tablet/desktop, or toggled on mobile) */}
                <MiniMap
                    nodeColor={(n) => {
                        if (n.type === 'swimlaneHeader') return 'rgba(255, 255, 255, 0.12)';
                        const data = n.data as unknown as ExtendedCourseNodeData;
                        if (data.highlightStatus === 'active') return '#00F0FF';
                        if (data.highlightStatus === 'upstream') return '#38BDF8';
                        if (data.highlightStatus === 'downstream') return '#10B981';
                        if (data.highlightStatus === 'dimmed') return '#1E293B';

                        const course = (n.data as { course?: Course })?.course;
                        switch (course?.type) {
                            case 'CORE':
                                return '#E0F2FE';
                            case 'ELECTIVE':
                                return '#94A3B8';
                            case 'CAPSTONE':
                                return '#F59E0B';
                            case 'LAB':
                                return '#00F0FF';
                            default:
                                return '#64748B';
                        }
                    }}
                    nodeStrokeWidth={1}
                    zoomable
                    pannable
                    className={`!bg-[#030508]/90 !backdrop-blur-md !border !border-white/10 !rounded-sm !shadow-2xl ${
                        showMobileRadar ? '!block' : '!hidden md:!block'
                    }`}
                    maskColor="rgba(3, 5, 8, 0.85)"
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
