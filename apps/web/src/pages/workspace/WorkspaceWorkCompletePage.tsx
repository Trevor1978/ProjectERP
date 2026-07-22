import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../lib/api";
import { isoToLocal, localToIso } from "../../workspace/workspaceDates";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";

type WorkType = "machine" | "customer_service";

type Client = { id: string; name: string };
type Asset = {
  id: string;
  name: string;
  site: string;
  line: string;
  clientId: string | null;
};
type Project = { id: string; name: string; clientId: string; code: string | null };
type Task = { id: string; title: string; projectId: string };

type Draft = {
  workType: WorkType;
  rawNotes: string;
  clientId: string | null;
  assetId: string | null;
  projectId: string | null;
  taskId: string | null;
  createNewTask: boolean;
  newTaskTitle: string | null;
  timeEntry: {
    startedAt: string | null;
    endedAt: string | null;
    durationMinutes: number | null;
    note: string | null;
  };
  serviceLog: {
    title: string;
    description: string | null;
    performedAt: string | null;
    technicianName: string | null;
  };
  reportMarkdown: string;
};

const selectClass =
  "mt-1 w-full rounded-sm border border-tesla-border bg-white px-2 py-1.5 text-sm";
const inputClass =
  "mt-1 w-full rounded-sm border border-tesla-border px-2 py-1.5 text-sm";
const labelClass = "block text-xs font-medium text-tesla-text-secondary";

export function WorkspaceWorkCompletePage() {
  const nav = useNavigate();
  const [step, setStep] = useState<"entry" | "review">("entry");
  const [workType, setWorkType] = useState<WorkType>("customer_service");
  const [notes, setNotes] = useState("");
  const [entryClientId, setEntryClientId] = useState("");
  const [entryAssetId, setEntryAssetId] = useState("");
  const [parsing, setParsing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft | null>(null);
  const [createNewTask, setCreateNewTask] = useState(false);

  const { data: clientsData } = useQuery({
    queryKey: ["clients"],
    queryFn: () => api<{ clients: Client[] }>("/api/clients"),
  });
  const { data: assetsData } = useQuery({
    queryKey: ["assets"],
    queryFn: () => api<{ assets: Asset[] }>("/api/assets"),
  });
  const { data: projectsData } = useQuery({
    queryKey: ["projects"],
    queryFn: () => api<{ projects: Project[] }>("/api/projects"),
  });
  const projectId = draft?.projectId ?? "";
  const { data: tasksData } = useQuery({
    queryKey: ["tasks", projectId],
    queryFn: () =>
      api<{ tasks: Task[] }>(
        projectId
          ? `/api/tasks?projectId=${encodeURIComponent(projectId)}`
          : "/api/tasks",
      ),
    enabled: step === "review",
  });

  const clients = clientsData?.clients ?? [];
  const assets = assetsData?.assets ?? [];
  const projects = projectsData?.projects ?? [];
  const tasks = tasksData?.tasks ?? [];

  const entryMachines = useMemo(() => {
    if (workType === "customer_service" && entryClientId) {
      return assets.filter((a) => a.clientId === entryClientId);
    }
    return assets;
  }, [assets, workType, entryClientId]);

  const reviewMachines = useMemo(() => {
    if (!draft) return [];
    if (draft.workType === "customer_service" && draft.clientId) {
      return assets.filter((a) => a.clientId === draft.clientId);
    }
    return assets;
  }, [assets, draft]);

  async function processWithAi() {
    setErr(null);
    setParsing(true);
    try {
      const res = await api<{ draft: Draft }>("/api/work-complete/parse", {
        method: "POST",
        body: JSON.stringify({
          workType,
          notes: notes.trim(),
          clientId: entryClientId || null,
          assetId: entryAssetId || null,
        }),
      });
      setDraft(res.draft);
      setCreateNewTask(res.draft.createNewTask || !res.draft.taskId);
      setStep("review");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Parse failed");
    } finally {
      setParsing(false);
    }
  }

  async function confirmSave() {
    if (!draft) return;
    setErr(null);
    if (!draft.assetId) {
      setErr("Select a machine");
      return;
    }
    if (!draft.projectId) {
      setErr("Select a project");
      return;
    }
    if (draft.workType === "customer_service" && !draft.clientId) {
      setErr("Select a customer");
      return;
    }
    if (!createNewTask && !draft.taskId) {
      setErr("Select a task or create a new one");
      return;
    }
    if (createNewTask && !draft.newTaskTitle?.trim()) {
      setErr("Enter a title for the new task");
      return;
    }
    if (!draft.serviceLog.title.trim()) {
      setErr("Service log title is required");
      return;
    }
    if (!draft.reportMarkdown.trim()) {
      setErr("Report markdown is required");
      return;
    }

    setConfirming(true);
    try {
      const res = await api<{ assetId: string; log: { id: string } }>(
        "/api/work-complete/confirm",
        {
          method: "POST",
          body: JSON.stringify({
            workType: draft.workType,
            rawNotes: draft.rawNotes,
            clientId: draft.clientId,
            assetId: draft.assetId,
            projectId: draft.projectId,
            taskId: createNewTask ? null : draft.taskId,
            newTask: createNewTask
              ? { title: draft.newTaskTitle!.trim() }
              : null,
            timeEntry: {
              startedAt: draft.timeEntry.startedAt,
              endedAt: draft.timeEntry.endedAt,
              durationMinutes: draft.timeEntry.durationMinutes,
              note: draft.timeEntry.note,
            },
            serviceLog: {
              title: draft.serviceLog.title.trim(),
              description: draft.serviceLog.description,
              performedAt: draft.serviceLog.performedAt,
              technicianName: draft.serviceLog.technicianName,
            },
            reportMarkdown: draft.reportMarkdown,
          }),
        },
      );
      nav(`/workspace/machines/${res.assetId}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally {
      setConfirming(false);
    }
  }

  function patchDraft(partial: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...partial } : d));
  }

  return (
    <WorkspaceDetailChrome backTo="/" backLabel="← Home" title="Log work">
      <p className="mb-4 text-sm text-tesla-text-secondary">
        Enter what you did in plain language. AI drafts the timesheet, machine
        history, and Spantec service report — review and edit before saving.
      </p>

      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}

      {step === "entry" && (
        <div className="max-w-2xl space-y-4">
          <fieldset>
            <legend className={labelClass}>Work type</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="workType"
                  checked={workType === "machine"}
                  onChange={() => {
                    setWorkType("machine");
                    setEntryClientId("");
                    setEntryAssetId("");
                  }}
                />
                Machine work
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="workType"
                  checked={workType === "customer_service"}
                  onChange={() => {
                    setWorkType("customer_service");
                    setEntryAssetId("");
                  }}
                />
                Service call (customer)
              </label>
            </div>
          </fieldset>

          {workType === "customer_service" && (
            <div>
              <label className={labelClass}>Customer (optional pre-select)</label>
              <select
                className={selectClass}
                value={entryClientId}
                onChange={(e) => {
                  setEntryClientId(e.target.value);
                  setEntryAssetId("");
                }}
              >
                <option value="">—</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>
                    {cl.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className={labelClass}>Machine (optional pre-select)</label>
            <select
              className={selectClass}
              value={entryAssetId}
              onChange={(e) => setEntryAssetId(e.target.value)}
            >
              <option value="">—</option>
              {entryMachines.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.site}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Work details</label>
            <textarea
              className={inputClass}
              rows={12}
              placeholder="Describe the visit: site, times on site, faults, what you inspected, findings, actions, parts, recommendations…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <button
            type="button"
            disabled={parsing || !notes.trim()}
            className="rounded-sm bg-tesla-text px-4 py-2 text-sm text-white disabled:opacity-50"
            onClick={() => void processWithAi()}
          >
            {parsing ? "Processing…" : "Process with AI"}
          </button>
        </div>
      )}

      {step === "review" && draft && (
        <div className="max-w-3xl space-y-5">
          <button
            type="button"
            className="text-sm text-blue-700 underline"
            onClick={() => setStep("entry")}
          >
            ← Back to notes
          </button>

          <fieldset>
            <legend className={labelClass}>Work type</legend>
            <div className="mt-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draft.workType === "machine"}
                  onChange={() =>
                    patchDraft({ workType: "machine", clientId: draft.clientId })
                  }
                />
                Machine work
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={draft.workType === "customer_service"}
                  onChange={() => patchDraft({ workType: "customer_service" })}
                />
                Service call (customer)
              </label>
            </div>
          </fieldset>

          <div className="grid gap-3 sm:grid-cols-2">
            {(draft.workType === "customer_service" || draft.clientId) && (
              <div>
                <label className={labelClass}>Customer</label>
                <select
                  className={selectClass}
                  value={draft.clientId ?? ""}
                  onChange={(e) =>
                    patchDraft({
                      clientId: e.target.value || null,
                      assetId: null,
                    })
                  }
                >
                  <option value="">—</option>
                  {clients.map((cl) => (
                    <option key={cl.id} value={cl.id}>
                      {cl.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className={labelClass}>Machine</label>
              <select
                className={selectClass}
                value={draft.assetId ?? ""}
                onChange={(e) =>
                  patchDraft({ assetId: e.target.value || null })
                }
              >
                <option value="">—</option>
                {reviewMachines.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} · {a.site}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Project</label>
              <select
                className={selectClass}
                value={draft.projectId ?? ""}
                onChange={(e) =>
                  patchDraft({
                    projectId: e.target.value || null,
                    taskId: null,
                  })
                }
              >
                <option value="">—</option>
                {projects.map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.name}
                    {pr.code ? ` (${pr.code})` : ""}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="rounded-sm border border-tesla-border p-3">
            <p className="mb-2 text-sm font-medium text-tesla-text">Task</p>
            <div className="mb-2 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={!createNewTask}
                  onChange={() => setCreateNewTask(false)}
                />
                Existing task
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  checked={createNewTask}
                  onChange={() => setCreateNewTask(true)}
                />
                Create new task
              </label>
            </div>
            {!createNewTask ? (
              <select
                className={selectClass}
                value={draft.taskId ?? ""}
                onChange={(e) =>
                  patchDraft({ taskId: e.target.value || null })
                }
              >
                <option value="">—</option>
                {tasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className={inputClass}
                placeholder="New task title"
                value={draft.newTaskTitle ?? ""}
                onChange={(e) => patchDraft({ newTaskTitle: e.target.value })}
              />
            )}
          </div>

          <div className="rounded-sm border border-tesla-border p-3">
            <p className="mb-2 text-sm font-medium text-tesla-text">Timesheet</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>Started</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={isoToLocal(draft.timeEntry.startedAt)}
                  onChange={(e) =>
                    patchDraft({
                      timeEntry: {
                        ...draft.timeEntry,
                        startedAt: localToIso(e.target.value),
                      },
                    })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Ended</label>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={isoToLocal(draft.timeEntry.endedAt)}
                  onChange={(e) =>
                    patchDraft({
                      timeEntry: {
                        ...draft.timeEntry,
                        endedAt: localToIso(e.target.value),
                      },
                    })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Duration (minutes)</label>
                <input
                  type="number"
                  min={1}
                  className={inputClass}
                  value={draft.timeEntry.durationMinutes ?? ""}
                  onChange={(e) =>
                    patchDraft({
                      timeEntry: {
                        ...draft.timeEntry,
                        durationMinutes: e.target.value
                          ? Number(e.target.value)
                          : null,
                      },
                    })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClass}>Note</label>
                <textarea
                  className={inputClass}
                  rows={2}
                  value={draft.timeEntry.note ?? ""}
                  onChange={(e) =>
                    patchDraft({
                      timeEntry: {
                        ...draft.timeEntry,
                        note: e.target.value || null,
                      },
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="rounded-sm border border-tesla-border p-3">
            <p className="mb-2 text-sm font-medium text-tesla-text">
              Service history
            </p>
            <div className="grid gap-3">
              <div>
                <label className={labelClass}>Title</label>
                <input
                  className={inputClass}
                  value={draft.serviceLog.title}
                  onChange={(e) =>
                    patchDraft({
                      serviceLog: {
                        ...draft.serviceLog,
                        title: e.target.value,
                      },
                    })
                  }
                />
              </div>
              <div>
                <label className={labelClass}>Description</label>
                <textarea
                  className={inputClass}
                  rows={3}
                  value={draft.serviceLog.description ?? ""}
                  onChange={(e) =>
                    patchDraft({
                      serviceLog: {
                        ...draft.serviceLog,
                        description: e.target.value || null,
                      },
                    })
                  }
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Performed at</label>
                  <input
                    type="datetime-local"
                    className={inputClass}
                    value={isoToLocal(draft.serviceLog.performedAt)}
                    onChange={(e) =>
                      patchDraft({
                        serviceLog: {
                          ...draft.serviceLog,
                          performedAt: localToIso(e.target.value),
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className={labelClass}>Technician</label>
                  <input
                    className={inputClass}
                    value={draft.serviceLog.technicianName ?? ""}
                    onChange={(e) =>
                      patchDraft({
                        serviceLog: {
                          ...draft.serviceLog,
                          technicianName: e.target.value || null,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className={labelClass}>Service report (markdown)</label>
            <textarea
              className={inputClass + " font-mono text-xs"}
              rows={18}
              value={draft.reportMarkdown}
              onChange={(e) => patchDraft({ reportMarkdown: e.target.value })}
            />
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={confirming}
              className="rounded-sm bg-tesla-text px-4 py-2 text-sm text-white disabled:opacity-50"
              onClick={() => void confirmSave()}
            >
              {confirming ? "Saving…" : "Confirm & save"}
            </button>
          </div>
        </div>
      )}
    </WorkspaceDetailChrome>
  );
}
