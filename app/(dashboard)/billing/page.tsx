import { createClient } from "@/src/lib/supabase/server";
import { Card } from "@/src/components/ui/card";
import { Badge } from "@/src/components/ui/badge";
import { formatCurrency, formatDuration } from "@/src/lib/utils";
import { formatPlateDisplay } from "@/src/lib/plate";
import { Receipt, IndianRupee, CalendarDays, TrendingUp } from "lucide-react";
import type { Invoice } from "@/src/lib/types";

async function getBillingData() {
  try {
    const supabase = await createClient();
    const now = new Date();
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    const weekStart = new Date(now);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay());
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [invoicesResult, todayResult, weekResult, monthResult] =
      await Promise.all([
        supabase
          .from("invoices")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
        supabase
          .from("invoices")
          .select("amount")
          .gte("created_at", todayStart.toISOString()),
        supabase
          .from("invoices")
          .select("amount")
          .gte("created_at", weekStart.toISOString()),
        supabase
          .from("invoices")
          .select("amount")
          .gte("created_at", monthStart.toISOString()),
      ]);

    const sum = (rows: { amount: number }[] | null) =>
      rows?.reduce((s, r) => s + r.amount, 0) ?? 0;

    return {
      invoices: (invoicesResult.data as Invoice[]) ?? [],
      todayRevenue: sum(todayResult.data),
      weekRevenue: sum(weekResult.data),
      monthRevenue: sum(monthResult.data),
    };
  } catch {
    return {
      invoices: [],
      todayRevenue: 0,
      weekRevenue: 0,
      monthRevenue: 0,
    };
  }
}

export default async function BillingPage() {
  const { invoices, todayRevenue, weekRevenue, monthRevenue } =
    await getBillingData();

  const summaryCards = [
    {
      label: "Today",
      value: formatCurrency(todayRevenue),
      icon: IndianRupee,
    },
    {
      label: "This Week",
      value: formatCurrency(weekRevenue),
      icon: CalendarDays,
    },
    {
      label: "This Month",
      value: formatCurrency(monthRevenue),
      icon: TrendingUp,
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">
          Invoices and revenue overview
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {summaryCards.map((card) => (
          <Card key={card.label} className="p-5">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-muted-foreground">
                {card.label}
              </p>
              <card.icon className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-2 text-2xl font-bold">{card.value}</p>
          </Card>
        ))}
      </div>

      <Card className="p-5">
        <h2 className="mb-4 text-lg font-semibold">Recent Invoices</h2>

        {invoices.length === 0 ? (
          <div className="py-8 text-center">
            <Receipt className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
            <p className="font-medium">No invoices yet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Invoices are generated when vehicles are checked out.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Receipt #
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Plate
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Lot
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Duration
                  </th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                    Amount
                  </th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                    Date
                  </th>
                  <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr
                    key={inv.id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      {inv.receipt_number}
                    </td>
                    <td className="px-4 py-3 font-mono font-medium">
                      {formatPlateDisplay(inv.vehicle_plate)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {inv.parking_lot_name || "—"}
                    </td>
                    <td className="px-4 py-3">
                      {formatDuration(inv.duration_minutes)}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {formatCurrency(inv.amount)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(inv.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Badge
                        variant={inv.paid ? "default" : "destructive"}
                      >
                        {inv.paid ? "Paid" : "Unpaid"}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
