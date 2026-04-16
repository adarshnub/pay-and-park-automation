import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { formatPlateDisplay } from "@/src/lib/plate";
import { formatCurrency, formatDuration } from "@/src/lib/utils";
import { ClipboardList, ChevronLeft, ChevronRight } from "lucide-react";
import type { Visit } from "@/src/lib/types";

const PAGE_SIZE = 20;

interface VisitWithLot extends Visit {
  parking_lots?: { name: string } | null;
}

async function getVisits(page: number) {
  try {
    const supabase = await createClient();
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, count } = await supabase
      .from("visits")
      .select("*, parking_lots(name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(from, to);

    return {
      visits: (data as VisitWithLot[]) ?? [],
      total: count ?? 0,
    };
  } catch {
    return { visits: [], total: 0 };
  }
}

function statusVariant(status: string) {
  switch (status) {
    case "checked_in":
      return "default" as const;
    case "checked_out":
      return "secondary" as const;
    case "cancelled":
      return "destructive" as const;
    default:
      return "secondary" as const;
  }
}

function statusLabel(status: string) {
  switch (status) {
    case "checked_in":
      return "Active";
    case "checked_out":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export default async function VisitsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const { visits, total } = await getVisits(page);
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">All Visits</h1>
        <p className="text-sm text-muted-foreground">
          {total} total visit{total !== 1 ? "s" : ""}
        </p>
      </div>

      {visits.length === 0 ? (
        <Card className="p-12 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No visits yet</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Visits will appear here as vehicles are checked in.
          </p>
        </Card>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Plate
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Lot
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Check In
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Check Out
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {visits.map((v) => (
                  <tr
                    key={v.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 font-mono font-medium">
                      {formatPlateDisplay(v.normalized_plate)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.parking_lots?.name ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(v.check_in_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {v.check_out_at
                        ? new Date(v.check_out_at).toLocaleString()
                        : "—"}
                    </td>
                    <td className="px-4 py-3">
                      {v.duration_minutes != null
                        ? formatDuration(v.duration_minutes)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {v.amount_charged != null
                        ? formatCurrency(v.amount_charged)
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge variant={statusVariant(v.status)}>
                        {statusLabel(v.status)}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Page {page} of {totalPages}
            </p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link href={`/visits?page=${page - 1}`}>
                  <Button variant="outline" size="sm">
                    <ChevronLeft className="mr-1 h-4 w-4" />
                    Previous
                  </Button>
                </Link>
              )}
              {page < totalPages && (
                <Link href={`/visits?page=${page + 1}`}>
                  <Button variant="outline" size="sm">
                    Next
                    <ChevronRight className="ml-1 h-4 w-4" />
                  </Button>
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
