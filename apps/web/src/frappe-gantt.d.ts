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
    column_width?: number;
    step?: number;
    on_click?: (task: GanttTask | null) => void;
    on_date_change?: (
      task: GanttTask,
      start: Date,
      end: Date,
    ) => void;
    on_progress_change?: (task: GanttTask, progress: number) => void;
  };
  class Gantt {
    options: {
      column_width: number;
      view_mode: string;
      step: number;
    };
    constructor(
      wrapper: string | HTMLElement,
      tasks: GanttTask[],
      options?: GanttOptions,
    );
    render(): void;
  }
  export default Gantt;
}
