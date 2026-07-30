import {
  createHashRouter,
  Navigate,
  Outlet,
  redirect,
} from "react-router-dom";
import { JoinPage } from "../features/join/JoinPage";
import { TeacherSetupPage } from "../features/teacher/TeacherSetupPage";
import { TeacherSignInPage } from "../features/teacher/TeacherSignInPage";
import { getSupabaseClient } from "../shared/api/supabase";
import { App } from "./App";

function QuestPlaceholder() {
  return (
    <main className="route-shell">
      <p className="eyebrow">Session ready</p>
      <h1>Your quest is preparing</h1>
      <p>The learning journey arrives in the next approved implementation plan.</p>
    </main>
  );
}

function ProtectedRouteBoundary() {
  return <Outlet />;
}

async function requireRole(role: "teacher" | "student") {
  const result = await getSupabaseClient().auth.getUser();
  if (result.error || result.data.user?.app_metadata.role !== role) {
    throw redirect(role === "teacher" ? "/teacher/sign-in" : "/");
  }
  return null;
}

export const router = createHashRouter([
  { path: "/", element: <App /> },
  { path: "/join/:token", element: <JoinPage /> },
  { path: "/teacher/sign-in", element: <TeacherSignInPage /> },
  {
    element: <ProtectedRouteBoundary />,
    children: [
      {
        path: "/quest",
        loader: () => requireRole("student"),
        element: <QuestPlaceholder />,
      },
      {
        path: "/teacher/setup",
        loader: () => requireRole("teacher"),
        element: <TeacherSetupPage />,
      },
      { path: "/teacher", element: <Navigate to="/teacher/setup" replace /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
