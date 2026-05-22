import { Navigate, Route, Routes } from "react-router-dom";
import { AuthenticatedApp } from "./components/AuthenticatedApp";
import { AuthScreen } from "./components/AuthScreen";
import { WorkspaceSelect } from "./components/WorkspaceSelect";
import { useAppController } from "./hooks/useAppController";

const appRoutes = ["/projects", "/board", "/completed", "/management", "/members", "/reports"];

export function App() {
  const controller = useAppController();

  const homePath = controller.session
    ? controller.selectedWorkspace ? "/projects" : "/workspaces"
    : "/login";

  function workspaceSelectRoute() {
    if (!controller.session) {
      return <Navigate to="/login" replace />;
    }

    return (
      <WorkspaceSelect
        workspaces={controller.workspaces}
        isLoading={controller.isLoadingWorkspaces}
        canCreateWorkspace={controller.canCreateWorkspace}
        onRefresh={() => void controller.actions.loadWorkspaces(controller.session)}
        onSelect={controller.actions.handleWorkspaceSelect}
        onCreateWorkspace={controller.actions.handleCreateWorkspace}
        onGoToLogin={controller.actions.handleGoToLogin}
      />
    );
  }

  function canAccessPath(path: string) {
    if (path === "/management") {
      return controller.permissions.canViewManagement;
    }

    if (path === "/members") {
      return controller.permissions.canViewMembers;
    }

    if (path === "/reports") {
      return controller.permissions.canViewWorkspaceReports;
    }

    return true;
  }

  function appRoute(path: string) {
    if (!controller.session) {
      return <Navigate to="/login" replace />;
    }

    if (!controller.selectedWorkspace) {
      return <Navigate to="/workspaces" replace />;
    }

    if (!canAccessPath(path)) {
      return <Navigate to="/projects" replace />;
    }

    return <AuthenticatedApp controller={controller} />;
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to={homePath} replace />} />
      <Route
        path="/login"
        element={controller.session ? <Navigate to={homePath} replace /> : <AuthScreen onAuthenticated={controller.actions.handleAuthenticated} />}
      />
      <Route path="/workspaces" element={workspaceSelectRoute()} />
      {appRoutes.map((path) => (
        <Route key={path} path={path} element={appRoute(path)} />
      ))}
      <Route path="*" element={<Navigate to={homePath} replace />} />
    </Routes>
  );
}
