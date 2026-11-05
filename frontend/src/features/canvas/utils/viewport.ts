import type { CoordinateExtent } from '@xyflow/react';
import type { LayoutResult } from '@/core/layout';

export interface ViewportBoundsConfig {
    topPadding?: number;
    bottomPadding?: number;
    horizontalPadding?: number;
}

export const DEFAULT_VIEWPORT_BOUNDS_CONFIG: Required<ViewportBoundsConfig> = {
    topPadding: 100,
    bottomPadding: 200,
    horizontalPadding: 120,
};

export interface ResponsiveViewport {
    x: number;
    y: number;
    zoom: number;
}

/**
 * Computes deterministic camera translate extent [[minX, minY], [maxX, maxY]]
 * preventing the user from scrolling or panning the graph out of view at the top and bottom.
 *
 * Invariant Guarantees:
 * 1. minY is finite and bounded right above Semester 1 (never -Infinity), preventing scrolling above the graph.
 * 2. maxY is finite and bounded right below the final semester (never +Infinity), preventing scrolling below the graph.
 * 3. minX and maxX encompass the 5-column curriculum width with comfortable horizontal breathing margin.
 */
export function calculateCanvasTranslateExtent(
    layout: LayoutResult,
    config?: ViewportBoundsConfig
): CoordinateExtent {
    const opts = { ...DEFAULT_VIEWPORT_BOUNDS_CONFIG, ...config };
    const semesters = layout.semesters;

    if (!semesters || semesters.length === 0) {
        // Fallback safety bounding box for empty or initializing canvas
        return [
            [-opts.horizontalPadding, -opts.topPadding],
            [1400 + opts.horizontalPadding, 3000 + opts.bottomPadding],
        ];
    }

    const firstSemesterY = semesters[0].y;
    const lastSemester = semesters[semesters.length - 1];
    const totalBottomY = lastSemester.y + lastSemester.height;

    const contentWidth = layout.columns?.[0]?.width ?? 1360;
    const leftPadding = layout.columns?.[0]?.x ?? 60;

    const minX = Math.floor(leftPadding - opts.horizontalPadding);
    const maxX = Math.ceil(leftPadding + contentWidth + opts.horizontalPadding);
    const minY = Math.floor(firstSemesterY - opts.topPadding);
    const maxY = Math.ceil(totalBottomY + opts.bottomPadding);

    return [
        [minX, minY],
        [maxX, maxY],
    ];
}

/**
 * Evaluates the window viewport width and returns initial camera position and zoom factor.
 * Automatically adapts between mobile screens (360px - 480px), tablets, and desktop displays.
 */
export function getResponsiveViewport(windowW: number): ResponsiveViewport {
    const targetW = 1360; // 5 columns (1280px) + horizontal breathing margin
    // Responsive margins: phones use tight margins (16px) to maximize screen area
    const horizontalPadding = windowW < 640 ? 16 : windowW < 1024 ? 36 : 80;
    const calculatedZoom = Math.min(1.0, (windowW - horizontalPadding) / targetW);
    // Allow zoom down to 0.15 so small phones never clamp to an oversized card
    const zoom = Math.max(0.15, calculatedZoom);
    const x = Math.max(8, (windowW - targetW * zoom) / 2);
    const y = windowW < 640 ? 60 : 30;
    return { x, y, zoom };
}
