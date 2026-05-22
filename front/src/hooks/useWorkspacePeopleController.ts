import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveWorkspaceMember,
  createWorkspaceArea,
  createWorkspaceLocality,
  createWorkspacePosition,
  inviteUser,
  listPendingWorkspaceMembers,
  listWorkspaceAreas,
  listWorkspaceLocalities,
  listWorkspaceMembers,
  listWorkspacePositions,
  listWorkspaceRoles,
  updateWorkspaceMember
} from "../api/endpoints";
import { queryKeys } from "../lib/queryKeys";
import type { Area, Locality, Position, Role, UserType, WorkspaceMember } from "../types";

type LoadOptions = {
  silent?: boolean;
};

type UseWorkspacePeopleControllerOptions = {
  token?: string;
  workspaceId?: string;
  canLoadMemberDirectory: boolean;
  onError: (message: string) => void;
};

type WorkspaceCatalogData = {
  areas: Area[];
  localities: Locality[];
  positions: Position[];
};

type WorkspaceMembersData = WorkspaceCatalogData & {
  members: WorkspaceMember[];
  pendingMembers: WorkspaceMember[];
  roles: Role[];
};

export function useWorkspacePeopleController({
  token,
  workspaceId,
  canLoadMemberDirectory,
  onError
}: UseWorkspacePeopleControllerOptions) {
  const queryClient = useQueryClient();
  const [members, setMembers] = useState<WorkspaceMember[]>([]);
  const [pendingMembers, setPendingMembers] = useState<WorkspaceMember[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);

  function applyCatalog(catalog: WorkspaceCatalogData) {
    setAreas(catalog.areas);
    setLocalities(catalog.localities);
    setPositions(catalog.positions);
  }

  function applyMembers(data: WorkspaceMembersData) {
    setMembers(data.members);
    setPendingMembers(data.pendingMembers);
    setRoles(data.roles);
    applyCatalog(data);
  }

  async function fetchCatalog(): Promise<WorkspaceCatalogData> {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const [areaResponse, localityResponse, positionResponse] = await Promise.all([
      listWorkspaceAreas(token, workspaceId),
      listWorkspaceLocalities(token, workspaceId),
      listWorkspacePositions(token, workspaceId)
    ]);

    return {
      areas: areaResponse.areas,
      localities: localityResponse.localities,
      positions: positionResponse.positions
    };
  }

  async function fetchMembers(): Promise<WorkspaceMembersData> {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const [memberResponse, pendingResponse, roleResponse, catalog] = await Promise.all([
      listWorkspaceMembers(token, workspaceId),
      listPendingWorkspaceMembers(token, workspaceId),
      listWorkspaceRoles(token, workspaceId),
      fetchCatalog()
    ]);

    return {
      members: memberResponse.members,
      pendingMembers: pendingResponse.members,
      roles: roleResponse.roles,
      areas: catalog.areas,
      localities: catalog.localities,
      positions: catalog.positions
    };
  }

  const catalogQuery = useQuery({
    queryKey: queryKeys.catalog(workspaceId),
    queryFn: fetchCatalog,
    enabled: Boolean(token && workspaceId),
    refetchOnMount: "always"
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.members(workspaceId),
    queryFn: fetchMembers,
    enabled: Boolean(token && workspaceId && canLoadMemberDirectory),
    refetchOnMount: "always"
  });

  async function loadMembers(options: LoadOptions = {}) {
    if (!token || !workspaceId) {
      return;
    }

    try {
      const data = await queryClient.fetchQuery({
        queryKey: queryKeys.members(workspaceId),
        queryFn: fetchMembers,
        staleTime: 0
      });
      applyMembers(data);
    } catch (error) {
      if (!options.silent) {
        onError(error instanceof Error ? error.message : "No se pudieron cargar miembros.");
      }
    }
  }

  async function loadWorkspaceCatalog(options: LoadOptions = {}) {
    if (!token || !workspaceId) {
      return;
    }

    try {
      const catalog = await queryClient.fetchQuery({
        queryKey: queryKeys.catalog(workspaceId),
        queryFn: fetchCatalog,
        staleTime: 0
      });
      applyCatalog(catalog);

      if (canLoadMemberDirectory) {
        const memberData = await queryClient.fetchQuery({
          queryKey: queryKeys.members(workspaceId),
          queryFn: fetchMembers,
          staleTime: 0
        });
        applyMembers(memberData);
      } else {
        setMembers([]);
        setRoles([]);
      }
    } catch (error) {
      if (!options.silent) {
        onError(error instanceof Error ? error.message : "No se pudieron cargar areas y puestos.");
      }
    }
  }

  async function handleInviteUser(input: {
    email: string;
    userType: UserType;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    projectId?: string;
    expiresInDays: number;
  }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await inviteUser(token, {
      workspaceId,
      ...input
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) });
    await loadMembers();
    return response.inviteToken;
  }

  async function handleCreateArea(input: { name: string; description?: string }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await createWorkspaceArea(token, {
      workspaceId,
      ...input
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) });
    setAreas((currentAreas) => [...currentAreas, response.area]);
  }

  async function handleCreateLocality(input: { areaId?: string; name: string; code: string; description?: string }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await createWorkspaceLocality(token, {
      workspaceId,
      ...input
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) });
    setLocalities((currentLocalities) => [...currentLocalities, response.locality]);
  }

  async function handleCreatePosition(input: {
    areaId?: string;
    name: string;
    description?: string;
    isManager: boolean;
  }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await createWorkspacePosition(token, {
      workspaceId,
      ...input
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.catalog(workspaceId) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) });
    setPositions((currentPositions) => [...currentPositions, response.position]);
  }

  async function handleApproveMember(input: {
    memberId: string;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    userType?: UserType;
  }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await approveWorkspaceMember(token, {
      workspaceId,
      ...input
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) });
    setPendingMembers((currentMembers) => currentMembers.filter((member) => member.id !== response.member.id));
    setMembers((currentMembers) => [response.member, ...currentMembers.filter((member) => member.id !== response.member.id)]);
  }

  async function handleUpdateMember(input: {
    memberId: string;
    roleId?: string;
    areaId?: string;
    localityId?: string;
    localityIds?: string[];
    positionId?: string;
    userType?: UserType;
  }) {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const response = await updateWorkspaceMember(token, {
      workspaceId,
      ...input
    });
    void queryClient.invalidateQueries({ queryKey: queryKeys.members(workspaceId) });
    setMembers((currentMembers) =>
      currentMembers.map((member) => member.id === response.member.id ? response.member : member)
    );
  }

  function resetPeopleState() {
    setMembers([]);
    setPendingMembers([]);
    setRoles([]);
    setAreas([]);
    setPositions([]);
    setLocalities([]);
  }

  useEffect(() => {
    if (catalogQuery.data) {
      applyCatalog(catalogQuery.data);
    }
  }, [catalogQuery.data, catalogQuery.dataUpdatedAt]);

  useEffect(() => {
    if (membersQuery.data) {
      applyMembers(membersQuery.data);
    }
  }, [membersQuery.data, membersQuery.dataUpdatedAt]);

  useEffect(() => {
    if (catalogQuery.error) {
      onError(catalogQuery.error instanceof Error ? catalogQuery.error.message : "No se pudieron cargar areas y puestos.");
    }
  }, [catalogQuery.error]);

  useEffect(() => {
    if (membersQuery.error) {
      onError(membersQuery.error instanceof Error ? membersQuery.error.message : "No se pudieron cargar miembros.");
    }
  }, [membersQuery.error]);

  return {
    members,
    pendingMembers,
    roles,
    areas,
    localities,
    positions,
    isLoadingMembers: membersQuery.isFetching,
    actions: {
      loadMembers,
      loadWorkspaceCatalog,
      handleInviteUser,
      handleCreateArea,
      handleCreateLocality,
      handleCreatePosition,
      handleApproveMember,
      handleUpdateMember,
      resetPeopleState
    }
  };
}

export type WorkspacePeopleController = ReturnType<typeof useWorkspacePeopleController>;
