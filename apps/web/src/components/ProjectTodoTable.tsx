import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  createColumnHelper,
} from "@tanstack/react-table";
import { useState, useMemo } from "react";
import type { Task, Todo } from "../types";
import { api } from "../lib/api";

const helper = createColumnHelper<Todo>();

function ClickEdit({
  value,
  onSave,
}: {
  value: string;
  onSave: (v: string) => Promise<void>;
}) {
  const [v, setV] = useState(value);
  const [edit, setEdit] = useState(false);
  if (edit) {
    return (
      <input
        className="w-full border rounded px-1"
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={async () => {
          setEdit(false);
          if (v !== value) {
            await onSave(v);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            (e.target as HTMLInputElement).blur();
          }
        }}
        autoFocus
      />
    );
  }
  return (
    <button
      type="button"
      className="text-left w-full"
      onClick={() => {
        setV(value);
        setEdit(true);
      }}
    >
      {value}
    </button>
  );
}

export function ProjectTodoTable({
  tasks,
  todos,
  onChange,
}: {
  tasks: Task[];
  todos: Todo[];
  onChange: () => void;
}) {
  const [newTitle, setNewTitle] = useState("");
  const [taskForNew, setTaskForNew] = useState(tasks[0]?.id ?? "");

  const taskMap = useMemo(
    () => new Map(tasks.map((t) => [t.id, t.title] as const)),
    [tasks],
  );

  const columns = useMemo(
    () => [
      helper.accessor((row) => taskMap.get(row.taskId) ?? "—", {
        id: "taskTitle",
        header: "Task",
        cell: (ctx) => <span className="text-slate-700">{ctx.getValue()}</span>,
      }),
      helper.accessor("title", {
        header: "Todo",
        cell: (ctx) => (
          <ClickEdit
            value={ctx.getValue()}
            onSave={async (v) => {
              const row = ctx.row.original;
              await api("/api/todos/" + row.id, {
                method: "PATCH",
                body: JSON.stringify({ title: v, version: row.version }),
              });
              onChange();
            }}
          />
        ),
      }),
    ],
    [taskMap, onChange],
  );

  const table = useReactTable({
    data: todos,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  if (tasks.length === 0) {
    return <p className="text-slate-500">Add tasks first (Milestones tab).</p>;
  }

  return (
    <div className="space-y-2">
      <div className="overflow-x-auto border rounded">
        <table className="w-full text-sm">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="bg-slate-100 text-left">
                {hg.headers.map((h) => (
                  <th key={h.id} className="p-2 font-medium">
                    {h.isPlaceholder
                      ? null
                      : flexRender(
                          h.column.columnDef.header,
                          h.getContext(),
                        )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="border-t">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="p-2">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            <tr className="border-t bg-slate-50">
              <td className="p-2">
                <select
                  className="w-full border rounded"
                  value={taskForNew}
                  onChange={(e) => setTaskForNew(e.target.value)}
                >
                  {tasks.map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.title}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <input
                  className="w-full border rounded px-1"
                  placeholder="New todo, Enter to save"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter" && newTitle.trim() && taskForNew) {
                      await api("/api/todos", {
                        method: "POST",
                        body: JSON.stringify({
                          taskId: taskForNew,
                          title: newTitle.trim(),
                          status: "backlog",
                        }),
                      });
                      setNewTitle("");
                      onChange();
                    }
                  }}
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
