"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { Spinner } from "@/src/components/ui/spinner";
import { updateCheckInDisputeStatus } from "@/src/actions/check-in-disputes";
import { CheckCircle2, XCircle } from "lucide-react";

export function DisputeRowActions({ disputeId }: { disputeId: string }) {
  const router = useRouter();
  const [pending, setPending] = React.useState<"resolved" | "dismissed" | null>(
    null,
  );
  const [error, setError] = React.useState("");

  async function onAction(status: "resolved" | "dismissed") {
    setError("");
    setPending(status);
    const res = await updateCheckInDisputeStatus(disputeId, status);
    setPending(null);
    if (!res.success) {
      setError(res.error ?? "Update failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="default"
          size="sm"
          className="gap-1"
          disabled={pending !== null}
          onClick={() => onAction("resolved")}
        >
          {pending === "resolved" ? (
            <Spinner size="sm" className="text-primary-foreground" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          Resolve
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1"
          disabled={pending !== null}
          onClick={() => onAction("dismissed")}
        >
          {pending === "dismissed" ? (
            <Spinner size="sm" />
          ) : (
            <XCircle className="h-4 w-4" />
          )}
          Leave as is
        </Button>
      </div>
      {error && (
        <p className="max-w-[220px] text-right text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
