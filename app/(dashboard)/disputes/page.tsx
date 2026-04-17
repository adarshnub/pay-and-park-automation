import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { cn } from "@/src/lib/utils";
import { formatPlateDisplay } from "@/src/lib/plate";
import { DisputeRowActions } from "@/src/components/disputes/dispute-row-actions";
import { AlertTriangle } from "lucide-react";
import { format } from "date-fns";

type DisputeRow = {
  id: string;
  normalized_plate: string;
  employee_note: string | null;
  status: string;
  created_at: string;
  intended_parking_lot_id: string;
  conflicting_visit_id: string;
};

type VisitRow = {
  id: string;
  parking_lot_id: string;
  status: string;
  check_in_at: string;
};

function statusBadgeVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  switch (status) {
    case "open":
      return "outline";
    case "resolved":
      return "default";
    case "dismissed":
      return "secondary";
    default:
      return "secondary";
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "open":
      return "Open";
    case "resolved":
      return "Resolved";
    case "dismissed":
      return "Left as is";
    default:
      return status;
  }
}

async function getDisputes(filter: "open" | "all") {
  try {
    const supabase = await createClient();
    let q = supabase
      .from("check_in_disputes")
      .select(
        "id, normalized_plate, employee_note, status, created_at, intended_parking_lot_id, conflicting_visit_id",
      )
      .order("created_at", { ascending: false });

    if (filter === "open") {
      q = q.eq("status", "open");
    }

    const { data: disputes, error } = await q;
    if (error || !disputes?.length) {
      return { rows: [] as DisputeRow[], lotNames: new Map<string, string>(), visits: new Map<string, VisitRow>() };
    }

    const rows = disputes as DisputeRow[];
    const visitIds = [...new Set(rows.map((d) => d.conflicting_visit_id))];
    const { data: visitRows } = await supabase
      .from("visits")
      .select("id, parking_lot_id, status, check_in_at")
      .in("id", visitIds);

    const visits = new Map<string, VisitRow>(
      (visitRows as VisitRow[] | null)?.map((v) => [v.id, v]) ?? [],
    );

    const lotIds = new Set<string>();
    for (const d of rows) {
      lotIds.add(d.intended_parking_lot_id);
      const v = visits.get(d.conflicting_visit_id);
      if (v) lotIds.add(v.parking_lot_id);
    }

    const { data: lots } = await supabase
      .from("parking_lots")
      .select("id, name")
      .in("id", [...lotIds]);

    const lotNames = new Map(
      (lots ?? []).map((l) => [l.id as string, l.name as string]),
    );

    return { rows, lotNames, visits };
  } catch {
    return {
      rows: [] as DisputeRow[],
      lotNames: new Map<string, string>(),
      visits: new Map<string, VisitRow>(),
    };
  }
}

export default async function DisputesPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const filter = params.view === "all" ? "all" : "open";
  const { rows, lotNames, visits } = await getDisputes(filter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Check-in disputes
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Raised from shareable lot links when a plate is already checked in
            elsewhere. Resolve after you fix the situation, or dismiss to close
            without changing visits.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Link
            href="/disputes"
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              filter === "open"
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                : "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
            )}
          >
            Open
          </Link>
          <Link
            href="/disputes?view=all"
            className={cn(
              "inline-flex h-10 items-center justify-center rounded-lg px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              filter === "all"
                ? "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90"
                : "border border-border bg-transparent hover:bg-accent hover:text-accent-foreground",
            )}
          >
            All
          </Link>
        </div>
      </div>

      {rows.length === 0 ? (
        <Card className="p-12 text-center">
          <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">
            {filter === "open" ? "No open disputes" : "No disputes yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {filter === "open"
              ? "When staff report a conflict from a shared link, it will show up here."
              : "Disputes will appear here after they are submitted from a lot link."}
          </p>
          {filter === "open" && (
            <Link
              href="/disputes?view=all"
              className="mt-2 inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              View all disputes
            </Link>
          )}
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Reported
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Plate
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Tried at
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Active at
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Note
                </th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                  Status
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const visit = visits.get(d.conflicting_visit_id);
                const intendedName =
                  lotNames.get(d.intended_parking_lot_id) ?? "—";
                const activeLotId = visit?.parking_lot_id;
                const activeName = activeLotId
                  ? (lotNames.get(activeLotId) ?? "—")
                  : "—";
                const visitStatus = visit?.status ?? "—";

                return (
                  <tr
                    key={d.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 text-muted-foreground">
                      {format(new Date(d.created_at), "MMM d, yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold">
                      {formatPlateDisplay(d.normalized_plate)}
                    </td>
                    <td className="px-4 py-3">{intendedName}</td>
                    <td className="px-4 py-3">
                      <div>{activeName}</div>
                      {visit && (
                        <div className="text-xs text-muted-foreground">
                          Visit {visitStatus.replaceAll("_", " ")}
                        </div>
                      )}
                    </td>
                    <td className="max-w-[200px] px-4 py-3 text-muted-foreground">
                      {d.employee_note?.trim() ? (
                        <span className="line-clamp-3">{d.employee_note}</span>
                      ) : (
                        <span className="italic">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={statusBadgeVariant(d.status)}>
                        {statusLabel(d.status)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {d.status === "open" ? (
                        <DisputeRowActions disputeId={d.id} />
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
