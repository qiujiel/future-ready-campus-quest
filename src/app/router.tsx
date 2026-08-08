import {
  createHashRouter,
  Navigate,
  Outlet,
  redirect,
} from "react-router-dom";
import { JoinPage } from "../features/join/JoinPage";
import { RecoveryPage } from "../features/join/RecoveryPage";
import { QuestEntryPage } from "../features/quest/QuestEntryPage";
import { getSupabaseClient } from "../shared/api/supabase";
import { readAuthenticatedRole } from "../shared/api/role";
import { App } from "./App";

function ProtectedRouteBoundary() {
  return <Outlet />;
}

async function requireRole(role: "teacher" | "student") {
  const currentRole = await readAuthenticatedRole(getSupabaseClient());
  if (currentRole !== role) {
    throw redirect(role === "teacher" ? "/teacher/sign-in" : "/");
  }
  return null;
}

export const router = createHashRouter([
  { path: "/", element: <App /> },
  { path: "/join", element: <JoinPage /> },
  { path: "/join/:token", element: <JoinPage /> },
  { path: "/recover/:token", element: <RecoveryPage /> },
  {
    path: "/preview/student",
    lazy: async () => {
      const module = await import(
        "../features/preview/StudentExperiencePreview"
      );
      return { Component: module.StudentExperiencePreview };
    },
  },
  {
    path: "/teacher/sign-in",
    lazy: async () => {
      const module = await import("../features/teacher/TeacherSignInPage");
      return { Component: module.TeacherSignInPage };
    },
  },
  {
    element: <ProtectedRouteBoundary />,
    children: [
      {
        path: "/quest",
        loader: () => requireRole("student"),
        element: <QuestEntryPage />,
      },
      {
        path: "/teacher/setup",
        loader: () => requireRole("teacher"),
        lazy: async () => {
          const module = await import("../features/teacher/TeacherSetupPage");
          return { Component: module.TeacherSetupPage };
        },
      },
      {
        path: "/teacher/cohorts/:cohortId",
        loader: () => requireRole("teacher"),
        lazy: async () => {
          const module = await import("../features/teacher/TeacherShell");
          return { Component: module.TeacherShell };
        },
      },
      {
        path: "/teacher/cohorts/:cohortId/concepts/:conceptId",
        loader: () => requireRole("teacher"),
        lazy: async () => {
          const module = await import("../features/teacher/TeacherShell");
          return { Component: module.TeacherShell };
        },
      },
      {
        path: "/teacher/cohorts/:cohortId/groups/:groupId",
        loader: () => requireRole("teacher"),
        lazy: async () => {
          const module = await import("../features/teacher/TeacherShell");
          return { Component: module.TeacherShell };
        },
      },
      {
        path: "/teacher/cohorts/:cohortId/students/:studentId",
        loader: () => requireRole("teacher"),
        lazy: async () => {
          const module = await import("../features/teacher/TeacherShell");
          return { Component: module.TeacherShell };
        },
      },
      { path: "/teacher", element: <Navigate to="/teacher/setup" replace /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
