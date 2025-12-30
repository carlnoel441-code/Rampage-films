import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { type Movie } from "@shared/schema";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import MovieCard from "@/components/MovieCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

export default function GenrePage() {
  const { genre } = useParams();
  const [, setLocation] = useLocation();

  const { data: movies, isLoading } = useQuery<Movie[]>({
    queryKey: ['/api/movies/genre', genre],
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-16 flex items-center justify-center min-h-[60vh]">
          <div className="text-center space-y-4">
            <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-foreground/70">Loading {genre} movies...</p>
          </div>
        </div>
        <Footer />
      </div>
    );
  }

  const genreMovies = (movies || []).map(m => ({
    id: m.id,
    title: m.title,
    year: m.year,
    rating: m.rating,
    poster: m.poster,
    genre: m.genres[0]
  }));

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-16">
        <div className="px-4 md:px-8 lg:px-12 max-w-[1920px] mx-auto py-12">
          <Button
            variant="ghost"
            onClick={() => setLocation("/")}
            className="mb-6 gap-2"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Button>

          <div className="mb-8">
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-2" data-testid="text-genre-title">
              {genre}
            </h1>
            <p className="text-foreground/70 text-lg">
              {genreMovies.length} {genreMovies.length === 1 ? 'movie' : 'movies'} available
            </p>
          </div>

          {genreMovies.length === 0 ? (
            <div className="text-center py-20 space-y-4">
              <p className="text-foreground/60 text-lg">No movies found in this genre</p>
              <Button onClick={() => setLocation("/")} data-testid="button-home">
                Browse All Movies
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
              {genreMovies.map((movie) => (
                <MovieCard
                  key={movie.id}
                  id={movie.id}
                  title={movie.title}
                  year={movie.year}
                  rating={movie.rating}
                  poster={movie.poster}
                  genre={movie.genre}
                />
              ))}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </div>
  );
}
