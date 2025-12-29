import { Button } from "@/components/ui/button";
import { FastForward } from "lucide-react";

interface SkipControlOverlayProps {
  showSkipIntro: boolean;
  showSkipCredits: boolean;
  onSkipIntro: () => void;
  onSkipCredits: () => void;
}

export default function SkipControlOverlay({
  showSkipIntro,
  showSkipCredits,
  onSkipIntro,
  onSkipCredits,
}: SkipControlOverlayProps) {
  if (!showSkipIntro && !showSkipCredits) {
    return null;
  }

  return (
    <div className="absolute bottom-24 right-4 flex flex-col gap-2 z-20 pointer-events-none">
      {showSkipIntro && (
        <Button
          size="sm"
          variant="default"
          onClick={onSkipIntro}
          className="pointer-events-auto bg-black/80 hover:bg-black/90 text-white border border-primary/50"
          data-testid="button-skip-intro"
        >
          <FastForward className="h-4 w-4 mr-1" />
          Skip Intro
        </Button>
      )}
      {showSkipCredits && (
        <Button
          size="sm"
          variant="default"
          onClick={onSkipCredits}
          className="pointer-events-auto bg-black/80 hover:bg-black/90 text-white border border-primary/50"
          data-testid="button-skip-credits"
        >
          <FastForward className="h-4 w-4 mr-1" />
          Skip Credits
        </Button>
      )}
    </div>
  );
}
