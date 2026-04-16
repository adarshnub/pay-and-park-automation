import Link from "next/link";
import { createClient } from "@/src/lib/supabase/server";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { formatPlateDisplay } from "@/src/lib/plate";
import { formatDuration } from "@/src/lib/utils";
import { Car, LogOut, Search } from "lucide-react";
import type { Visit, ParkingLot } from "@/src/lib/types";

interface ActiveVehicle extends Visit {
  parking_lots?: { name: string } | null;
}

async function getActiveVehicles(search?: string) {
  try {
    const supabase = await createClient();
    let query = supabase
      .from("visits")
      .select("*, parking_lots(name)")
      .eq("status", "checked_in")
      .order("check_in_at", { ascending: false });

    if (search) {
      query = query.ilike("normalized_plate", `%${search}%`);
    }

    const { data } = await query;
    return (data as ActiveVehicle[]) ?? [];
  } catch {
    return [];
  }
}

export default async function ActiveVehiclesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const params = await searchParams;
  const search = params.q ?? "";
  const vehicles = await getActiveVehicles(search);

  const now = new Date();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Active Vehicles</h1>
        <p className="text-sm text-muted-foreground">
          {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""} currently
          parked
        </p>
      </div>

      <Card className="p-4">
        <form className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={search}
              placeholder="Search by plate number…"
              className="w-full rounded-lg border border-input bg-background py-2 pl-9 pr-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/20"
            />
          </div>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </form>
      </Card>

      {vehicles.length === 0 ? (
        <Card className="p-12 text-center">
          <Car className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="font-medium">No active vehicles</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {search
              ? "No vehicles match your search."
              : "All parking lots are empty."}
          </p>
        </Card>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Plate Number
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Parking Lot
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Check-In Time
                </th>
                <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                  Duration
                </th>
                <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => {
                const durationMin = Math.round(
                  (now.getTime() - new Date(v.check_in_at).getTime()) / 60000,
                );
                return (
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
                    <td className="px-4 py-3">
                      <Badge variant="secondary">
                        {formatDuration(durationMin)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/check-out?plate=${encodeURIComponent(v.normalized_plate)}`}
                      >
                        <Button variant="outline" size="sm">
                          <LogOut className="mr-1.5 h-3.5 w-3.5" />
                          Check Out
                        </Button>
                      </Link>
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
