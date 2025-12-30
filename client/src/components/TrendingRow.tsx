import { useQuery } from '@tanstack/react-query';
import { Movie } from '@shared/schema';
import MovieCard from './MovieCard';
import { TrendingUp } from 'lucide-react';

export default function TrendingRow() {
  const { data: trending = [], isLoading } = useQuery<Movie[]>({
    queryKey: ['/api/trending'],
  });

  if (isLoading) {
    return (
      <div className="px-4 py-6">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-bold">Trending Now</h2>
        </div>
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

  if (trending.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <TrendingUp className="h-6 w-6 text-primary" data-testid="icon-trending" />
        <h2 className="text-2xl font-bold" data-testid="text-trending-title">Trending Now</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-tv-nav>
        {trending.map((movie) => (
          <MovieCard 
            key={movie.id}
            id={movie.id}
            title={movie.title}
            year={movie.year}
            rating={movie.rating}
            poster={movie.poster}
            genre={movie.genres[0]}
          />
        ))}
      </div>
    </div>
  );
}
