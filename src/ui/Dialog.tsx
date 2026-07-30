import {
  type KeyboardEvent,
  type PropsWithChildren,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import { Button } from "./Button";

const focusableSelector = [
  "button:not([disabled])",
  "a[href]",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export function Dialog({
  children,
  onClose,
  open,
  returnFocusRef,
  title,
}: PropsWithChildren<{
  onClose: () => void;
  open: boolean;
  returnFocusRef?: RefObject<HTMLElement | null>;
  title: string;
}>) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const fallbackFocus = document.activeElement as HTMLElement | null;
    const first = panelRef.current?.querySelector<HTMLElement>(focusableSelector);
    first?.focus();
    return () => {
      (returnFocusRef?.current ?? fallbackFocus)?.focus();
    };
  }, [open, returnFocusRef]);

  if (!open) return null;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = [
      ...(panelRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? []),
    ];
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="quest-dialog-backdrop">
      <div
        ref={panelRef}
        className="quest-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={handleKeyDown}
      >
        <div className="quest-dialog__header">
          <h2 id={titleId}>{title}</h2>
          <Button variant="quiet" onClick={onClose}>
            <span aria-hidden="true">×</span>
            <span className="sr-only">Close {title.toLowerCase()}</span>
          </Button>
        </div>
        <div>{children}</div>
      </div>
    </div>
  );
}
