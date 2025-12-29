import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { X, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { apiRequest } from "@/lib/queryClient";

interface SponsorshipPlacement {
  id: string;
  sponsorId: string;
  placementType: string;
  headline: string | null;
  description: string | null;
  imageUrl: string | null;
  clickUrl: string | null;
  sponsor?: {
    name: string;
    logoUrl: string | null;
  };
}

interface SponsorCardProps {
  placementType: 'pre_roll_card' | 'hero_banner' | 'collection_sponsor' | 'footer_banner';
  movieId?: string;
  collectionId?: string;
  genre?: string;
  onComplete?: () => void;
  autoSkipDelay?: number;
  showSkip?: boolean;
}

export function SponsorCard({ 
  placementType, 
  movieId, 
  collectionId, 
  genre,
  onComplete,
  autoSkipDelay = 5,
  showSkip = true
}: SponsorCardProps) {
  const [countdown, setCountdown] = useState(autoSkipDelay);
  const [canSkip, setCanSkip] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const impressionTrackedRef = useRef<string | null>(null);

  const params = new URLSearchParams();
  params.append('type', placementType);
  if (movieId) params.append('movieId', movieId);
  if (collectionId) params.append('collectionId', collectionId);
  if (genre) params.append('genre', genre);

  const { data: placement, isLoading } = useQuery<SponsorshipPlacement>({
    queryKey: ['/api/sponsors/placement', placementType, movieId, collectionId, genre],
    queryFn: async () => {
      const response = await fetch(`/api/sponsors/placement?${params.toString()}`);
      if (!response.ok) {
        if (response.status === 404) return null;
        throw new Error('Failed to fetch placement');
      }
      return response.json();
    },
    staleTime: 1000 * 60 * 5,
    retry: false
  });

  const trackClickMutation = useMutation({
    mutationFn: (placementId: string) => 
      apiRequest(`/api/sponsors/placements/${placementId}/click`, 'POST'),
  });

  const trackImpressionMutation = useMutation({
    mutationFn: (placementId: string) => 
      apiRequest(`/api/sponsors/placements/${placementId}/impression`, 'POST'),
  });

  // Track impression when placement is first displayed (with idempotency guard for StrictMode)
  useEffect(() => {
    if (placement?.id && !dismissed && impressionTrackedRef.current !== placement.id) {
      impressionTrackedRef.current = placement.id;
      trackImpressionMutation.mutate(placement.id);
    }
  }, [placement?.id, dismissed]);

  useEffect(() => {
    if (!placement || dismissed) return;

    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setCanSkip(true);
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [placement, dismissed]);

  const handleSkip = () => {
    setDismissed(true);
    onComplete?.();
  };

  const handleClick = () => {
    if (placement?.clickUrl) {
      trackClickMutation.mutate(placement.id);
      window.open(placement.clickUrl, '_blank', 'noopener,noreferrer');
    }
  };

  if (isLoading || !placement || dismissed) {
    return null;
  }

  if (placementType === 'pre_roll_card') {
    return (
      <div className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4">
        <Card className="relative max-w-lg w-full bg-card border-primary/20 overflow-hidden">
          {placement.imageUrl && (
            <div 
              className="w-full h-48 bg-cover bg-center cursor-pointer"
              style={{ backgroundImage: `url(${placement.imageUrl})` }}
              onClick={handleClick}
            />
          )}
          <div className="p-6">
            <div className="flex items-center gap-3 mb-4">
              {placement.sponsor?.logoUrl && (
                <img 
                  src={placement.sponsor.logoUrl} 
                  alt={placement.sponsor.name}
                  className="h-8 w-8 object-contain rounded"
                />
              )}
              <span className="text-xs text-muted-foreground uppercase tracking-wider">
                Sponsored by {placement.sponsor?.name}
              </span>
            </div>
            
            {placement.headline && (
              <h3 className="text-xl font-semibold mb-2">{placement.headline}</h3>
            )}
            {placement.description && (
              <p className="text-muted-foreground mb-4">{placement.description}</p>
            )}
            
            <div className="flex items-center justify-between gap-4">
              {placement.clickUrl && (
                <Button onClick={handleClick} className="gap-2">
                  Learn More <ExternalLink className="h-4 w-4" />
                </Button>
              )}
              {showSkip && (
                <Button 
                  variant="ghost" 
                  onClick={handleSkip}
                  disabled={!canSkip}
                  className="ml-auto"
                  data-testid="button-skip-sponsor"
                >
                  {canSkip ? (
                    <>Skip <X className="h-4 w-4 ml-1" /></>
                  ) : (
                    `Skip in ${countdown}s`
                  )}
                </Button>
              )}
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (placementType === 'hero_banner') {
    return (
      <div 
        className="relative w-full rounded-lg overflow-hidden cursor-pointer group"
        onClick={handleClick}
        data-testid="sponsor-hero-banner"
      >
        {placement.imageUrl ? (
          <img 
            src={placement.imageUrl} 
            alt={placement.headline || 'Sponsored content'}
            className="w-full h-40 md:h-56 object-cover transition-transform group-hover:scale-105"
          />
        ) : (
          <div className="w-full h-40 md:h-56 bg-gradient-to-r from-primary/20 to-primary/5" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-6">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs text-primary/80 uppercase tracking-wider">Sponsored</span>
            {placement.sponsor?.name && (
              <span className="text-xs text-white/60">by {placement.sponsor.name}</span>
            )}
          </div>
          {placement.headline && (
            <h3 className="text-lg md:text-xl font-semibold text-white">{placement.headline}</h3>
          )}
          {placement.description && (
            <p className="text-sm text-white/80 mt-1 line-clamp-2">{placement.description}</p>
          )}
        </div>
      </div>
    );
  }

  if (placementType === 'collection_sponsor') {
    return (
      <div 
        className="flex items-center gap-3 px-4 py-2 rounded-lg bg-primary/5 border border-primary/10 cursor-pointer hover-elevate"
        onClick={handleClick}
        data-testid="sponsor-collection"
      >
        {placement.sponsor?.logoUrl && (
          <img 
            src={placement.sponsor.logoUrl} 
            alt={placement.sponsor.name}
            className="h-6 w-6 object-contain rounded"
          />
        )}
        <div className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground">Presented by</span>
          <span className="text-sm font-medium ml-1">{placement.sponsor?.name}</span>
        </div>
        <ExternalLink className="h-4 w-4 text-muted-foreground" />
      </div>
    );
  }

  if (placementType === 'footer_banner') {
    return (
      <div 
        className="w-full py-4 px-6 bg-card border-t border-primary/10 cursor-pointer"
        onClick={handleClick}
        data-testid="sponsor-footer-banner"
      >
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {placement.sponsor?.logoUrl && (
              <img 
                src={placement.sponsor.logoUrl} 
                alt={placement.sponsor.name}
                className="h-8 w-8 object-contain rounded"
              />
            )}
            <div>
              <span className="text-xs text-muted-foreground uppercase tracking-wider">Sponsored</span>
              {placement.headline && (
                <p className="font-medium">{placement.headline}</p>
              )}
            </div>
          </div>
          <Button size="sm" variant="outline" className="gap-2">
            Learn More <ExternalLink className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  return null;
}

export function PreRollSponsor({ 
  movieId, 
  onComplete 
}: { 
  movieId: string; 
  onComplete: () => void;
}) {
  return (
    <SponsorCard 
      placementType="pre_roll_card" 
      movieId={movieId}
      onComplete={onComplete}
      autoSkipDelay={5}
      showSkip={true}
    />
  );
}

export function HeroBanner({ genre }: { genre?: string }) {
  return <SponsorCard placementType="hero_banner" genre={genre} />;
}

export function CollectionSponsor({ collectionId }: { collectionId: string }) {
  return <SponsorCard placementType="collection_sponsor" collectionId={collectionId} />;
}

export function FooterBanner() {
  return <SponsorCard placementType="footer_banner" />;
}
