import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useEffect } from "react";
import { api } from "../lib/api";

type Doc = {
  id: string;
  label: string;
  url: string;
  kind: string;
  version: number;
};

type Budget = {
  id: string;
  labour: number;
  material: number;
  other: number;
  currency: string;
  version: number;
};

type Handover = {
  id: string;
  asBuilt: string | null;
  spares: string | null;
  supportNotes: string | null;
  version: number;
};

export function ProjectWorkspacePanel({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const { data: budget, isLoading: bLoad } = useQuery({
    queryKey: ["budget", projectId],
    queryFn: () =>
      api<{ budget: Budget | null }>(
        "/api/projects/" + projectId + "/budget",
      ),
  });
  const { data: hand, isLoading: hLoad } = useQuery({
    queryKey: ["handover", projectId],
    queryFn: () =>
      api<{ handover: Handover | null }>(
        "/api/projects/" + projectId + "/handover",
      ),
  });
  const { data: docs, isLoading: dLoad } = useQuery({
    queryKey: ["documents", projectId],
    queryFn: () =>
      api<{ documents: Doc[] }>("/api/projects/" + projectId + "/documents"),
  });

  const [lab, setLab] = useState("");
  const [mat, setMat] = useState("");
  const [oth, setOth] = useState("");

  const [asBuilt, setAsBuilt] = useState("");
  const [spares, setSpares] = useState("");
  const [support, setSupport] = useState("");

  const [dLabel, setDLabel] = useState("");
  const [dUrl, setDUrl] = useState("");
  const [dKind, setDKind] = useState<"drawing" | "program" | "photo" | "other">(
    "other",
  );

  useEffect(() => {
    if (budget?.budget) {
      setLab(String(budget.budget.labour));
      setMat(String(budget.budget.material));
      setOth(String(budget.budget.other));
    }
  }, [budget?.budget?.id, budget?.budget?.version]);

  useEffect(() => {
    const h = hand?.handover;
    if (h) {
      setAsBuilt(h.asBuilt ?? "");
      setSpares(h.spares ?? "");
      setSupport(h.supportNotes ?? "");
    }
  }, [hand?.handover?.id, hand?.handover?.version]);

  async function saveBudget() {
    const body = {
      labour: Number(lab) || 0,
      material: Number(mat) || 0,
      other: Number(oth) || 0,
    };
    await api("/api/projects/" + projectId + "/budget", {
      method: "PUT",
      body: JSON.stringify(body),
    });
    await qc.invalidateQueries({ queryKey: ["budget", projectId] });
  }

  async function saveHandover() {
    await api("/api/projects/" + projectId + "/handover", {
      method: "PUT",
      body: JSON.stringify({
        asBuilt: asBuilt || null,
        spares: spares || null,
        supportNotes: support || null,
      }),
    });
    await qc.invalidateQueries({ queryKey: ["handover", projectId] });
  }

  async function addDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!dLabel.trim() || !dUrl.trim()) {
      return;
    }
    try {
      new URL(dUrl);
    } catch {
      return;
    }
    await api("/api/documents", {
      method: "POST",
      body: JSON.stringify({
        projectId,
        kind: dKind,
        label: dLabel.trim(),
        url: dUrl.trim(),
      }),
    });
    setDLabel("");
    setDUrl("");
    await qc.invalidateQueries({ queryKey: ["documents", projectId] });
  }

  if (bLoad || hLoad || dLoad) {
    return <p className="text-slate-500">Loading…</p>;
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <section>
        <h2 className="text-lg font-semibold mb-2">Budget (plan)</h2>
        <p className="text-sm text-slate-500 mb-2">
          Labour / material / other in base currency. Compare to actuals from
          time × rates in reporting later.
        </p>
        <div className="grid grid-cols-3 gap-2 max-w-md">
          <div>
            <label className="text-xs text-slate-500">Labour</label>
            <input
              className="border rounded px-2 py-1 w-full"
              value={lab}
              onChange={(e) => setLab(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Material</label>
            <input
              className="border rounded px-2 py-1 w-full"
              value={mat}
              onChange={(e) => setMat(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Other</label>
            <input
              className="border rounded px-2 py-1 w-full"
              value={oth}
              onChange={(e) => setOth(e.target.value)}
            />
          </div>
        </div>
        <button
          type="button"
          onClick={() => void saveBudget()}
          className="mt-2 px-3 py-1.5 bg-slate-800 text-white rounded text-sm"
        >
          Save budget
        </button>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Handover</h2>
        <div className="space-y-2">
          <div>
            <label className="text-xs text-slate-500">As-built / notes</label>
            <textarea
              className="border rounded px-2 py-1 w-full min-h-[80px] text-sm"
              value={asBuilt}
              onChange={(e) => setAsBuilt(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Spares</label>
            <textarea
              className="border rounded px-2 py-1 w-full min-h-[60px] text-sm"
              value={spares}
              onChange={(e) => setSpares(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500">Support</label>
            <textarea
              className="border rounded px-2 py-1 w-full min-h-[60px] text-sm"
              value={support}
              onChange={(e) => setSupport(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => void saveHandover()}
            className="px-3 py-1.5 bg-slate-800 text-white rounded text-sm"
          >
            Save handover
          </button>
        </div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-2">Document links</h2>
        <p className="text-sm text-slate-500 mb-2">Links to SharePoint, drawings, etc.</p>
        <form onSubmit={(e) => void addDocument(e)} className="flex flex-wrap gap-2 mb-4">
          <select
            className="border rounded text-sm"
            value={dKind}
            onChange={(e) => setDKind(e.target.value as typeof dKind)}
          >
            <option value="drawing">Drawing</option>
            <option value="program">Program</option>
            <option value="photo">Photo</option>
            <option value="other">Other</option>
          </select>
          <input
            className="border rounded px-2 py-1 flex-1 min-w-[120px] text-sm"
            placeholder="Label"
            value={dLabel}
            onChange={(e) => setDLabel(e.target.value)}
          />
          <input
            className="border rounded px-2 py-1 flex-1 min-w-[200px] text-sm"
            placeholder="https://…"
            value={dUrl}
            onChange={(e) => setDUrl(e.target.value)}
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-slate-200 rounded text-sm"
          >
            Add
          </button>
        </form>
        <ul className="space-y-1 text-sm">
          {(docs?.documents ?? []).map((d) => (
            <li key={d.id}>
              <a
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-700 hover:underline"
              >
                {d.label}
              </a>{" "}
              <span className="text-slate-400">({d.kind})</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
