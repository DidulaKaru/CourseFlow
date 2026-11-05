import { describe, expect, it } from 'vitest';
import { calculateLayout } from '@/core/layout';
import { mockComputerEngineeringProgram, mockElectricalEngineeringProgram } from '@/data/mockCourses';
import {
    calculateCanvasTranslateExtent,
    DEFAULT_VIEWPORT_BOUNDS_CONFIG,
    getResponsiveViewport,
} from '../utils/viewport';

describe('Canvas Viewport & Scrolling Boundary Clamping (CF-Canvas-Boundaries)', () => {
    const ceLayout = calculateLayout(mockComputerEngineeringProgram.courses);
    const eeLayout = calculateLayout(mockElectricalEngineeringProgram.courses);

    describe('calculateCanvasTranslateExtent (Scrolling Boundary Guards)', () => {
        it('computes finite non-infinite vertical bounds for Computer Engineering curriculum', () => {
            const extent = calculateCanvasTranslateExtent(ceLayout);

            const [[minX, minY], [maxX, maxY]] = extent;

            // Invariant: Neither boundary can be infinite (which would allow infinite scrolling into void)
            expect(minY).toBeGreaterThan(-Infinity);
            expect(minY).not.toBeNaN();
            expect(maxY).toBeLessThan(Infinity);
            expect(maxY).not.toBeNaN();
            expect(minX).toBeGreaterThan(-Infinity);
            expect(maxX).toBeLessThan(Infinity);

            // Invariant: Bounding box must have positive area
            expect(minY).toBeLessThan(maxY);
            expect(minX).toBeLessThan(maxX);
        });

        it('computes finite non-infinite vertical bounds for Electrical Engineering curriculum', () => {
            const extent = calculateCanvasTranslateExtent(eeLayout);

            const [[minX, minY], [maxX, maxY]] = extent;

            expect(minY).toBeGreaterThan(-Infinity);
            expect(maxY).toBeLessThan(Infinity);
            expect(minY).toBeLessThan(maxY);
            expect(minX).toBeLessThan(maxX);
        });

        it('locks the top scroll boundary (minY) right above Semester 1 with top padding', () => {
            const extent = calculateCanvasTranslateExtent(ceLayout);
            const [[, minY]] = extent;

            const firstSemester = ceLayout.semesters[0];
            expect(firstSemester).toBeDefined();

            const expectedMinY = Math.floor(firstSemester.y - DEFAULT_VIEWPORT_BOUNDS_CONFIG.topPadding);
            expect(minY).toBe(expectedMinY);

            // Verify that top boundary does not allow scrolling miles above Semester 1
            expect(firstSemester.y - minY).toBe(DEFAULT_VIEWPORT_BOUNDS_CONFIG.topPadding);
        });

        it('locks the bottom scroll boundary (maxY) right below the final semester with bottom padding', () => {
            const extent = calculateCanvasTranslateExtent(ceLayout);
            const [[, ,], [, maxY]] = extent;

            const lastSemester = ceLayout.semesters[ceLayout.semesters.length - 1];
            expect(lastSemester).toBeDefined();

            const expectedBottomY = lastSemester.y + lastSemester.height;
            const expectedMaxY = Math.ceil(expectedBottomY + DEFAULT_VIEWPORT_BOUNDS_CONFIG.bottomPadding);

            expect(maxY).toBe(expectedMaxY);
            // Verify that bottom boundary does not allow scrolling miles past the last semester
            expect(maxY - expectedBottomY).toBe(DEFAULT_VIEWPORT_BOUNDS_CONFIG.bottomPadding);
        });

        it('respects custom padding overrides for specialized screen constraints', () => {
            const customPadding = {
                topPadding: 50,
                bottomPadding: 100,
                horizontalPadding: 80,
            };

            const extent = calculateCanvasTranslateExtent(ceLayout, customPadding);
            const [[minX, minY], [maxX, maxY]] = extent;

            const firstSemester = ceLayout.semesters[0];
            const lastSemester = ceLayout.semesters[ceLayout.semesters.length - 1];

            expect(minY).toBe(Math.floor(firstSemester.y - 50));
            expect(maxY).toBe(Math.ceil(lastSemester.y + lastSemester.height + 100));

            const contentWidth = ceLayout.columns[0]?.width ?? 1360;
            const leftPadding = ceLayout.columns[0]?.x ?? 60;

            expect(minX).toBe(Math.floor(leftPadding - 80));
            expect(maxX).toBe(Math.ceil(leftPadding + contentWidth + 80));
        });

        it('handles empty layout metadata gracefully without returning Infinity or crashing', () => {
            const emptyLayout = {
                nodes: [],
                edges: [],
                columns: [],
                semesters: [],
            };

            const extent = calculateCanvasTranslateExtent(emptyLayout);
            const [[minX, minY], [maxX, maxY]] = extent;

            expect(minY).toBeGreaterThan(-Infinity);
            expect(maxY).toBeLessThan(Infinity);
            expect(minX).toBeLessThan(maxX);
            expect(minY).toBeLessThan(maxY);
        });

        it('ensures total scrollable vertical distance is strictly bounded to graph span', () => {
            const extent = calculateCanvasTranslateExtent(ceLayout);
            const [[, minY], [, maxY]] = extent;

            const totalSpan = maxY - minY;
            const firstSemester = ceLayout.semesters[0];
            const lastSemester = ceLayout.semesters[ceLayout.semesters.length - 1];
            const graphActualHeight = (lastSemester.y + lastSemester.height) - firstSemester.y;

            // Total extent span must equal actual graph height plus top and bottom breathing padding
            expect(totalSpan).toBe(
                graphActualHeight +
                DEFAULT_VIEWPORT_BOUNDS_CONFIG.topPadding +
                DEFAULT_VIEWPORT_BOUNDS_CONFIG.bottomPadding
            );
        });
    });

    describe('getResponsiveViewport (Camera Fitting & Center Alignment)', () => {
        it('calculates scaled zoom factor (~0.25 - 0.28) and horizontal center for mobile screens', () => {
            const mobileVp = getResponsiveViewport(390); // iPhone 12 / 13 / 14 width

            expect(mobileVp.zoom).toBeGreaterThanOrEqual(0.25);
            expect(mobileVp.zoom).toBeLessThanOrEqual(0.28);
            expect(mobileVp.x).toBeGreaterThan(0);
            expect(mobileVp.y).toBe(60); // 60px vertical offset on mobile to clear HUD
        });

        it('calculates adaptive zoom for tablet viewports (768px - 1024px)', () => {
            const tabletVp = getResponsiveViewport(768);

            expect(tabletVp.zoom).toBeGreaterThan(0.5);
            expect(tabletVp.zoom).toBeLessThan(0.6);
            expect(tabletVp.x).toBeGreaterThan(0);
            expect(tabletVp.y).toBe(30);
        });

        it('clamps desktop zoom up to 1.0 without oversized scaling', () => {
            const desktopVp = getResponsiveViewport(1920);

            expect(desktopVp.zoom).toBe(1.0);
            expect(desktopVp.x).toBeGreaterThan(0);
            expect(desktopVp.y).toBe(30);
        });

        it('enforces that initial camera positions stay strictly within calculateCanvasTranslateExtent', () => {
            const desktopVp = getResponsiveViewport(1440);
            const extent = calculateCanvasTranslateExtent(ceLayout);
            const [[, minY], [, maxY]] = extent;

            // Initial camera y position must not start above top extent or below bottom extent
            expect(desktopVp.y).toBeGreaterThan(minY);
            expect(desktopVp.y).toBeLessThan(maxY);
        });
    });
});
