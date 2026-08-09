// Faithful port of src/islands/course-one.ts's renderSidebar()
// (course-one.ts:1262-1278) plus the #progress-sidebar markup
// (courseone.astro:104-113). `steps`/`currentStepIndex` are now derived
// values from useCourseState() instead of being recomputed here — this
// component only renders them.
import type { ProgressSidebarProps } from './CourseOne';

export function ProgressSidebar({ steps, currentStepIndex }: ProgressSidebarProps) {
  const total = steps.length;
  const doneCount = steps.filter((s) => s.done).length;
  const fillPct = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  return (
    <aside id="progress-sidebar" aria-label="Course progress">
      <div className="ps-card">
        <div className="ps-head">
          <strong>Progress</strong>
          <div className="ps-bar">
            <span id="ps-fill" style={{ width: `${fillPct}%` }} />
          </div>
        </div>
        <ol id="progress-list" className="ps-list">
          {steps.map((s, i) => {
            const className = [i < currentStepIndex ? 'ps-item--done' : '', i === currentStepIndex ? 'ps-item--current' : '', i > currentStepIndex ? 'ps-item--locked' : '']
              .join(' ')
              .trim();
            return (
              <li key={s.key} className={className || undefined}>
                <span className="ps-dot" aria-hidden="true" />
                <a href={s.section}>{s.label}</a>
              </li>
            );
          })}
        </ol>
      </div>
    </aside>
  );
}
