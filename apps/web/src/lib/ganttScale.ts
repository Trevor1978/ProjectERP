/** Scale frappe-gantt to fit `daysVisible` across the viewport without overlapping headers. */

export type GanttScale = {
  viewMode: "Day" | "Week" | "Month";
  columnWidth: number;
  step: number;
  /** Human-readable unit for the status line */
  unit: "days" | "weeks" | "months";
  /** Approximate count of columns across the viewport */
  columnsOnScreen: number;
};

const MIN_PX_PER_DAY = 24;
const MIN_PX_PER_WEEK = 32;
const MIN_PX_PER_MONTH = 56;

export function resolveGanttScale(
  viewportWidth: number,
  daysVisible: number,
): GanttScale {
  if (viewportWidth <= 0) {
    return {
      viewMode: "Day",
      columnWidth: 38,
      step: 24,
      unit: "days",
      columnsOnScreen: daysVisible,
    };
  }

  const pxPerDay = viewportWidth / daysVisible;

  if (pxPerDay >= MIN_PX_PER_DAY) {
    return {
      viewMode: "Day",
      columnWidth: Math.floor(pxPerDay),
      step: 24,
      unit: "days",
      columnsOnScreen: daysVisible,
    };
  }

  const pxPerWeek = pxPerDay * 7;
  const weeksVisible = daysVisible / 7;
  if (pxPerWeek >= MIN_PX_PER_WEEK) {
    return {
      viewMode: "Week",
      columnWidth: Math.max(MIN_PX_PER_WEEK, Math.floor(viewportWidth / weeksVisible)),
      step: 24 * 7,
      unit: "weeks",
      columnsOnScreen: weeksVisible,
    };
  }

  const monthsVisible = Math.max(1, daysVisible / 30);
  return {
    viewMode: "Month",
    columnWidth: Math.max(MIN_PX_PER_MONTH, Math.floor(viewportWidth / monthsVisible)),
    step: 24 * 30,
    unit: "months",
    columnsOnScreen: monthsVisible,
  };
}

/** Reduce day-number clutter when columns are still fairly tight. */
export function thinGanttDayLabels(root: HTMLElement, columnWidth: number): void {
  if (columnWidth >= 32) return;

  const labels = root.querySelectorAll<SVGTextElement>(".lower-text");
  labels.forEach((el) => {
    const day = Number(el.textContent);
    if (!Number.isFinite(day) || day <= 0) return;

    const show =
      day === 1 ||
      (columnWidth < 26 ? day % 7 === 0 : day % 5 === 0);

    if (!show) {
      el.classList.add("hide");
    }
  });
}
