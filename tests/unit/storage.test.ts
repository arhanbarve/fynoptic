import { beforeEach, describe, expect, it } from 'vitest';
import {
  getArticlesRead,
  getCourseProgress,
  getFixitHistory,
  getReports,
  getTheme,
  setArticlesRead,
  setCourseProgress,
  setFixitHistory,
  setReports,
  setTheme,
} from '../../src/lib/storage';

const COURSE_PROGRESS_KEY = 'ff_course_progress';
const FIXIT_HISTORY_KEY = 'ff_fixit_history';
const REPORTS_KEY = 'ff_reports';
const THEME_KEY = 'fynoptic-theme';
const ARTICLES_READ_KEY = 'ff_articles_read';

beforeEach(() => {
  localStorage.clear();
});

describe('exact key names', () => {
  it('writes each value under its documented localStorage key', () => {
    setCourseProgress(['dp-m1']);
    expect(localStorage.getItem(COURSE_PROGRESS_KEY)).toBe('["dp-m1"]');

    setFixitHistory(['entry-1']);
    expect(localStorage.getItem(FIXIT_HISTORY_KEY)).toBe('["entry-1"]');

    setReports([{ a: 1 }]);
    expect(localStorage.getItem(REPORTS_KEY)).toBe('[{"a":1}]');

    setTheme('light');
    expect(localStorage.getItem(THEME_KEY)).toBe('light');

    setArticlesRead(['bnpl-real-rules']);
    expect(localStorage.getItem(ARTICLES_READ_KEY)).toBe('["bnpl-real-rules"]');
  });
});

describe('zod fallbacks on corrupt JSON', () => {
  it('getCourseProgress falls back to [] on invalid JSON', () => {
    localStorage.setItem(COURSE_PROGRESS_KEY, '{not json');
    expect(getCourseProgress()).toEqual([]);
  });

  it('getCourseProgress falls back to [] when the shape is wrong', () => {
    localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify({ not: 'an array' }));
    expect(getCourseProgress()).toEqual([]);
    localStorage.setItem(COURSE_PROGRESS_KEY, JSON.stringify([1, 2, 3]));
    expect(getCourseProgress()).toEqual([]); // array of numbers, not strings
  });

  it('getFixitHistory falls back to [] on invalid JSON', () => {
    localStorage.setItem(FIXIT_HISTORY_KEY, 'nope');
    expect(getFixitHistory()).toEqual([]);
  });

  it('getReports falls back to [] on invalid JSON', () => {
    localStorage.setItem(REPORTS_KEY, 'nope');
    expect(getReports()).toEqual([]);
  });

  it('round-trips valid data', () => {
    setCourseProgress(['dp-m1', 'dp-m2']);
    expect(getCourseProgress()).toEqual(['dp-m1', 'dp-m2']);
  });

  it('getArticlesRead falls back to [] on invalid JSON', () => {
    localStorage.setItem(ARTICLES_READ_KEY, '{not json');
    expect(getArticlesRead()).toEqual([]);
    localStorage.setItem(ARTICLES_READ_KEY, JSON.stringify([1, 2, 3]));
    expect(getArticlesRead()).toEqual([]); // array of numbers, not strings
  });

  it('getArticlesRead round-trips valid data', () => {
    setArticlesRead(['bnpl-real-rules', 'bills-that-creep']);
    expect(getArticlesRead()).toEqual(['bnpl-real-rules', 'bills-that-creep']);
  });
});

describe('getTheme reads a raw string, not JSON', () => {
  it('reads the stored value directly without JSON.parse', () => {
    localStorage.setItem(THEME_KEY, 'light');
    expect(getTheme()).toBe('light');
    localStorage.setItem(THEME_KEY, 'dark');
    expect(getTheme()).toBe('dark');
  });

  it('falls back to dark for a missing or invalid value', () => {
    expect(getTheme()).toBe('dark'); // nothing stored
    localStorage.setItem(THEME_KEY, '"dark"'); // JSON-quoted -> not a valid raw enum value
    expect(getTheme()).toBe('dark'); // falls back, doesn't crash
    localStorage.setItem(THEME_KEY, 'purple');
    expect(getTheme()).toBe('dark');
  });
});

describe('write swallows quota/unavailable errors', () => {
  it('setCourseProgress does not throw when localStorage.setItem throws', () => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new DOMException('QuotaExceededError');
    };
    try {
      expect(() => setCourseProgress(['dp-m1'])).not.toThrow();
      expect(() => setTheme('light')).not.toThrow();
    } finally {
      Storage.prototype.setItem = original;
    }
  });

  it('getCourseProgress does not throw when localStorage.getItem throws', () => {
    const original = Storage.prototype.getItem;
    Storage.prototype.getItem = () => {
      throw new Error('blocked');
    };
    try {
      expect(getCourseProgress()).toEqual([]);
      expect(getTheme()).toBe('dark');
    } finally {
      Storage.prototype.getItem = original;
    }
  });
});
