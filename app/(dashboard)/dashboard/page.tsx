import { createClient } from "@/src/lib/supabase/server";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { formatCurrency, formatDuration } from "@/src/lib/utils";
import { Car, IndianRupee, ArrowDownLeft, ArrowUpRight, Clock } from "lucide-react";
import type { Visit } from "@/src/lib/types";

async function getDashboardData() {
  try {
    const supabase = await createClient();
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [activeResult, revenueResult, entriesResult, exitsResult, recentResult] =
      await Promise.all([
        supabase
          .from("visits")
          .select("id", { count: "exact", head: true })
          .eq("status", "checked_in"),
        supabase
          .from("visits")
          .select("amount_charged")
          .eq("status", "checked_out")
          .gte("check_out_at", todayStart.toISOString()),
        supabase
          .from("visits")
          .select("id", { count: "exact", head: true })
          .gte("check_in_at", todayStart.toISOString()),
        supabase
          .from("visits")
          .select("id", { count: "exact", head: true })
          .eq("status", "checked_out")
          .gte("check_out_at", todayStart.toISOString()),
        supabase
          .from("visits")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(10),
      ]);

    const todayRevenue =
      revenueResult.data?.reduce(
        (sum, v) => sum + (v.amount_charged ?? 0),
        0,
      ) ?? 0;

    return {
      activeVehicles: activeResult.count ?? 0,
      todayRevenue,
      todayEntries: entriesResult.count ?? 0,
      todayExits: exitsResult.count ?? 0,
      recentVisits: (recentResult.data as Visit[]) ?? [],
    };
  } catch {
    return {
      activeVehicles: 0,
      todayRevenue: 0,
      todayEntries: 0,
      todayExits: 0,
      recentVisits: [],
    };
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const stats = [
    {
      label: "Active Vehicles",
      value: data.activeVehicles,
      icon: Car,
      color: "text-primary",
    },
    {
      label: "Today's Revenue",
      value: formatCurrency(data.todayRevenue),
      icon: IndianRupee,
      color: "text-success",
    },
    {
      label: "Today's Entries",
      value: data.todayEntries,
      icon: ArrowDownLeft,
      color: "text-primary",
    },
    {
      label: "Today's Exits",
      value: data.todayExits,
      icon: ArrowUpRight,
      color: "text-muted-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">
          Overview of your parking operations
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {stat.label}
              </p>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <p className="mt-2 text-2xl font-bold">{stat.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold">Recent Activity</h2>
        {data.recentVisits.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No recent activity. Visits will appear here once vehicles are
            checked in.
          </p>
        ) : (
          <div className="space-y-3">
            {data.recentVisits.map((visit) => (
              <div
                key={visit.id}
                className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <Car className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      {visit.normalized_plate}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <Clock className="mr-1 inline h-3 w-3" />
                      {new Date(visit.check_in_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {visit.amount_charged != null && (
                    <span className="text-sm font-medium">
                      {formatCurrency(visit.amount_charged)}
                    </span>
                  )}
                  <Badge
                    variant={
                      visit.status === "checked_in" ? "default" : "secondary"
                    }
                  >
                    {visit.status === "checked_in" ? "Active" : "Completed"}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
