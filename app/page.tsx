import Link from "next/link";
import { Car, Shield, BarChart3, Camera } from "lucide-react";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-8 p-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">ParkEasy</h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Smart Parking Management with ANPR
        </p>
      </div>

      <div className="grid max-w-2xl grid-cols-2 gap-4">
        <Feature icon={Camera} title="ANPR" desc="Auto plate recognition from photos" />
        <Feature icon={Car} title="Live Occupancy" desc="Track active vehicles in real time" />
        <Feature icon={BarChart3} title="Analytics" desc="Revenue, traffic & utilization" />
        <Feature icon={Shield} title="Multi-Lot" desc="Manage branches with staff roles" />
      </div>

      <Link
        href="/login"
        className="rounded-lg bg-primary px-6 py-3 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
      >
        Go to Dashboard
      </Link>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <Icon className="mb-2 h-6 w-6 text-primary" />
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
