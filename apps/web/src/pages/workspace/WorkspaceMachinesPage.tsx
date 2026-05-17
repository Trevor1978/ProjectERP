import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../lib/api";
import { WorkspaceDetailChrome } from "./WorkspaceDetailChrome";

type Asset = {
  id: string;
  name: string;
  site: string;
  line: string;
  serial: string | null;
};

export function WorkspaceMachinesPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["assets"],
    queryFn: () => api<{ assets: Asset[] }>("/api/assets"),
  });

  const assets = data?.assets ?? [];

  return (
    <WorkspaceDetailChrome backTo="/" backLabel="← Home" title="Machines">
      <p className="mb-4 text-sm text-tesla-text-secondary">
        Track equipment and open a machine to view service history or send a customer report.
      </p>
      {isLoading ? (
        <p className="text-tesla-text-secondary">Loading…</p>
      ) : assets.length === 0 ? (
        <p className="text-tesla-text-secondary">No machines yet. Org admins can add machines from a machine detail page.</p>
      ) : (
        <div className="overflow-hidden rounded-sm border border-tesla-border">
          <table className="w-full text-sm">
            <thead className="bg-tesla-muted text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Site</th>
                <th className="px-3 py-2 font-medium">Line</th>
                <th className="px-3 py-2 font-medium">Serial</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-t border-tesla-border hover:bg-tesla-muted/50">
                  <td className="px-3 py-2">
                    <Link to={`/workspace/machines/${a.id}`} className="font-medium text-tesla-text underline-offset-2 hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-tesla-text-secondary">{a.site}</td>
                  <td className="px-3 py-2 text-tesla-text-secondary">{a.line}</td>
                  <td className="px-3 py-2 text-tesla-text-secondary">{a.serial ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkspaceDetailChrome>
  );
}
