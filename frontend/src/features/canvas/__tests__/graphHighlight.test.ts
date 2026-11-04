import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import type { CourseLayoutNode } from '@/core/layout';
import {
    applyGraphHighlights,
    getDownstreamCourseIds,
    getUpstreamCourseIds,
} from '../utils/graphHighlight';

// Helper to create minimal test nodes
function createMockNode(id: string): CourseLayoutNode {
    return {
        id,
        type: 'courseNode',
        position: { x: 0, y: 0 },
        data: {
            course: {
                id,
                code: id,
                title: `Title for ${id}`,
                description: '',
                totalCredits: 3,
                durationSemesters: 1,
                recommendedSemester: 1,
                creditDistribution: [],
                type: 'CORE',
                prerequisiteRule: null,
                corequisites: [],
                offeredSemesters: ['FALL'],
            },
            isMultiSemester: false,
            durationSemesters: 1,
            spanWidth: 240,
            semesterIndex: 1,
            slotIndex: 0,
        },
    };
}

describe('Graph Dependency Highlighting Engine', () => {
    // Chain: A -> B -> C -> D, and branching E -> C
    const edges: Edge[] = [
        { id: 'e-A-B', source: 'A', target: 'B', type: 'smoothstep' },
        { id: 'e-B-C', source: 'B', target: 'C', type: 'smoothstep' },
        { id: 'e-C-D', source: 'C', target: 'D', type: 'smoothstep' },
        { id: 'e-E-C', source: 'E', target: 'C', type: 'smoothstep' },
    ];

    const nodes: CourseLayoutNode[] = [
        createMockNode('A'),
        createMockNode('B'),
        createMockNode('C'),
        createMockNode('D'),
        createMockNode('E'),
        createMockNode('UNCONNECTED'),
    ];

    describe('Upstream Prerequisite Traversal', () => {
        it('identifies direct and transitive upstream prerequisites', () => {
            const upstreamOfC = getUpstreamCourseIds('C', edges);
            expect(upstreamOfC).toContain('B');
            expect(upstreamOfC).toContain('A');
            expect(upstreamOfC).toContain('E');
            expect(upstreamOfC).not.toContain('C');
            expect(upstreamOfC).not.toContain('D');
            expect(upstreamOfC.size).toBe(3);
        });

        it('returns empty set if course has no upstream prerequisites', () => {
            const upstreamOfA = getUpstreamCourseIds('A', edges);
            expect(upstreamOfA.size).toBe(0);
        });
    });

    describe('Downstream Unlocked Module Traversal', () => {
        it('identifies direct and transitive downstream unlocked courses', () => {
            const downstreamOfA = getDownstreamCourseIds('A', edges);
            expect(downstreamOfA).toContain('B');
            expect(downstreamOfA).toContain('C');
            expect(downstreamOfA).toContain('D');
            expect(downstreamOfA).not.toContain('A');
            expect(downstreamOfA).not.toContain('E');
            expect(downstreamOfA.size).toBe(3);
        });

        it('returns empty set if course unlocks no downstream courses', () => {
            const downstreamOfD = getDownstreamCourseIds('D', edges);
            expect(downstreamOfD.size).toBe(0);
        });
    });

    describe('applyGraphHighlights', () => {
        it('resets all nodes to normal and edges to non-animated when activeId is null', () => {
            const result = applyGraphHighlights(null, nodes, edges);

            for (const node of result.nodes) {
                expect(node.data.highlightStatus).toBe('normal');
            }

            for (const edge of result.edges) {
                expect(edge.animated).toBe(false);
                expect(edge.style?.opacity).toBe(0.65);
            }
        });

        it('marks active, upstream, downstream, and dimmed nodes correctly', () => {
            const result = applyGraphHighlights('C', nodes, edges);

            const nodeMap = new Map(result.nodes.map((n) => [n.id, n.data.highlightStatus]));

            expect(nodeMap.get('C')).toBe('active');
            expect(nodeMap.get('B')).toBe('upstream');
            expect(nodeMap.get('A')).toBe('upstream');
            expect(nodeMap.get('E')).toBe('upstream');
            expect(nodeMap.get('D')).toBe('downstream');
            expect(nodeMap.get('UNCONNECTED')).toBe('dimmed');
        });

        it('highlights upstream and downstream edges with animation and dims unrelated edges', () => {
            const result = applyGraphHighlights('C', nodes, edges);

            const edgeMap = new Map(result.edges.map((e) => [e.id, e]));

            // Upstream edges: e-A-B, e-B-C, e-E-C
            expect(edgeMap.get('e-A-B')?.animated).toBe(true);
            expect(edgeMap.get('e-A-B')?.style?.stroke).toBe('#06b6d4');

            expect(edgeMap.get('e-B-C')?.animated).toBe(true);
            expect(edgeMap.get('e-B-C')?.style?.stroke).toBe('#06b6d4');

            expect(edgeMap.get('e-E-C')?.animated).toBe(true);
            expect(edgeMap.get('e-E-C')?.style?.stroke).toBe('#06b6d4');

            // Downstream edge: e-C-D
            expect(edgeMap.get('e-C-D')?.animated).toBe(true);
            expect(edgeMap.get('e-C-D')?.style?.stroke).toBe('#10b981');
        });
    });
});
