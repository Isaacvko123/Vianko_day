import { BoardView } from "./BoardView";
import { MainLayout } from "./MainLayout";
import { ManagementView } from "./ManagementView";
import { MembersView } from "./MembersView";
import { ProjectsView } from "./ProjectsView";
import { RealtimeNotifications } from "./RealtimeNotifications";
import { ReportsView } from "./ReportsView";
import { TaskDetailPanel } from "./TaskDetailPanel";
import type { AppController } from "../hooks/useAppController";

type AuthenticatedAppProps = {
  controller: AppController;
};

export function AuthenticatedApp({ controller }: AuthenticatedAppProps) {
  const {
    session,
    selectedWorkspace,
    visibleProjects,
    activeProjectId,
    activeProject,
    activeBoard,
    boardStatuses,
    tasks,
    completedTasks,
    selectedTaskId,
    selectedTask,
    subtasks,
    comments,
    timeLogs,
    taskEvents,
    members,
    pendingMembers,
    roles,
    areas,
    localities,
    positions,
    staffingRequests,
    summary,
    currentView,
    boardMode,
    isLoadingProjects,
    isLoadingBoard,
    isLoadingDetail,
    isLoadingMembers,
    isLoadingManagement,
    isLoadingReports,
    globalError,
    notifications,
    notificationPermission,
    permissions,
    actions
  } = controller;

  if (!session || !selectedWorkspace) {
    return undefined;
  }

  return (
    <MainLayout
      session={session}
      workspace={selectedWorkspace}
      currentView={currentView}
      notificationPermission={notificationPermission}
      onViewChange={actions.setCurrentView}
      onEnableNotifications={() => void actions.handleEnableBrowserNotifications()}
      onChangeWorkspace={actions.handleChangeWorkspace}
      onLogout={actions.handleLogout}
    >
      {globalError ? <div className="global-error">{globalError}</div> : undefined}

      {currentView === "projects" ? (
        <ProjectsView
          projects={visibleProjects}
          areas={areas}
          localities={localities}
          activeProjectId={activeProjectId}
          isLoading={isLoadingProjects}
          canCreateProjects={permissions.canCreateProjects}
          onRefresh={() => void actions.loadProjects()}
          onSelectProject={(projectId) => {
            actions.setActiveProjectId(projectId);
            actions.setCurrentView("board");
          }}
          onCreateProject={actions.handleCreateProject}
          onUpdateProject={actions.handleUpdateProject}
        />
      ) : undefined}

      {currentView === "board" ? (
        <>
          <div className="board-layout">
            <BoardView
              projects={visibleProjects}
              activeProject={activeProject}
              activeBoard={activeBoard}
              tasks={tasks}
              completedTasks={completedTasks}
              boardMode={boardMode}
              isLoading={isLoadingBoard}
              selectedTaskId={selectedTaskId}
              currentUserId={session.user.id}
              workspaceMembers={members}
              roles={roles}
              canCreateTasks={permissions.canCreateTasks}
              canManageProjectMembers={permissions.canManageProjectMembers}
              canEditCompletedTasks={permissions.canUseManagerPlanning}
              onRefresh={() => activeProjectId ? void actions.loadProjectContext(activeProjectId) : undefined}
              onProjectChange={actions.setActiveProjectId}
              onBoardModeChange={actions.setBoardMode}
              onCreateTask={actions.handleCreateTask}
              onAddProjectMember={actions.handleAddProjectMember}
              onTaskStatusChange={actions.handleTaskStatusChange}
              onSelectTask={actions.setSelectedTaskId}
            />
          </div>
          <TaskDetailPanel
            task={selectedTask}
            subtasks={subtasks}
            statuses={boardStatuses}
            projectMembers={activeProject?.members ?? []}
            workspaceMembers={members}
            comments={comments}
            timeLogs={timeLogs}
            events={taskEvents}
            isLoading={isLoadingDetail}
            currentUserId={session.user.id}
            canCreateSubtasks={permissions.canCreateTasks}
            canMoveClosedTasks={permissions.canUseManagerPlanning}
            canViewPlanning={permissions.canUseManagerPlanning}
            canEditPlanning={permissions.canUseManagerPlanning}
            canModifyCompletedTask={permissions.canModifyCompletedTask}
            onClose={() => actions.setSelectedTaskId(undefined)}
            onUpdateTaskPlan={actions.handleUpdateTaskPlan}
            onCreateSubtask={actions.handleCreateSubtask}
            onSubtaskStatusChange={actions.handleTaskStatusChange}
            onCreateSubtaskTimeLog={actions.handleCreateSubtaskTimeLog}
            onAddTaskAssignee={actions.handleAddTaskAssignee}
            onMentionTaskUser={actions.handleMentionTaskUser}
            onCreateComment={actions.handleCreateComment}
            onCreateTimeLog={actions.handleCreateTimeLog}
          />
        </>
      ) : undefined}

      {currentView === "management" ? (
        <ManagementView
          staffingRequests={staffingRequests}
          projects={visibleProjects}
          members={members}
          areas={areas}
          localities={localities}
          positions={positions}
          roles={roles}
          currentAreaId={selectedWorkspace.member.area?.id}
          canAnswerAllRequests={permissions.canAnswerAllStaffingRequests}
          isLoading={isLoadingManagement}
          onRefresh={() => void actions.loadManagement()}
          onCreateStaffingRequest={actions.handleCreateStaffingRequest}
          onApproveStaffingRequest={actions.handleApproveStaffingRequest}
          onRejectStaffingRequest={actions.handleRejectStaffingRequest}
        />
      ) : undefined}

      {currentView === "members" ? (
        <MembersView
          members={members}
          pendingMembers={pendingMembers}
          roles={roles}
          areas={areas}
          localities={localities}
          positions={positions}
          projects={visibleProjects}
          isLoading={isLoadingMembers}
          onRefresh={() => void actions.loadMembers()}
          onInviteUser={actions.handleInviteUser}
          onCreateArea={actions.handleCreateArea}
          onCreateLocality={actions.handleCreateLocality}
          onCreatePosition={actions.handleCreatePosition}
          onApproveMember={actions.handleApproveMember}
          onUpdateMember={actions.handleUpdateMember}
        />
      ) : undefined}

      {currentView === "reports" ? (
        <ReportsView
          summary={summary}
          isLoading={isLoadingReports}
          onRefresh={() => void actions.loadReports()}
        />
      ) : undefined}

      <RealtimeNotifications notifications={notifications} onDismiss={actions.dismissNotification} />
    </MainLayout>
  );
}
