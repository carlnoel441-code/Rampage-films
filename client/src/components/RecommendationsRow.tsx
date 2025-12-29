import { useQuery } from '@tanstack/react-query';
import { Movie } from '@shared/schema';
import MovieCard from './MovieCard';
import { Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

export default function RecommendationsRow() {
  const { user } = useAuth();
  const { data: recommendations = [], isLoading } = useQuery<Movie[]>({
    queryKey: ['/api/recommendations'],
    enabled: !!user,
  });

  if (!user || isLoading) {
    return null;
  }

  if (recommendations.length === 0) {
    return null;
  }

  return (
    <div className="px-4 py-6">
      <div className="flex items-center gap-2 mb-4">
        <Sparkles className="h-6 w-6 text-primary" data-testid="icon-recommendations" />
        <h2 className="text-2xl font-bold" data-testid="text-recommendations-title">Recommended For You</h2>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4" data-tv-nav>
        {recommendations.map((movie) => (
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
