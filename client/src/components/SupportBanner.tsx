import { useState, useEffect } from "react";
import { Heart, X, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";

export default function SupportBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    const wasDismissed = localStorage.getItem('support-banner-dismissed');
    if (!wasDismissed) {
      setDismissed(false);
    }
  }, []);

  const handleDismiss = () => {
    localStorage.setItem('support-banner-dismissed', 'true');
    setDismissed(true);
  };

  if (dismissed) {
    return null;
  }

  return (
    <div className="relative mx-4 md:mx-8 lg:mx-12 mb-8">
      <div className="relative overflow-hidden rounded-lg border border-primary/20 bg-gradient-to-r from-primary/5 via-background to-primary/5 p-4 md:p-6">
        <button
          onClick={handleDismiss}
          className="absolute top-2 right-2 p-1 rounded-full hover:bg-primary/10 transition-colors"
          aria-label="Dismiss"
          data-testid="button-dismiss-support-banner"
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </button>

        <div className="flex flex-col md:flex-row items-center gap-4 md:gap-6">
          <div className="flex-shrink-0 h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
            <Heart className="h-6 w-6 text-primary" />
          </div>

          <div className="flex-1 text-center md:text-left">
            <h3 className="font-semibold text-lg mb-1">
              Enjoying Rampage Films?
            </h3>
            <p className="text-sm text-muted-foreground">
              Everything here is <span className="text-foreground font-medium">100% free</span> and always will be. 
              If you'd like to help us keep discovering rare films, you can leave a tip - but it's completely optional!
            </p>
          </div>

          <div className="flex items-center gap-3">
            <Link href="/support">
              <Button 
                className="gap-2 bg-gradient-to-r from-primary to-amber-500"
                data-testid="button-learn-more-support"
              >
                <Sparkles className="h-4 w-4" />
                Learn More
              </Button>
            </Link>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={handleDismiss}
              data-testid="button-maybe-later"
            >
              Maybe Later
            </Button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground text-center mt-3 flex items-center justify-center gap-1">
          <Sparkles className="h-3 w-3" />
          No pressure - we're just glad you're here!
        </p>
      </div>
    </div>
  );
}
