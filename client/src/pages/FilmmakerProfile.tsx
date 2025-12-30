import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { 
  Film, Globe, User, Eye, ArrowLeft, Heart, ExternalLink
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import TipJar from "@/components/TipJar";

interface FilmmakerProfileData {
  id: string;
  displayName: string;
  bio: string | null;
  websiteUrl: string | null;
  profileImageUrl: string | null;
  totalMovies: number;
  movies: Array<{
    id: string;
    title: string;
    year: number | null;
    poster: string | null;
    description: string;
    genres: string[];
    viewCount: number | null;
  }>;
}

export default function FilmmakerProfile() {
  const [, setLocation] = useLocation();
  const [match, params] = useRoute("/filmmaker/:id");
  const filmmakerId = params?.id;

  const { data: profile, isLoading, error } = useQuery<FilmmakerProfileData>({
    queryKey: ['/api/filmmakers', filmmakerId, 'profile'],
    enabled: !!filmmakerId,
  });

  if (!match || !filmmakerId) {
    return null;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 flex items-center justify-center">
          <div className="h-12 w-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <User className="h-16 w-16 text-muted-foreground mx-auto mb-4" />
          <h1 className="text-2xl font-bold mb-4">Filmmaker Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This filmmaker profile doesn't exist or isn't available.
          </p>
          <Button onClick={() => setLocation('/')} data-testid="button-home">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Home
          </Button>
        </div>
        <Footer />
      </div>
    );
  }

  const initials = profile.displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 px-4 md:px-8 lg:px-12 max-w-[1400px] mx-auto py-8">
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/')}
          className="mb-6"
          data-testid="button-back"
        >
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>

        <div className="flex flex-col md:flex-row gap-8 mb-12">
          <div className="flex-shrink-0">
            <Avatar className="h-32 w-32 border-4 border-primary/20">
              <AvatarImage src={profile.profileImageUrl || undefined} alt={profile.displayName} />
              <AvatarFallback className="text-3xl bg-primary/10 text-primary">
                {initials}
              </AvatarFallback>
            </Avatar>
          </div>
          
          <div className="flex-1">
            <h1 className="text-3xl font-bold mb-2" data-testid="text-filmmaker-name">
              {profile.displayName}
            </h1>
            
            {profile.bio && (
              <p className="text-muted-foreground mb-4 max-w-2xl">
                {profile.bio}
              </p>
            )}
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Film className="h-4 w-4" />
                <span>{profile.totalMovies} film{profile.totalMovies !== 1 ? 's' : ''}</span>
              </div>
              
              {profile.websiteUrl && (
                <a 
                  href={profile.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                  data-testid="link-website"
                >
                  <Globe className="h-4 w-4" />
                  Website
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
          
          {profile.movies.length > 0 && (
            <div className="flex-shrink-0">
              <Card className="bg-primary/5 border-primary/20">
                <CardContent className="p-6 text-center">
                  <Heart className="h-8 w-8 text-primary mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground mb-3">
                    Support this filmmaker
                  </p>
                  <TipJar 
                    variant="button"
                    tipType="filmmaker_split"
                    movieId={profile.movies[0].id}
                    filmmakerName={profile.displayName}
                    buttonText="Send a Tip"
                  />
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <div>
          <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
            <Film className="h-6 w-6 text-primary" />
            Films by {profile.displayName}
          </h2>
          
          {profile.movies.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Film className="h-16 w-16 mx-auto mb-4 opacity-30" />
              <p>No films available yet.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {profile.movies.map((movie) => (
                <Card 
                  key={movie.id}
                  className="overflow-hidden cursor-pointer hover:border-primary/30 transition-all hover:scale-[1.02]"
                  onClick={() => setLocation(`/movie/${movie.id}`)}
                  data-testid={`card-movie-${movie.id}`}
                >
                  <div className="aspect-[2/3] bg-card relative">
                    {movie.poster ? (
                      <img 
                        src={movie.poster} 
                        alt={movie.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-primary/5">
                        <Film className="h-12 w-12 text-primary/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h3 className="font-medium text-white text-sm line-clamp-2">
                        {movie.title}
                      </h3>
                      {movie.year && (
                        <p className="text-xs text-white/70 mt-1">{movie.year}</p>
                      )}
                    </div>
                  </div>
                  <CardContent className="p-3">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Eye className="h-3 w-3" />
                        {movie.viewCount?.toLocaleString() || 0}
                      </div>
                      {movie.genres?.[0] && (
                        <span className="truncate">{movie.genres[0]}</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
