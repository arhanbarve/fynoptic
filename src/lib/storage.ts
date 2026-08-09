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
const ARTICLES_READ_KEY = 'ff_articles_read';
const USER_NAME_KEY = 'ff_user_name';
const RISK_AUDITS_KEY = 'ff_risk_audits';

export type Theme = 'dark' | 'light';

const stringArraySchema = z.array(z.string());
const themeSchema = z.enum(['dark', 'light']);

// course-one.ts:1102-1119's audit entry shape (Appendix B: `ff_risk_audits`
// is a separate, append-only array — not part of CourseState).
const riskAuditEntrySchema = z.object({
  id: z.string(),
  dateISO: z.string(),
  merchant: z.string(),
  action: z.string(),
  date: z.string(),
  channel: z.string(),
  saw: z.string(),
  patterns: z.string(),
  evidence: z.string(),
});

export type RiskAuditEntry = z.infer<typeof riskAuditEntrySchema>;

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

// Article ids the reader has visited. Local-only, same shape/convention as
// ff_course_progress: string[], zod-validated, empty array on anything else.
export function getArticlesRead(): string[] {
  return readStringArray(ARTICLES_READ_KEY);
}

export function setArticlesRead(articleIds: string[]): void {
  writeJson(ARTICLES_READ_KEY, articleIds);
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

// Append-only list of full Risk Audit entries (course-one.ts:1102-1119).
// Same zod-validated, empty-array-on-anything-else convention as the other
// getters here; a corrupted or unexpected on-disk value is treated as no
// history rather than thrown.
export function getRiskAudits(): RiskAuditEntry[] {
  const result = z.array(riskAuditEntrySchema).safeParse(readJson(RISK_AUDITS_KEY));
  return result.success ? result.data : [];
}

export function appendRiskAudit(entry: RiskAuditEntry): void {
  writeJson(RISK_AUDITS_KEY, [...getRiskAudits(), entry]);
}

// ff_user_name is a legacy key too: a raw string (not JSON), same on-disk
// shape islands/profile.ts used. This is the certificate's learner-name
// source (Appendix B) — src/components/profile/ProfileSettings.tsx is the
// sole writer.
export function getUserName(): string | null {
  try {
    return localStorage.getItem(USER_NAME_KEY);
  } catch {
    return null;
  }
}

export function setUserName(name: string): void {
  try {
    localStorage.setItem(USER_NAME_KEY, name);
  } catch {
    // ignore
  }
}
