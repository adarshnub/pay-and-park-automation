"use client";

import { Card } from "@/src/components/ui/card";
import { formatCurrency } from "@/src/lib/utils";

export interface LotStatsData {
  totalSpaces: number;
  activeVehicles: number;
  remainingSpaces: number;
  todayCollection: number;
  monthCollection: number;
}

export function LotStatsGrid({ stats }: { stats: LotStatsData }) {
  const items = [
    { label: "Total spaces", value: String(stats.totalSpaces) },
    { label: "Parked now", value: String(stats.activeVehicles) },
    { label: "Available", value: String(stats.remainingSpaces) },
    { label: "Today (INR)", value: formatCurrency(stats.todayCollection) },
    { label: "This month (INR)", value: formatCurrency(stats.monthCollection) },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {items.map((item) => (
        <Card key={item.label} className="p-3">
          <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums">{item.value}</p>
        </Card>
      ))}
    </div>
  );
}
