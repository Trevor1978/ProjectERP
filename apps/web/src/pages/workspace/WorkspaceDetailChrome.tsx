import { Link } from "react-router-dom";

export function WorkspaceDetailChrome({
  backTo,
  backLabel,
  title,
  children,
}: {
  backTo: string;
  backLabel: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-slate-200 pb-3">
        <Link to={backTo} className="text-sm font-medium text-blue-700 underline hover:text-blue-900">
          {backLabel}
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">{title}</h1>
      </div>
      {children}
    </div>
  );
}
