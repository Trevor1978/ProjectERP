import { useState } from "react";
import { api } from "../lib/api";
import type { Schedule } from "../types";

export function InlineMilestones({
  projectId,
  data: initial,
  onChange,
}: {
  projectId: string;
  data: Schedule;
  onChange: () => void;
}) {
  const [name, setName] = useState("");
  /** per-milestone draft for new task title */
  const [taskDraft, setTaskDraft] = useState<Record<string, string>>({});

  async function addMilestone() {
    if (!name.trim()) {
      return;
    }
    await api("/api/milestones", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        name: name.trim(),
        orderIndex: initial.milestones.length,
      }),
    });
    setName("");
    onChange();
  }

  async function addTask(milestoneId: string) {
    const title = (taskDraft[milestoneId] ?? "").trim();
    if (!title) {
      return;
    }
    await api("/api/tasks", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        milestoneId,
        title,
        orderIndex: initial.tasks.filter((t) => t.milestoneId === milestoneId)
          .length,
        useDerivedPercent: true,
        percentComplete: 0,
      }),
    });
    setTaskDraft((d) => ({ ...d, [milestoneId]: "" }));
    onChange();
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-2 items-end">
        <div>
          <label className="text-xs text-slate-500">New milestone</label>
          <input
            className="border rounded px-2 py-1 w-64 block"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void addMilestone();
              }
            }}
            placeholder="Name, Enter to add"
          />
        </div>
        <button
          type="button"
          onClick={() => void addMilestone()}
          className="px-3 py-1.5 bg-slate-800 text-white rounded text-sm"
        >
          Add
        </button>
      </div>
      {initial.milestones.map((m) => (
        <div key={m.id} className="border rounded p-3 bg-white">
          <div className="font-medium mb-2">{m.name}</div>
          <ul className="text-sm text-slate-600 list-disc pl-5 space-y-1 mb-3">
            {initial.tasks
              .filter((t) => t.milestoneId === m.id)
              .map((t) => (
                <li key={t.id}>
                  {t.title}
                  {t.estHours != null && (
                    <span className="text-slate-400">
                      {" "}
                      (est {t.estHours}h
                      {t.actualHours != null
                        ? `, act ${Number(t.actualHours).toFixed(1)}h`
                        : ""}
                      )
                    </span>
                  )}
                </li>
              ))}
          </ul>
          <div className="flex flex-wrap gap-2 items-center">
            <input
              className="border rounded px-2 py-1 flex-1 min-w-[200px] text-sm"
              value={taskDraft[m.id] ?? ""}
              onChange={(e) =>
                setTaskDraft((d) => ({ ...d, [m.id]: e.target.value }))
              }
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void addTask(m.id);
                }
              }}
              placeholder="New task title, Enter to add"
            />
            <button
              type="button"
              className="text-sm px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded border"
              onClick={() => void addTask(m.id)}
            >
              Add task
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
