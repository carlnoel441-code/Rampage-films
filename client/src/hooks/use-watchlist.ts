import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Movie } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';

export function useWatchlist() {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const watchlistQuery = useQuery<Movie[]>({
    queryKey: ['/api/watchlist'],
    enabled: !!user,
  });

  const { data: watchlist = [] } = watchlistQuery;

  const addMutation = useMutation({
    mutationFn: (movieId: string) => apiRequest(`/api/watchlist/${movieId}`, 'POST'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
  });

  const removeMutation = useMutation({
    mutationFn: (movieId: string) => apiRequest(`/api/watchlist/${movieId}`, 'DELETE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/watchlist'] });
    },
  });

  const toggleWatchlist = (movieId: string, isInList: boolean) => {
    if (isInList) {
      removeMutation.mutate(movieId);
    } else {
      addMutation.mutate(movieId);
    }
  };

  const isInWatchlist = (movieId: string) => {
    return watchlist.some(movie => movie.id === movieId);
  };

  return {
    watchlist,
    toggleWatchlist,
    isInWatchlist,
    isLoading: watchlistQuery.isLoading,
    isMutating: addMutation.isPending || removeMutation.isPending,
  };
}
