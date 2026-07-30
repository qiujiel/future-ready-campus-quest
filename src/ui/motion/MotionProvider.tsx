import { MotionConfig } from "motion/react";
import {
  type PropsWithChildren,
  useEffect,
  useMemo,
  useState,
} from "react";
import { QuestMotionContext } from "./motionContext";

function systemPrefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function MotionProvider({
  children,
  forceReduced,
}: PropsWithChildren<{ forceReduced?: boolean }>) {
  const [systemReduced, setSystemReduced] = useState(systemPrefersReducedMotion);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setSystemReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  const reduced = forceReduced ?? systemReduced;
  const value = useMemo(
    () => ({ duration: reduced ? 0 : 0.24, reduced }),
    [reduced],
  );

  return (
    <QuestMotionContext.Provider value={value}>
      <MotionConfig reducedMotion={reduced ? "always" : "user"}>
        {children}
      </MotionConfig>
    </QuestMotionContext.Provider>
  );
}
