"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/src/components/ui/card";
import { Button } from "@/src/components/ui/button";
import {
  listOcrInferenceUsage,
  type OcrInferenceLogRow,
  type OcrInferenceModelRollup,
} from "@/src/actions/inference-usage";
import { Activity } from "lucide-react";

const nf = new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 });

function formatTs(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function UsagePage() {
  const [recent, setRecent] = useState<OcrInferenceLogRow[]>([]);
  const [rollup, setRollup] = useState<OcrInferenceModelRollup[]>([]);
  const [tableMissing, setTableMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await listOcrInferenceUsage();
    if (res.success) {
      setRecent(res.recent);
      setRollup(res.rollup);
      setTableMissing(res.tableMissing);
    } else {
      setError(res.error);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Activity className="h-7 w-7" />
            Model token usage
          </h1>
          <p className="text-sm text-muted-foreground">
            Paid OCR calls (OpenAI, Gemini) from the last 30 days. Each row is one API response
            (one processing attempt). EasyOCR / Tesseract do not use cloud tokens and are not
            listed here.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {error && (
        <div className="rounded-lg bg-destructive/10 px-4 py-2 text-sm font-medium text-destructive">
          {error}
        </div>
      )}

      {tableMissing && (
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          The database table <code className="rounded bg-muted px-1">ocr_inference_logs</code> is
          not installed yet. Apply migration{" "}
          <code className="rounded bg-muted px-1">007_ocr_inference_logs.sql</code> in Supabase,
          then refresh.
        </div>
      )}

      {!tableMissing && !loading && !error && rollup.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No logged inference events in the last 30 days. Token counts appear after dashboard or
          shared-link flows call Gemini or OpenAI.
        </p>
      )}

      {rollup.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Totals by provider &amp; model (30 days)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-4 font-medium">Provider</th>
                  <th className="pb-2 pr-4 font-medium">Model</th>
                  <th className="pb-2 pr-4 font-medium text-right">Calls</th>
                  <th className="pb-2 pr-4 font-medium text-right">Prompt Σ</th>
                  <th className="pb-2 pr-4 font-medium text-right">Output Σ</th>
                  <th className="pb-2 font-medium text-right">Total Σ</th>
                </tr>
              </thead>
              <tbody>
                {rollup.map((r) => (
                  <tr key={`${r.provider}-${r.model}`} className="border-b border-border/60">
                    <td className="py-2 pr-4 capitalize">{r.provider}</td>
                    <td className="py-2 pr-4 font-mono text-xs">{r.model}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{nf.format(r.events)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{nf.format(r.sumPrompt)}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{nf.format(r.sumCompletion)}</td>
                    <td className="py-2 text-right tabular-nums font-medium">{nf.format(r.sumTotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {recent.length > 0 && (
        <Card className="p-6">
          <h2 className="mb-4 text-lg font-semibold">Recent events (up to 50 shown)</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="pb-2 pr-3 font-medium">Time</th>
                  <th className="pb-2 pr-3 font-medium">Source</th>
                  <th className="pb-2 pr-3 font-medium">Provider</th>
                  <th className="pb-2 pr-3 font-medium">Model</th>
                  <th className="pb-2 pr-3 font-medium text-right">Prompt</th>
                  <th className="pb-2 pr-3 font-medium text-right">Output</th>
                  <th className="pb-2 font-medium text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="border-b border-border/60">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-muted-foreground">
                      {formatTs(r.created_at)}
                    </td>
                    <td className="py-2 pr-3 capitalize">{r.source.replace("_", " ")}</td>
                    <td className="py-2 pr-3 capitalize">{r.provider}</td>
                    <td className="py-2 pr-3 font-mono text-xs">{r.model ?? "—"}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.prompt_tokens != null ? nf.format(r.prompt_tokens) : "—"}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {r.completion_tokens != null ? nf.format(r.completion_tokens) : "—"}
                    </td>
                    <td className="py-2 text-right tabular-nums">
                      {r.total_tokens != null
                        ? nf.format(r.total_tokens)
                        : r.prompt_tokens != null || r.completion_tokens != null
                          ? nf.format((r.prompt_tokens ?? 0) + (r.completion_tokens ?? 0))
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
