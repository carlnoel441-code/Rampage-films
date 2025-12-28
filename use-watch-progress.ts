import { useEffect, useRef } from 'react';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from './useAuth';

export function useWatchProgress(movieId: string, currentTime: number, duration: number, isPlaying: boolean) {
  const { user, isLoading } = useAuth();
  const lastSavedTime = useRef(0);
  const saveIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (isLoading || !user || !movieId || duration === 0) return;

    const saveProgress = async () => {
      if (Math.abs(currentTime - lastSavedTime.current) > 5) {
        try {
          await apiRequest(`/api/progress/${movieId}`, 'POST', {
            progressSeconds: Math.floor(currentTime),
            duration: Math.floor(duration)
          });
          lastSavedTime.current = currentTime;
        } catch (error) {
          console.error('Failed to save progress:', error);
        }
      }
    };

    if (isPlaying) {
      saveIntervalRef.current = setInterval(saveProgress, 10000);
    }

    return () => {
      if (saveIntervalRef.current) {
        clearInterval(saveIntervalRef.current);
      }
      if (currentTime > 0 && duration > 0) {
        saveProgress();
      }
    };
  }, [movieId, currentTime, duration, isPlaying, user, isLoading]);
}
