import { Link } from "react-router-dom";
import {
  StackedList,
  StackedListEmpty,
  StackedListHeading,
  StackedListRow,
  StackedMetaGrid,
  StackedMetaItem,
  StackedTypeBadge,
  formatStackedDateTime,
} from "./StackedDataList";

export type MachineOutstandingTask = {
  id: string;
  title: string;
  projectId: string;
  projectName: string;
  assigneeName: string | null;
  percentComplete: number;
  endAt: string | null;
};

export type MachineOutstandingTodo = {
  id: string;
  title: string;
  taskId: string;
  taskTitle: string;
  projectId: string;
  projectName: string;
  status: string;
  dueAt: string | null;
  assigneeName: string | null;
  linkSource: "todo" | "task";
};

export function MachineOutstandingWorkList({
  tasks,
  todos,
  loading,
}: {
  tasks: MachineOutstandingTask[];
  todos: MachineOutstandingTodo[];
  loading?: boolean;
}) {
  if (loading) {
    return <StackedListEmpty>Loading…</StackedListEmpty>;
  }

  if (tasks.length === 0 && todos.length === 0) {
    return (
      <StackedListEmpty>No outstanding tasks or todos on this machine.</StackedListEmpty>
    );
  }

  return (
    <StackedList>
      {tasks.map((t) => (
        <StackedListRow key={`task-${t.id}`}>
          <StackedListHeading
            badge={<StackedTypeBadge tone="slate">Task</StackedTypeBadge>}
            title={
              <Link
                to={`/workspace/tasks/${t.id}`}
                className="underline-offset-2 hover:underline"
              >
                {t.title}
              </Link>
            }
          />
          <StackedMetaGrid>
            <StackedMetaItem label="Project">
              <Link
                to={`/workspace/projects/${t.projectId}`}
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                {t.projectName}
              </Link>
            </StackedMetaItem>
            <StackedMetaItem label="Assignee">{t.assigneeName ?? "—"}</StackedMetaItem>
            <StackedMetaItem label="Progress">
              {Math.round(t.percentComplete)}% complete
            </StackedMetaItem>
            <StackedMetaItem label="End">{formatStackedDateTime(t.endAt)}</StackedMetaItem>
            <StackedMetaItem label="Machine link">On task</StackedMetaItem>
          </StackedMetaGrid>
        </StackedListRow>
      ))}
      {todos.map((td) => (
        <StackedListRow key={`todo-${td.id}`}>
          <StackedListHeading
            badge={<StackedTypeBadge tone="amber">Todo</StackedTypeBadge>}
            title={
              <Link
                to={`/workspace/todos/${td.id}`}
                className="underline-offset-2 hover:underline"
              >
                {td.title}
              </Link>
            }
          />
          <StackedMetaGrid>
            <StackedMetaItem label="Task">
              <Link
                to={`/workspace/tasks/${td.taskId}`}
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                {td.taskTitle}
              </Link>
            </StackedMetaItem>
            <StackedMetaItem label="Project">
              <Link
                to={`/workspace/projects/${td.projectId}`}
                className="text-blue-700 underline-offset-2 hover:underline"
              >
                {td.projectName}
              </Link>
            </StackedMetaItem>
            <StackedMetaItem label="Assignee">{td.assigneeName ?? "—"}</StackedMetaItem>
            <StackedMetaItem label="Status">
              {td.status.replaceAll("_", " ")}
            </StackedMetaItem>
            <StackedMetaItem label="Due">{formatStackedDateTime(td.dueAt)}</StackedMetaItem>
            <StackedMetaItem label="Machine link">
              {td.linkSource === "task" ? "Inherited from task" : "Set on todo"}
            </StackedMetaItem>
          </StackedMetaGrid>
        </StackedListRow>
      ))}
    </StackedList>
  );
}