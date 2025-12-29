import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Profile } from "@shared/schema";

interface UseProfileOptions {
  enabled?: boolean;
}

export function useProfile(options: UseProfileOptions = {}) {
  const { enabled = false } = options;

  const { data, isLoading } = useQuery<{ profile: Profile | null }>({
    queryKey: ["/api/profiles/current"],
    retry: false,
    enabled,
  });

  const selectProfileMutation = useMutation({
    mutationFn: async (profileId: string) => {
      return await apiRequest("POST", `/api/profiles/${profileId}/select`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profiles/current"] });
    },
  });

  return {
    currentProfile: data?.profile || null,
    isLoading,
    selectProfile: selectProfileMutation.mutateAsync,
    isSelecting: selectProfileMutation.isPending,
  };
}
