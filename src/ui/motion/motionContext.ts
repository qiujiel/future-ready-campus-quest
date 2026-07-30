import { createContext, useContext } from "react";

export type QuestMotion = {
  duration: number;
  reduced: boolean;
};

export const QuestMotionContext = createContext<QuestMotion>({
  duration: 0.24,
  reduced: false,
});

export function useQuestMotion() {
  return useContext(QuestMotionContext);
}
