import type { Edge } from '@xyflow/react';
import type { CourseLayoutNode } from '@/core/layout';
import type { NodeHighlightStatus } from '../components/CourseNode';

export interface GraphHighlightResult {
    nodes: CourseLayoutNode[];
    edges: Edge[];
    upstreamIds: Set<string>;
    downstreamIds: Set<string>;
}

/**
 * Traverses backward along directed prerequisite edges (source -> target)
 * to find all transitive upstream prerequisites for a given course.
 */
export function getUpstreamCourseIds(nodeId: string, edges: Edge[]): Set<string> {
    const upstream = new Set<string>();
    const queue = [nodeId];
    const visited = new Set<string>([nodeId]);

    // Build incoming adjacency map: target -> source[]
    const incomingMap = new Map<string, string[]>();
    for (const edge of edges) {
        const sources = incomingMap.get(edge.target) ?? [];
        sources.push(edge.source);
        incomingMap.set(edge.target, sources);
    }

    while (queue.length > 0) {
        const curr = queue.shift()!;
        const parents = incomingMap.get(curr) ?? [];
        for (const p of parents) {
            if (!visited.has(p)) {
                visited.add(p);
                upstream.add(p);
                queue.push(p);
            }
        }
    }

    return upstream;
}

/**
 * Traverses forward along directed prerequisite edges (source -> target)
 * to find all transitive downstream electives and modules unlocked by a given course.
 */
export function getDownstreamCourseIds(nodeId: string, edges: Edge[]): Set<string> {
    const downstream = new Set<string>();
    const queue = [nodeId];
    const visited = new Set<string>([nodeId]);

    // Build outgoing adjacency map: source -> target[]
    const outgoingMap = new Map<string, string[]>();
    for (const edge of edges) {
        const targets = outgoingMap.get(edge.source) ?? [];
        targets.push(edge.target);
        outgoingMap.set(edge.source, targets);
    }

    while (queue.length > 0) {
        const curr = queue.shift()!;
        const children = outgoingMap.get(curr) ?? [];
        for (const c of children) {
            if (!visited.has(c)) {
                visited.add(c);
                downstream.add(c);
                queue.push(c);
            }
        }
    }

    return downstream;
}

/**
 * Applies illumination and dimming to nodes and edges based on active course selection/hover.
 */
export function applyGraphHighlights(
    activeId: string | null,
    nodes: CourseLayoutNode[],
    edges: Edge[]
): GraphHighlightResult {
    if (!activeId) {
        // Return default normal states for all nodes and edges
        const resetNodes: CourseLayoutNode[] = nodes.map((n) => ({
            ...n,
            data: {
                ...n.data,
                highlightStatus: 'normal' as NodeHighlightStatus,
            },
        }));

        const resetEdges: Edge[] = edges.map((e) => ({
            ...e,
            animated: false,
            style: {
                stroke: '#64748b',
                strokeWidth: 1.5,
                opacity: 0.65,
                strokeDasharray: e.style?.strokeDasharray,
            },
        }));

        return {
            nodes: resetNodes,
            edges: resetEdges,
            upstreamIds: new Set<string>(),
            downstreamIds: new Set<string>(),
        };
    }

    const upstreamIds = getUpstreamCourseIds(activeId, edges);
    const downstreamIds = getDownstreamCourseIds(activeId, edges);

    // Update nodes
    const updatedNodes: CourseLayoutNode[] = nodes.map((n) => {
        let status: NodeHighlightStatus = 'dimmed';
        if (n.id === activeId) {
            status = 'active';
        } else if (upstreamIds.has(n.id)) {
            status = 'upstream';
        } else if (downstreamIds.has(n.id)) {
            status = 'downstream';
        }

        return {
            ...n,
            data: {
                ...n.data,
                highlightStatus: status,
            },
        };
    });

    // Update edges
    const updatedEdges: Edge[] = edges.map((e) => {
        const isUpstreamEdge =
            (upstreamIds.has(e.source) || e.source === activeId) &&
            (upstreamIds.has(e.target) || e.target === activeId);

        const isDownstreamEdge =
            (downstreamIds.has(e.source) || e.source === activeId) &&
            (downstreamIds.has(e.target) || e.target === activeId);

        if (isUpstreamEdge) {
            return {
                ...e,
                animated: true,
                style: {
                    stroke: '#06b6d4', // Cyan for upstream prerequisites
                    strokeWidth: 2.5,
                    opacity: 1,
                    strokeDasharray: e.style?.strokeDasharray,
                },
            };
        }

        if (isDownstreamEdge) {
            return {
                ...e,
                animated: true,
                style: {
                    stroke: '#10b981', // Emerald for downstream unlocked modules
                    strokeWidth: 2.5,
                    opacity: 1,
                    strokeDasharray: e.style?.strokeDasharray,
                },
            };
        }

        return {
            ...e,
            animated: false,
            style: {
                stroke: '#334155',
                strokeWidth: 1,
                opacity: 0.12,
                strokeDasharray: e.style?.strokeDasharray,
            },
        };
    });

    return {
        nodes: updatedNodes,
        edges: updatedEdges,
        upstreamIds,
        downstreamIds,
    };
}
