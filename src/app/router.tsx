import {
  createHashRouter,
  Navigate,
  Outlet,
  useParams,
} from "react-router-dom";
import { App } from "./App";

function JoinPlaceholder() {
  const { token } = useParams();
  const hasToken = token && token !== "unavailable";

  return (
    <main className="route-shell">
      <p className="eyebrow">Student entry</p>
      <h1>{hasToken ? "Join your campus quest" : "Use your class QR link"}</h1>
      <p>
        {hasToken
          ? "Your teacher’s join window will be checked securely before you enter."
          : "Ask your teacher to open the join window and scan the shared class QR code."}
      </p>
    </main>
  );
}

function TeacherSignInPlaceholder() {
  return (
    <main className="route-shell">
      <p className="eyebrow">Teacher access</p>
      <h1>Teacher sign in</h1>
      <p>Secure cohort controls will be available after authentication.</p>
    </main>
  );
}

function ProtectedRouteBoundary() {
  return <Outlet />;
}

export const router = createHashRouter([
  { path: "/", element: <App /> },
  { path: "/join/:token", element: <JoinPlaceholder /> },
  { path: "/teacher/sign-in", element: <TeacherSignInPlaceholder /> },
  {
    element: <ProtectedRouteBoundary />,
    children: [
      { path: "/quest", element: <Navigate to="/" replace /> },
      { path: "/teacher", element: <Navigate to="/teacher/sign-in" replace /> },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);
