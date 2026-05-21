import { useState } from "react";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveStaffingRequest,
  createStaffingRequest,
  listStaffingRequests,
  rejectStaffingRequest
} from "../api/endpoints";
import { queryKeys } from "../lib/queryKeys";
import type { StaffingRequest } from "../types";

type LoadOptions = {
  silent?: boolean;
};

type UseManagementControllerOptions = {
  token?: string;
  workspaceId?: string;
  enabled: boolean;
  onError: (message: string) => void;
};

export function useManagementController({ token, workspaceId, enabled, onError }: UseManagementControllerOptions) {
  const queryClient = useQueryClient();
  const [staffingRequests, setStaffingRequests] = useState<StaffingRequest[]>([]);

  async function fetchManagement() {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    return listStaffingRequests(token, workspaceId);
  }

  const managementQuery = useQuery({
    queryKey: queryKeys.management(workspaceId),
    queryFn: fetchManagement,
    enabled: Boolean(token && workspaceId && enabled)
  });

  async function loadManagement(options: LoadOptions = {}) {
    if (!token || !workspaceId) {
      return;
    }

    try {
      const staffingResponse = await queryClient.fetchQuery({
        queryKey: queryKeys.management(workspaceId),
        queryFn: fetchManagement,
        staleTime: 0
      });
      setStaffingRequests(staffingResponse.staffingRequests);
    } catch (error) {
      if (!options.silent) {
        onError(error instanceof Error ? error.message : "No se pudo cargar gerencia.");
      }
    }
  }

  async function handleCreateStaffingRequest(input: {
    projectId: string;
    targetAreaId: string;
    targetLocalityId?: string;
    positionId?: string;
    roleId?: string;
    requestedUserId?: string;
    quantity: number;
    note?: string;
  }) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await createStaffingRequest(token, input);
    void queryClient.invalidateQueries({ queryKey: queryKeys.management(workspaceId) });
    setStaffingRequests((currentRequests) => [response.staffingRequest, ...currentRequests]);
  }

  async function handleApproveStaffingRequest(input: {
    requestId: string;
    approvedUserIds: string[];
    responseNote?: string;
  }) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await approveStaffingRequest(token, input);
    void queryClient.invalidateQueries({ queryKey: queryKeys.management(workspaceId) });
    setStaffingRequests((currentRequests) =>
      currentRequests.map((request) => request.id === response.staffingRequest.id ? response.staffingRequest : request)
    );
  }

  async function handleRejectStaffingRequest(input: {
    requestId: string;
    responseNote?: string;
  }) {
    if (!token) {
      throw new Error("Sesion no disponible.");
    }

    const response = await rejectStaffingRequest(token, input);
    void queryClient.invalidateQueries({ queryKey: queryKeys.management(workspaceId) });
    setStaffingRequests((currentRequests) =>
      currentRequests.map((request) => request.id === response.staffingRequest.id ? response.staffingRequest : request)
    );
  }

  function resetManagementState() {
    setStaffingRequests([]);
  }

  useEffect(() => {
    if (managementQuery.data) {
      setStaffingRequests(managementQuery.data.staffingRequests);
    }
  }, [managementQuery.dataUpdatedAt]);

  useEffect(() => {
    if (managementQuery.error) {
      onError(managementQuery.error instanceof Error ? managementQuery.error.message : "No se pudo cargar gerencia.");
    }
  }, [managementQuery.error]);

  return {
    staffingRequests,
    isLoadingManagement: managementQuery.isFetching,
    actions: {
      loadManagement,
      handleCreateStaffingRequest,
      handleApproveStaffingRequest,
      handleRejectStaffingRequest,
      resetManagementState
    }
  };
}

export type ManagementController = ReturnType<typeof useManagementController>;
