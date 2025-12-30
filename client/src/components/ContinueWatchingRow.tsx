import { useQuery } from '@tanstack/react-query';
import { Movie, WatchProgress } from '@shared/schema';
import { Link } from 'wouter';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

interface ContinueWatchingItem extends WatchProgress {
  movie: Movie;
}

export default function ContinueWatchingRow() {
  const { data: continueWatching = [], isLoading } = useQuery<ContinueWatchingItem[]>({
    queryKey: ['/api/continue-watching'],
  });

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        <h2 className="text-2xl font-bold mb-4">Continue Watching</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="bg-muted aspect-[2/3] rounded-md"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (continueWatching.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-6">
      <h2 className="text-2xl font-bold mb-4" data-testid="text-continue-watching-title">Continue Watching</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-tv-nav>
        {continueWatching.map((item) => {
          const progressPercent = (item.progressSeconds / item.duration) * 100;
          
          return (
            <Link key={item.id} href={`/movie/${item.movie.id}`}>
              <div className="group relative cursor-pointer" data-testid={`card-continue-watching-${item.movie.id}`}>
                <div className="relative aspect-[2/3] rounded-md overflow-hidden">
                  <img
                    src={item.movie.poster}
                    alt={item.movie.title}
                    className="w-full h-full object-cover transition-transform group-hover:scale-105"
                    data-testid={`img-poster-${item.movie.id}`}
                  />
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button size="icon" variant="default" className="rounded-full" data-testid={`button-play-${item.movie.id}`}>
                      <Play className="h-6 w-6 fill-current" />
                    </Button>
                  </div>
                  <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/90 to-transparent">
                    <Progress value={progressPercent} className="h-1 mb-1" data-testid={`progress-bar-${item.movie.id}`} />
                    <p className="text-xs text-white/90">{Math.floor(progressPercent)}% watched</p>
                  </div>
                </div>
                <h3 className="mt-2 text-sm font-medium line-clamp-1" data-testid={`text-title-${item.movie.id}`}>
                  {item.movie.title}
                </h3>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
