/**
 * Copy text to the clipboard. Uses the Async Clipboard API when possible, with a
 * legacy execCommand fallback — important after `await` (user activation may be gone).
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = typeof text === "string" ? text.trim() : "";
  if (!value) return false;

  const secure =
    typeof window !== "undefined" && typeof window.isSecureContext === "boolean"
      ? window.isSecureContext
      : true;
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText && secure) {
    try {
      await navigator.clipboard.writeText(value);
      return true;
    } catch {
      /* try fallback */
    }
  }

  if (typeof document === "undefined") return false;

  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "0";
    ta.style.top = "0";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, value.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}
