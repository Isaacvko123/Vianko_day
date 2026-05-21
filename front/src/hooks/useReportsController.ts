import { useState } from "react";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getWorkspaceSummary } from "../api/endpoints";
import { queryKeys } from "../lib/queryKeys";
import type { WorkspaceSummary } from "../types";

type LoadOptions = {
  silent?: boolean;
};

type UseReportsControllerOptions = {
  token?: string;
  workspaceId?: string;
  enabled: boolean;
  onError: (message: string) => void;
};

export function useReportsController({ token, workspaceId, enabled, onError }: UseReportsControllerOptions) {
  const queryClient = useQueryClient();
  const [summary, setSummary] = useState<WorkspaceSummary>();

  async function fetchReports() {
    if (!token || !workspaceId) {
      throw new Error("Workspace no disponible.");
    }

    return getWorkspaceSummary(token, workspaceId);
  }

  const reportsQuery = useQuery({
    queryKey: queryKeys.reports(workspaceId),
    queryFn: fetchReports,
    enabled: Boolean(token && workspaceId && enabled)
  });

  async function loadReports(options: LoadOptions = {}) {
    if (!token || !workspaceId) {
      return;
    }

    try {
      setSummary(await queryClient.fetchQuery({
        queryKey: queryKeys.reports(workspaceId),
        queryFn: fetchReports,
        staleTime: 0
      }));
    } catch (error) {
      if (!options.silent) {
        onError(error instanceof Error ? error.message : "No se pudieron cargar reportes.");
      }
    }
  }

  function resetReportsState() {
    setSummary(undefined);
  }

  useEffect(() => {
    if (reportsQuery.data) {
      setSummary(reportsQuery.data);
    }
  }, [reportsQuery.dataUpdatedAt]);

  useEffect(() => {
    if (reportsQuery.error) {
      onError(reportsQuery.error instanceof Error ? reportsQuery.error.message : "No se pudieron cargar reportes.");
    }
  }, [reportsQuery.error]);

  return {
    summary,
    isLoadingReports: reportsQuery.isFetching,
    actions: {
      loadReports,
      resetReportsState
    }
  };
}

export type ReportsController = ReturnType<typeof useReportsController>;
