import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setCourseProgress } from '../../src/lib/storage';
import { defaultCourseState, progressStore, refreshProgressSnapshot } from '../../src/lib/progress';

const DP_STATE_KEY = 'ff_dp_state';
const COOKIE_NAME = 'ff_dp_state_v2';

function setCookie(name: string, value: string): void {
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/`;
}

function clearAllState(): void {
  localStorage.clear();
  document.cookie.split(';').forEach((c) => {
    const name = c.split('=')[0]?.trim();
    if (name) document.cookie = `${name}=; max-age=0; path=/`;
  });
}

beforeEach(() => {
  clearAllState();
  // Reset the module-level store between tests since it's a singleton.
  progressStore.set({ moduleIds: [], courseState: defaultCourseState });
});

describe('refreshProgressSnapshot', () => {
  it('defaults to an empty snapshot when nothing is stored', () => {
    refreshProgressSnapshot();
    expect(progressStore.get()).toEqual({ moduleIds: [], courseState: defaultCourseState });
  });

  it('reads ff_course_progress through the zod-validated storage helper', () => {
    setCourseProgress(['dp-m1', 'dp-m3']);
    refreshProgressSnapshot();
    expect(progressStore.get().moduleIds).toEqual(['dp-m1', 'dp-m3']);
  });

  it('falls back to an empty array when ff_course_progress is corrupt', () => {
    localStorage.setItem('ff_course_progress', 'not-json');
    refreshProgressSnapshot();
    expect(progressStore.get().moduleIds).toEqual([]);
  });

  it('reads the CourseState cookie over localStorage when both are present', () => {
    const cookieState = { ...defaultCourseState, m1: { video: true, article: true } };
    const lsState = { ...defaultCourseState, m1: { video: false, article: false } };
    setCookie(COOKIE_NAME, JSON.stringify(cookieState));
    localStorage.setItem(DP_STATE_KEY, JSON.stringify(lsState));

    refreshProgressSnapshot();

    expect(progressStore.get().courseState.m1).toEqual({ video: true, article: true });
  });

  it('falls back to localStorage when the cookie is absent', () => {
    const lsState = { ...defaultCourseState, m4: { article: true, auditSubmitted: true, auditId: 'AUD-1' } };
    localStorage.setItem(DP_STATE_KEY, JSON.stringify(lsState));

    refreshProgressSnapshot();

    expect(progressStore.get().courseState.m4).toEqual({ article: true, auditSubmitted: true, auditId: 'AUD-1' });
  });

  it('notifies subscribers when the snapshot changes', () => {
    const listener = vi.fn();
    const unsubscribe = progressStore.subscribe(listener);

    refreshProgressSnapshot();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('does not write ff_dp_state, ff_dp_state_v2, or ff_course_progress — read-only in this phase', () => {
    refreshProgressSnapshot();
    progressStore.set({ moduleIds: ['dp-m1'], courseState: { ...defaultCourseState, m1: { video: true, article: true } } });

    // Mutating the in-memory store must not touch disk — this phase's
    // writers remain course-one.ts's own loadState/saveState/
    // bumpCourseProgress, untouched by this file.
    expect(localStorage.getItem(DP_STATE_KEY)).toBeNull();
    expect(localStorage.getItem('ff_course_progress')).toBeNull();
    expect(document.cookie).not.toContain(COOKIE_NAME);
  });
});
