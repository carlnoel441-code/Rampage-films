import { useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { type GenreCount } from "@shared/schema";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Film } from "lucide-react";

export default function AllGenres() {
  const [, setLocation] = useLocation();

  const { data: genres, isLoading } = useQuery<GenreCount[]>({
    queryKey: ["/api", "genres"],
  });

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
            <h1 className="text-4xl md:text-5xl font-serif font-bold mb-2" data-testid="text-genres-title">
              Browse by Genre
            </h1>
            <p className="text-foreground/70 text-lg">
              Explore our collection across {genres?.length || 0} genres
            </p>
          </div>

          {isLoading && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center space-y-4">
                <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-foreground/70">Loading genres...</p>
              </div>
            </div>
          )}

          {!isLoading && genres && genres.length === 0 && (
            <div className="text-center py-20 space-y-4">
              <p className="text-foreground/60 text-lg">No genres found</p>
              <Button onClick={() => setLocation("/")} data-testid="button-home">
                Browse All Movies
              </Button>
            </div>
          )}

          {!isLoading && genres && genres.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {genres.map((genre) => (
                <Card
                  key={genre.name}
                  className="hover-elevate active-elevate-2 cursor-pointer transition-all"
                  onClick={() => setLocation(`/genre/${genre.name}`)}
                  data-testid={`card-genre-${genre.name.toLowerCase().replace(/\s+/g, '-')}`}
                >
                  <CardHeader>
                    <div className="flex items-center gap-2 mb-2">
                      <Film className="h-5 w-5 text-primary" />
                    </div>
                    <CardTitle className="text-xl" data-testid={`text-genre-name-${genre.name.toLowerCase().replace(/\s+/g, '-')}`}>
                      {genre.name}
                    </CardTitle>
                    <CardDescription data-testid={`text-genre-count-${genre.name.toLowerCase().replace(/\s+/g, '-')}`}>
                      {genre.count} {genre.count === 1 ? 'movie' : 'movies'}
                    </CardDescription>
                  </CardHeader>
                </Card>
              ))}
            </div>
          )}
        </div>
        <Footer />
      </div>
    </div>
  );
}
