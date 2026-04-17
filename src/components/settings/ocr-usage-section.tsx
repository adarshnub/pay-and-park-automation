"use client";

import { useEffect, useState } from "react";
import { Card } from "@/src/components/ui/card";
import { getOcrUsageSummary, type OcrUsageStep, type OcrUsageSummary } from "@/src/actions/ocr-usage";
import { Cpu } from "lucide-react";

function StepBadge({ status }: { status: OcrUsageStep["status"] }) {
  if (status === "on") {
    return (
      <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
        On
      </span>
    );
  }
  if (status === "warning") {
    return (
      <span className="shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
        Check key
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      Off
    </span>
  );
}

export function OcrUsageSection() {
  const [summary, setSummary] = useState<OcrUsageSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await getOcrUsageSummary();
      if (cancelled) return;
      if (res.success) {
        setSummary(res.summary);
        setError(null);
      } else {
        setSummary(null);
        setError(res.error);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Card className="p-6">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Cpu className="h-5 w-5 shrink-0" />
        OCR &amp; API usage
      </h2>
      <p className="mb-4 text-sm text-muted-foreground">
        What this deployment uses for plate detection on{" "}
        <span className="font-medium text-foreground">check-in / check-out</span> and{" "}
        <span className="font-medium text-foreground">shared staff links</span>. API keys and
        URLs are never shown here—only whether each option is configured.
      </p>

      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {summary && !loading && (
        <div className="space-y-5">
          <p className="text-xs text-muted-foreground">
            Runtime:{" "}
            <span className="font-medium text-foreground">
              {summary.deployment === "vercel" ? "Vercel (serverless)" : "Self-hosted / local"}
            </span>
            . Order matches{" "}
            <code className="rounded bg-muted px-1">runServerOcrPipeline</code>.
          </p>

          <div>
            <p className="mb-2 text-sm font-medium">Try order (same for dashboard + shared link OCR)</p>
            <ol className="space-y-3">
              {summary.inlineSteps.map((step) => (
                <li
                  key={step.order}
                  className="flex flex-col gap-1 rounded-lg border border-border bg-muted/30 px-3 py-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-mono text-muted-foreground">{step.order}.</span>
                      <span className="text-sm font-medium">{step.title}</span>
                      <StepBadge status={step.status} />
                    </div>
                    {step.detail && (
                      <p className="mt-1 text-xs text-muted-foreground">{step.detail}</p>
                    )}
                    {step.hint && (
                      <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/90">{step.hint}</p>
                    )}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <div className="border-t border-border pt-4">
            <p className="mb-2 text-sm font-medium">Python ANPR worker (async queue)</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-muted-foreground">
              {summary.workerNotes.map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </Card>
  );
}
