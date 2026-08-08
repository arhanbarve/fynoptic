// Typed wrapper over localStorage for the keys scattered across the legacy
// js/*.js files. Each getter zod-parses the stored value and falls back to a
// sane default instead of throwing when the value is corrupted or absent.

import { z } from 'zod';

const COURSE_PROGRESS_KEY = 'ff_course_progress';
const FIXIT_HISTORY_KEY = 'ff_fixit_history';
const REPORTS_KEY = 'ff_reports';
const THEME_KEY = 'fynoptic-theme';
const A11Y_HC_KEY = 'ff_a11y_hc';
const A11Y_DYS_KEY = 'ff_a11y_dys';

export type Theme = 'dark' | 'light';

const stringArraySchema = z.array(z.string());
const themeSchema = z.enum(['dark', 'light']);

function readJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // localStorage may be unavailable (private mode, quota exceeded); ignore.
  }
}

function readStringArray(key: string): string[] {
  const result = stringArraySchema.safeParse(readJson(key));
  return result.success ? result.data : [];
}

export function getCourseProgress(): string[] {
  return readStringArray(COURSE_PROGRESS_KEY);
}

export function setCourseProgress(moduleIds: string[]): void {
  writeJson(COURSE_PROGRESS_KEY, moduleIds);
}

export function getFixitHistory(): string[] {
  return readStringArray(FIXIT_HISTORY_KEY);
}

export function setFixitHistory(entries: string[]): void {
  writeJson(FIXIT_HISTORY_KEY, entries);
}

export function getReports(): unknown[] {
  const result = z.array(z.unknown()).safeParse(readJson(REPORTS_KEY));
  return result.success ? result.data : [];
}

export function setReports(reports: unknown[]): void {
  writeJson(REPORTS_KEY, reports);
}

export function getTheme(): Theme {
  try {
    const result = themeSchema.safeParse(localStorage.getItem(THEME_KEY));
    return result.success ? result.data : 'dark';
  } catch {
    return 'dark';
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // ignore
  }
}

// ff_a11y_hc / ff_a11y_dys are legacy keys, stored as '1'/'0' strings (not
// JSON) — same on-disk shape the original js/course-one.js used.
export function getA11yHighContrast(): boolean {
  try {
    return localStorage.getItem(A11Y_HC_KEY) === '1';
  } catch {
    return false;
  }
}

export function setA11yHighContrast(enabled: boolean): void {
  try {
    localStorage.setItem(A11Y_HC_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}

export function getA11yDyslexia(): boolean {
  try {
    return localStorage.getItem(A11Y_DYS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setA11yDyslexia(enabled: boolean): void {
  try {
    localStorage.setItem(A11Y_DYS_KEY, enabled ? '1' : '0');
  } catch {
    // ignore
  }
}
