import { ProjectChat } from './ProjectChat';
import { useState } from 'react';
import { TaskComposer, type ComposeOptions } from './TaskComposer';
import { NotificationInbox } from "./NotificationInbox";
import { BoardView } from "./BoardView";
import { WorkItemsView } from './WorkItemsView';
import { RolesView } from './RolesView';
import { OrganizationView } from './OrganizationView';
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
  const [composer, setComposer] = useState<ComposeOptions>();
  const {
    session,
    selectedWorkspace,
    visibleProjects,
    activeProjectId,
    activeProject,
    activeBoard,
    boardStatuses,
    tasks,
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
    staffingPagination,
    staffingPages,
    staffingPageSize,
    summary,
    reportPeriod,
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

  const visibleGlobalError = globalError;
  const projectPermissions = new Set(activeProject?.permissions ?? []);

  return (
    <MainLayout
      onCreateTask={permissions.canCreateTasks && currentView !== 'board' ? () => setComposer({ projectId: activeProjectId }) : undefined}
      unreadCount={controller.inbox.unreadCount}
      connectionState={controller.connectionState}
      session={session}
      workspace={selectedWorkspace}
      currentView={currentView}
      notificationPermission={notificationPermission}
      onViewChange={actions.setCurrentView}
      onEnableNotifications={() => void actions.handleEnableBrowserNotifications()}
      onChangeWorkspace={actions.handleChangeWorkspace}
      onLogout={actions.handleLogout}
    >
      {visibleGlobalError ? <div className="global-error">{visibleGlobalError}</div> : undefined}

      {currentView === "notifications" ? <NotificationInbox device={controller.devicePush} onDisable={actions.handleDisableBrowserNotifications} onRecheck={actions.checkNotificationDevice} inbox={controller.inbox} onOpen={actions.openNotification} onEnable={actions.handleEnableBrowserNotifications} /> : undefined}

      {currentView === "projects" ? (
        <ProjectsView
          onCompose={projectId => setComposer({projectId})}
          currentAreaId={selectedWorkspace.member.area?.id}
          currentLocalityId={selectedWorkspace.member.locality?.id}
          projects={visibleProjects}
          areas={areas}
          localities={localities}
          activeProjectId={activeProjectId}
          isLoading={isLoadingProjects}
          canCreateProjects={permissions.canCreateProjects}
          canDeleteProjects={permissions.canDeleteProjects}
          onRefresh={() => void actions.loadProjects()}
          onSelectProject={(projectId) => {
            actions.setActiveProjectId(projectId);
            actions.setCurrentView("board");
          }}
          onCreateProject={actions.handleCreateProject}
          onUpdateProject={actions.handleUpdateProject}
          onArchiveProject={actions.handleArchiveProject}
        />
      ) : undefined}

      {currentView === "board" ? (
        <>
          <div className="board-layout">
            <BoardView
              onProjects={() => actions.setCurrentView('projects')}
              canUseChat={selectedWorkspace.member.userType === 'INTERNAL' && projectPermissions.has('task.view_all')}
              chatPanel={activeProject && <ProjectChat key={activeProject.id} token={session.tokens.accessToken} project={activeProject} currentUserId={session.user.id} connectionState={controller.connectionState} />}
              onCompose={options => setComposer({ projectId: activeProjectId, ...options })}
              key={activeBoard?.id ?? activeProjectId ?? "board"}
              boards={controller.boards}
              onBoardChange={actions.setActiveBoardId}
              canChangeTaskStatus={permissions.canChangeTaskStatus}
              onRequestStaffing={projectPermissions.has("project.request_staffing") ? () => actions.openNotificationUrl(`/management?create=1&project=${activeProjectId ?? ""}`) : undefined}
              projects={visibleProjects}
              activeProject={activeProject}
              activeBoard={activeBoard}
              tasks={tasks.filter((task) => task.boardId === activeBoard?.id)}
              boardMode={boardMode}
              isLoading={isLoadingBoard}
              selectedTaskId={selectedTaskId}
              currentUserId={session.user.id}
              workspaceMembers={members}
              roles={roles}
              canCreateTasks={projectPermissions.has("task.create")}
              canManageProjectMembers={projectPermissions.has("project.manage_members")}
              canEditCompletedTasks={permissions.canReopenTasks}
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
            canDeleteTask={projectPermissions.has('task.delete')}
            onOpenChat={selectedWorkspace.member.userType === 'INTERNAL' ? () => actions.openNotificationUrl(`/board?workspace=${selectedWorkspace.id}&project=${activeProjectId}&chat=1`) : undefined}
            connectionState={controller.connectionState}
            token={session.tokens.accessToken}
            onReload={async () => { if (selectedTaskId) await actions.loadSelectedTaskDetail(selectedTaskId, {silent:true}); if (activeProjectId) await actions.loadProjectContext(activeProjectId, {silent:true}); }}
            key={selectedTask?.id ?? "no-task"}
            canUseInternalComments={selectedWorkspace.member.userType === "INTERNAL"}
            canUpdateTasks={permissions.canUpdateTasks}
            canUpdateProgress={permissions.canUpdateProgress}
            canChangeTaskStatus={permissions.canChangeTaskStatus}
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
            canMoveClosedTasks={permissions.canReopenTasks}
            canViewPlanning={permissions.canUseManagerPlanning}
            canEditPlanning={permissions.canUpdateTasks}
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

      {(currentView === 'work' || currentView === 'completed') && <WorkItemsView key={`${selectedWorkspace.id}-${currentView}`} token={session.tokens.accessToken} workspaceId={selectedWorkspace.id} completed={currentView === 'completed'} onCreate={permissions.canCreateTasks ? () => setComposer({}) : undefined} userName={session.user.name} unreadCount={controller.inbox.unreadCount} onInbox={() => actions.setCurrentView('notifications')} onProjects={() => actions.setCurrentView('projects')} onOpen={(projectId, taskId) => actions.openNotificationUrl(`/board?workspace=${selectedWorkspace.id}&project=${projectId}&task=${taskId}`)} />}
      {currentView === 'roles' && <RolesView key={selectedWorkspace.id} token={session.tokens.accessToken} workspaceId={selectedWorkspace.id} onSaved={() => { void actions.loadMembers(); void actions.loadWorkspaces(); }} onPeople={roleId => actions.openNotificationUrl(`/members?role=${roleId}`)} />}
      {currentView === 'organization' && <OrganizationView token={session.tokens.accessToken} workspaceId={selectedWorkspace.id} onSaved={() => actions.loadWorkspaceCatalog()} key={selectedWorkspace.id} areas={areas} localities={localities} positions={positions} members={members} workspacePermissions={selectedWorkspace.member.permissions ?? []} onCreateArea={actions.handleCreateArea} onCreateLocality={actions.handleCreateLocality} onCreatePosition={actions.handleCreatePosition} />}

      {currentView === "management" ? (
        <ManagementView
          staffingRequests={staffingRequests}
          staffingPagination={staffingPagination}
          staffingPages={staffingPages}
          staffingPageSize={staffingPageSize}
          projects={visibleProjects}
          members={members}
          areas={controller.staffingCatalog?.areas ?? areas}
          localities={controller.staffingCatalog?.localities ?? localities}
          positions={controller.staffingCatalog?.positions ?? positions}
          roles={roles}
          currentAreaId={selectedWorkspace.member.area?.id}
          canAnswerAllRequests={permissions.canAnswerAllStaffingRequests}
          isLoading={isLoadingManagement}
          onRefresh={() => void actions.loadManagement()}
          onCreateStaffingRequest={actions.handleCreateStaffingRequest}
          onApproveStaffingRequest={actions.handleApproveStaffingRequest}
          onRejectStaffingRequest={actions.handleRejectStaffingRequest}
          onPageChange={actions.setStaffingStatusPage}
        />
      ) : undefined}

      {currentView === "members" ? (
        <MembersView
          onAssign={permissions.canCreateTasks ? userId => setComposer({assigneeId:userId, projectId:visibleProjects.find(project => project.areaId === members.find(member => member.userId===userId)?.areaId && project.permissions?.includes('task.create'))?.id}) : undefined}
          token={session.tokens.accessToken}
          workspaceId={selectedWorkspace.id}
          key={selectedWorkspace.id}
          currentAreaId={selectedWorkspace.member.area?.id}
          currentLocalityIds={selectedWorkspace.member.localityScopes?.map(scope => scope.localityId) ?? (selectedWorkspace.member.locality ? [selectedWorkspace.member.locality.id] : [])}
          onRoles={permissions.canManageRoles ? () => actions.setCurrentView('roles') : undefined}
          workspacePermissions={selectedWorkspace.member.permissions ?? []}
          currentUserId={session.user.id}
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
          onOpenProject={projectId => actions.openNotificationUrl(`/board?workspace=${selectedWorkspace.id}&project=${projectId}`)}
          onOpenTask={(projectId, taskId) => actions.openNotificationUrl(`/board?workspace=${selectedWorkspace.id}&project=${projectId}&task=${taskId}`)}
          summary={summary}
          period={reportPeriod}
          isLoading={isLoadingReports}
          onPeriodChange={actions.setReportPeriod}
          onRefresh={() => void actions.loadReports()}
        />
      ) : undefined}

      {composer && <TaskComposer token={session.tokens.accessToken} projects={visibleProjects} initial={composer} currentUserId={session.user.id} onClose={() => setComposer(undefined)} onCreated={(projectId, taskId) => { setComposer(undefined); actions.openNotificationUrl(`/board?workspace=${selectedWorkspace.id}&project=${projectId}&task=${taskId}`); }} />}
      <RealtimeNotifications onOpen={actions.openNotificationUrl} notifications={notifications} onDismiss={actions.dismissNotification} />
    </MainLayout>
  );
}
