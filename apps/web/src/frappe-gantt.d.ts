declare module "frappe-gantt" {
  export type GanttTask = {
    id: string;
    name: string;
    start: string;
    end: string;
    progress: number;
    dependencies?: string;
  };
  export type GanttOptions = {
    view_mode?: string;
    on_click?: (task: GanttTask) => void;
    on_date_change?: (
      task: GanttTask,
      start: Date,
      end: Date,
    ) => void;
    on_progress_change?: (task: GanttTask, progress: number) => void;
  };
  class Gantt {
    constructor(
      wrapper: string | HTMLElement,
      tasks: GanttTask[],
      options?: GanttOptions,
    );
  }
  export default Gantt;
}
