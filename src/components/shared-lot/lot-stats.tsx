"use client";

import { Card } from "@/src/components/ui/card";

export interface LotStatsData {
  totalSpaces: number;
  activeVehicles: number;
  remainingSpaces: number;
  todayCollection: number;
  monthCollection: number;
}

/** Staff shared link: only occupancy counts for a quick at-a-glance read. */
export function LotStatsGrid({ stats }: { stats: LotStatsData }) {
  const items = [
    { label: "Parked now", value: String(stats.activeVehicles) },
    { label: "Available", value: String(stats.remainingSpaces) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <Card key={item.label} className="border-border/80 p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight text-foreground sm:text-4xl">
            {item.value}
          </p>
        </Card>
      ))}
    </div>
  );
}
