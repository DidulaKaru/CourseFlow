import { useSyncExternalStore } from 'react';

/**
 * Minimal hash routing for the faculty screens. The student planner stays at the root, so a
 * plain URL (and every existing link or bookmark) keeps opening it.
 */
export type AppRoute =
    | { name: 'planner' }
    | { name: 'mis-uploads' }
    | { name: 'mis-review'; jobId: string };

export const PLANNER_HASH = '#/';
export const MIS_UPLOADS_HASH = '#/admin/uploads';
export const misReviewHash = (jobId: string) => `${MIS_UPLOADS_HASH}/${encodeURIComponent(jobId)}/review`;

export function parseHashRoute(hash: string): AppRoute {
    const path = hash.replace(/^#/, '').replace(/\/+$/, '');
    if (path === '/admin/uploads') return { name: 'mis-uploads' };
    const review = /^\/admin\/uploads\/([^/]+)\/review$/.exec(path);
    if (review) {
        try {
            return { name: 'mis-review', jobId: decodeURIComponent(review[1]) };
        } catch {
            return { name: 'planner' };
        }
    }
    return { name: 'planner' };
}

function subscribe(onChange: () => void) {
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
}

const readHash = () => window.location.hash;

export function useHashRoute(): AppRoute {
    const hash = useSyncExternalStore(subscribe, readHash, () => '');
    return parseHashRoute(hash);
}
