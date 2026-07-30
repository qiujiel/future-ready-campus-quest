import { type PropsWithChildren } from "react";

export function StatusPill({
  children,
  tone = "current",
}: PropsWithChildren<{
  tone?: "complete" | "current" | "upcoming" | "attention";
}>) {
  return (
    <span className={`status-pill status-pill--${tone}`} data-status={tone}>
      {children}
    </span>
  );
}
