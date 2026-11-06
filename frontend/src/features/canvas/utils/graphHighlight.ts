import type { Edge, Node } from '@xyflow/react';
import type { CourseLayoutNode, SwimlaneHeaderLayoutNode } from '@/core/layout';
import type { NodeHighlightStatus } from '../components/CourseNode';

export type AnyCanvasNode = CourseLayoutNode | SwimlaneHeaderLayoutNode | Node;

export interface GraphHighlightResult {
    nodes: AnyCanvasNode[];
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
 * Applies illumination and dimming to constellation nodes and edges
 * based on active course selection/hover in the Skyrim Skill Tree.
 */
export function applyGraphHighlights(
    activeId: string | null,
    nodes: AnyCanvasNode[],
    edges: Edge[]
): GraphHighlightResult {
    if (!activeId) {
        // Dormant State: Faint, cold starlight ray (strokeWidth: 1.25px, opacity: 0.65)
        const resetNodes: AnyCanvasNode[] = nodes.map((n) => {
            if (n.type !== 'courseNode') {
                return n;
            }
            return {
                ...n,
                data: {
                    ...n.data,
                    highlightStatus: 'normal' as NodeHighlightStatus,
                },
            };
        });

        const resetEdges: Edge[] = edges.map((e) => ({
            ...e,
            animated: false,
            style: {
                stroke: 'rgba(255, 255, 255, 0.15)',
                strokeWidth: 1.25,
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
    const updatedNodes: AnyCanvasNode[] = nodes.map((n) => {
        if (n.type !== 'courseNode') {
            return n;
        }

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
                    stroke: '#06b6d4',
                    strokeWidth: 1.75,
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
                    stroke: '#10b981',
                    strokeWidth: 1.75,
                    opacity: 1,
                    strokeDasharray: e.style?.strokeDasharray,
                },
            };
        }

        // Non-connected paths drop to opacity: 0.08
        return {
            ...e,
            animated: false,
            style: {
                stroke: 'rgba(255, 255, 255, 0.08)',
                strokeWidth: 1,
                opacity: 0.08,
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
