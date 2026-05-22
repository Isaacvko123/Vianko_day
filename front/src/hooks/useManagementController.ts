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
import type { PaginationMeta, StaffingRequest, StaffingRequestStatus } from "../types";

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
  const [staffingPagination, setStaffingPagination] = useState<Partial<Record<StaffingRequestStatus, PaginationMeta>>>({});
  const [staffingPages, setStaffingPages] = useState<Record<"PENDING" | "APPROVED" | "REJECTED", number>>({
    PENDING: 1,
    APPROVED: 1,
    REJECTED: 1
  });
  const staffingPageSize = 8;

  async function fetchManagement() {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    const [pendingResponse, approvedResponse, rejectedResponse] = await Promise.all([
      listStaffingRequests(token, workspaceId, {
        status: "PENDING",
        limit: staffingPageSize,
        offset: (staffingPages.PENDING - 1) * staffingPageSize
      }),
      listStaffingRequests(token, workspaceId, {
        status: "APPROVED",
        limit: staffingPageSize,
        offset: (staffingPages.APPROVED - 1) * staffingPageSize
      }),
      listStaffingRequests(token, workspaceId, {
        status: "REJECTED",
        limit: staffingPageSize,
        offset: (staffingPages.REJECTED - 1) * staffingPageSize
      })
    ]);

    return {
      staffingRequests: [
        ...pendingResponse.staffingRequests,
        ...approvedResponse.staffingRequests,
        ...rejectedResponse.staffingRequests
      ],
      pagination: {
        PENDING: pendingResponse.pagination,
        APPROVED: approvedResponse.pagination,
        REJECTED: rejectedResponse.pagination
      }
    };
  }

  const managementQuery = useQuery({
    queryKey: queryKeys.management(workspaceId, staffingPages),
    queryFn: fetchManagement,
    enabled: Boolean(token && workspaceId && enabled)
  });

  async function loadManagement(options: LoadOptions = {}) {
    if (!token || !workspaceId) {
      return;
    }

    try {
      const staffingResponse = await queryClient.fetchQuery({
        queryKey: queryKeys.management(workspaceId, staffingPages),
        queryFn: fetchManagement,
        staleTime: 0
      });
      setStaffingRequests(staffingResponse.staffingRequests);
      setStaffingPagination(staffingResponse.pagination);
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
    setStaffingPages((currentPages) => ({ ...currentPages, PENDING: 1 }));
    setStaffingRequests((currentRequests) => [
      response.staffingRequest,
      ...currentRequests.filter((request) => request.id !== response.staffingRequest.id)
    ]);
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
    setStaffingPages((currentPages) => ({ ...currentPages, APPROVED: 1 }));
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
    setStaffingPages((currentPages) => ({ ...currentPages, REJECTED: 1 }));
    setStaffingRequests((currentRequests) =>
      currentRequests.map((request) => request.id === response.staffingRequest.id ? response.staffingRequest : request)
    );
  }

  function setStaffingStatusPage(status: "PENDING" | "APPROVED" | "REJECTED", page: number) {
    setStaffingPages((currentPages) => ({
      ...currentPages,
      [status]: Math.max(1, page)
    }));
  }

  function resetManagementState() {
    setStaffingRequests([]);
    setStaffingPagination({});
    setStaffingPages({
      PENDING: 1,
      APPROVED: 1,
      REJECTED: 1
    });
  }

  useEffect(() => {
    if (managementQuery.data) {
      setStaffingRequests(managementQuery.data.staffingRequests);
      setStaffingPagination(managementQuery.data.pagination);
    }
  }, [managementQuery.dataUpdatedAt]);

  useEffect(() => {
    if (managementQuery.error) {
      onError(managementQuery.error instanceof Error ? managementQuery.error.message : "No se pudo cargar gerencia.");
    }
  }, [managementQuery.error]);

  return {
    staffingRequests,
    staffingPagination,
    staffingPages,
    staffingPageSize,
    isLoadingManagement: managementQuery.isFetching,
    actions: {
      loadManagement,
      handleCreateStaffingRequest,
      handleApproveStaffingRequest,
      handleRejectStaffingRequest,
      setStaffingStatusPage,
      resetManagementState
    }
  };
}

export type ManagementController = ReturnType<typeof useManagementController>;
