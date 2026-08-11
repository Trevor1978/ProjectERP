import { useState } from "react";
import {
  DndContext,
  type DragEndEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { Task, Todo } from "../types";
import { api } from "../lib/api";

const cols = [
  { id: "backlog", label: "Backlog" },
  { id: "in_progress", label: "In progress" },
  { id: "blocked", label: "Blocked" },
  { id: "testing", label: "Testing" },
  { id: "done", label: "Done" },
  { id: "cancelled", label: "Cancelled" },
] as const;

type ColId = (typeof cols)[number]["id"];

function ColDrop({ id, children }: { id: string; children: React.ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={
        "min-h-[120px] flex-1 min-w-[200px] rounded p-2 " +
        (isOver ? "ring-2 ring-slate-400" : "bg-slate-100")
      }
    >
      {children}
    </div>
  );
}

function Card({
  todo,
  taskTitle,
  onUpdate,
}: {
  todo: Todo;
  taskTitle: string;
  onUpdate: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable(
    { id: todo.id },
  );
  const [title, setTitle] = useState(todo.title);
  const [editing, setEditing] = useState(false);
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  async function save() {
    if (title === todo.title) {
      setEditing(false);
      return;
    }
    await api("/api/todos/" + todo.id, {
      method: "PATCH",
      body: JSON.stringify({ title, version: todo.version }),
    });
    setEditing(false);
    onUpdate();
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={
        "bg-white p-2 rounded border border-slate-200 text-sm mb-2 " +
        (isDragging ? "opacity-50" : "")
      }
    >
      <div className="text-xs text-slate-500 mb-1">{taskTitle}</div>
      {editing ? (
        <input
          className="w-full border rounded px-1"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          autoFocus
        />
      ) : (
        <button
          type="button"
          className="text-left w-full"
          onClick={() => setEditing(true)}
        >
          {todo.title}
        </button>
      )}
      <div
        className="text-xs text-slate-400 cursor-grab mt-1"
        {...listeners}
        {...attributes}
      >
        drag to column
      </div>
    </div>
  );
}

export function TodoKanban({
  projectId: _projectId,
  tasks,
  todos,
  onUpdate,
}: {
  projectId: string;
  tasks: Task[];
  todos: Todo[];
  onUpdate: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
  );

  const byCol = (status: ColId) =>
    todos
      .filter((t) => t.status === status)
      .sort((a, b) => a.orderIndex - b.orderIndex);

  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) {
      return;
    }
    const todo = todos.find((t) => t.id === String(active.id));
    if (!todo) {
      return;
    }
    const newStatus = cols.find((c) => c.id === String(over.id))?.id;
    if (!newStatus) {
      return;
    }
    if (newStatus === todo.status) {
      return;
    }
    await api("/api/todos/" + todo.id, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus, version: todo.version }),
    });
    onUpdate();
  }

  if (todos.length === 0) {
    return (
      <p className="text-slate-500 p-4 bg-slate-50 rounded border">
        No todos. Create with POST /api/todos (taskId, title) or a future form.
      </p>
    );
  }
  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="flex flex-wrap gap-2">
        {cols.map((col) => (
          <ColDrop key={col.id} id={col.id}>
            <h3 className="text-xs font-semibold uppercase text-slate-600 mb-2">
              {col.label} ({byCol(col.id).length})
            </h3>
            {byCol(col.id).map((todo) => (
              <Card
                key={todo.id}
                todo={todo}
                taskTitle={tasks.find((x) => x.id === todo.taskId)?.title ?? "?"}
                onUpdate={onUpdate}
              />
            ))}
          </ColDrop>
        ))}
      </div>
    </DndContext>
  );
}
