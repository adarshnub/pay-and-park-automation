"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/src/lib/supabase/client";
import { Card } from "@/src/components/ui/card";
import { formatCurrency, formatDuration } from "@/src/lib/utils";
import {
  IndianRupee,
  Clock,
  Building2,
  ScanLine,
  TrendingUp,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

interface DailyRevenue {
  date: string;
  revenue: number;
}

interface HourlyActivity {
  hour: string;
  entries: number;
  exits: number;
}

interface OccupancyPoint {
  time: string;
  occupancy: number;
}

interface TopStats {
  totalRevenue: number;
  avgDurationMin: number;
  busiestLot: string;
  ocrAccuracy: number;
}

export default function AnalyticsPage() {
  const [dailyRevenue, setDailyRevenue] = useState<DailyRevenue[]>([]);
  const [hourlyActivity, setHourlyActivity] = useState<HourlyActivity[]>([]);
  const [occupancy, setOccupancy] = useState<OccupancyPoint[]>([]);
  const [topStats, setTopStats] = useState<TopStats>({
    totalRevenue: 0,
    avgDurationMin: 0,
    busiestLot: "—",
    ocrAccuracy: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const supabase = createClient();

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const { data: recentVisits } = await supabase
          .from("visits")
          .select(
            "check_in_at, check_out_at, amount_charged, duration_minutes, parking_lot_id, status",
          )
          .gte("check_in_at", thirtyDaysAgo.toISOString());

        const visits = recentVisits ?? [];

        // Daily revenue for the last 30 days
        const revenueMap = new Map<string, number>();
        for (let i = 29; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          revenueMap.set(d.toISOString().slice(0, 10), 0);
        }
        visits.forEach((v) => {
          if (v.check_out_at && v.amount_charged) {
            const day = v.check_out_at.slice(0, 10);
            if (revenueMap.has(day)) {
              revenueMap.set(day, revenueMap.get(day)! + v.amount_charged);
            }
          }
        });
        setDailyRevenue(
          Array.from(revenueMap, ([date, revenue]) => ({
            date: date.slice(5),
            revenue,
          })),
        );

        // Hourly entries/exits for today
        const todayStr = new Date().toISOString().slice(0, 10);
        const hourMap = new Map<number, { entries: number; exits: number }>();
        for (let h = 0; h < 24; h++) {
          hourMap.set(h, { entries: 0, exits: 0 });
        }
        visits
          .filter((v) => v.check_in_at.startsWith(todayStr))
          .forEach((v) => {
            const h = new Date(v.check_in_at).getHours();
            const slot = hourMap.get(h)!;
            slot.entries++;
          });
        visits
          .filter((v) => v.check_out_at?.startsWith(todayStr))
          .forEach((v) => {
            const h = new Date(v.check_out_at!).getHours();
            const slot = hourMap.get(h)!;
            slot.exits++;
          });
        setHourlyActivity(
          Array.from(hourMap, ([h, data]) => ({
            hour: `${h.toString().padStart(2, "0")}:00`,
            entries: data.entries,
            exits: data.exits,
          })),
        );

        // Occupancy trend (last 7 days, one point per day)
        const occPoints: OccupancyPoint[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date();
          d.setDate(d.getDate() - i);
          const dayStr = d.toISOString().slice(0, 10);
          const activeCount = visits.filter(
            (v) =>
              v.check_in_at.slice(0, 10) <= dayStr &&
              (v.status === "checked_in" ||
                (v.check_out_at && v.check_out_at.slice(0, 10) >= dayStr)),
          ).length;
          occPoints.push({
            time: dayStr.slice(5),
            occupancy: activeCount,
          });
        }
        setOccupancy(occPoints);

        // Top stats
        const totalRev = visits.reduce(
          (s, v) => s + (v.amount_charged ?? 0),
          0,
        );
        const durations = visits
          .filter((v) => v.duration_minutes != null)
          .map((v) => v.duration_minutes!);
        const avgDur =
          durations.length > 0
            ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
            : 0;

        const lotCounts = new Map<string, number>();
        visits.forEach((v) => {
          lotCounts.set(
            v.parking_lot_id,
            (lotCounts.get(v.parking_lot_id) ?? 0) + 1,
          );
        });
        let busiestLot = "—";
        let maxCount = 0;
        lotCounts.forEach((count, lotId) => {
          if (count > maxCount) {
            maxCount = count;
            busiestLot = lotId.slice(0, 8) + "…";
          }
        });

        // Try to get lot name
        if (busiestLot !== "—" && maxCount > 0) {
          const actualId = Array.from(lotCounts.entries()).sort(
            (a, b) => b[1] - a[1],
          )[0]?.[0];
          if (actualId) {
            const { data: lotData } = await supabase
              .from("parking_lots")
              .select("name")
              .eq("id", actualId)
              .maybeSingle();
            if (lotData?.name) busiestLot = lotData.name;
          }
        }

        setTopStats({
          totalRevenue: totalRev,
          avgDurationMin: avgDur,
          busiestLot,
          ocrAccuracy: 0,
        });

        // OCR accuracy
        const { data: ocrJobs } = await supabase
          .from("ocr_jobs")
          .select("status, confidence")
          .eq("status", "completed");
        if (ocrJobs && ocrJobs.length > 0) {
          const highConf = ocrJobs.filter(
            (j) => j.confidence && j.confidence >= 0.7,
          ).length;
          setTopStats((prev) => ({
            ...prev,
            ocrAccuracy: Math.round((highConf / ocrJobs.length) * 100),
          }));
        }
      } catch {
        // Supabase not configured — keep default empty state
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, []);

  const statCards = [
    {
      label: "Total Revenue (30d)",
      value: formatCurrency(topStats.totalRevenue),
      icon: IndianRupee,
    },
    {
      label: "Avg Duration",
      value: topStats.avgDurationMin ? formatDuration(topStats.avgDurationMin) : "—",
      icon: Clock,
    },
    {
      label: "Busiest Lot",
      value: topStats.busiestLot,
      icon: Building2,
    },
    {
      label: "OCR Accuracy",
      value: topStats.ocrAccuracy ? `${topStats.ocrAccuracy}%` : "—",
      icon: ScanLine,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-sm text-muted-foreground">
          Insights into your parking operations
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {card.label}
              </p>
              <card.icon className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold">
              {loading ? "…" : card.value}
            </p>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold">
            Revenue — Last 30 Days
          </h2>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Loading chart…
            </div>
          ) : dailyRevenue.every((d) => d.revenue === 0) ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No revenue data available yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dailyRevenue}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value) => [formatCurrency(Number(value)), "Revenue"]}
                />
                <Bar dataKey="revenue" fill="var(--color-primary)" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold">
            Today&apos;s Activity by Hour
          </h2>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Loading chart…
            </div>
          ) : hourlyActivity.every((h) => h.entries === 0 && h.exits === 0) ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No activity data for today.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={hourlyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis
                  dataKey="hour"
                  tick={{ fontSize: 11 }}
                  interval={2}
                />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="entries" fill="var(--color-primary)" name="Entries" radius={[3, 3, 0, 0]} />
                <Bar dataKey="exits" fill="var(--color-muted-foreground)" name="Exits" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </Card>

        <Card className="p-5 lg:col-span-2">
          <h2 className="mb-4 text-base font-semibold">
            Occupancy Trend — Last 7 Days
          </h2>
          {loading ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Loading chart…
            </div>
          ) : occupancy.every((o) => o.occupancy === 0) ? (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              No occupancy data available yet.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={occupancy}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="occupancy"
                  stroke="var(--color-primary)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Vehicles"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </Card>
      </div>
    </div>
  );
}
