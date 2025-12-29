import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";

interface AdBannerProps {
  onClose?: () => void;
}

export default function AdBanner({ onClose }: AdBannerProps) {
  const [isVisible, setIsVisible] = useState(true);

  const handleClose = () => {
    setIsVisible(false);
    onClose?.();
    console.log('Ad banner closed');
  };

  if (!isVisible) return null;

  return (
    <div className="relative bg-card border border-primary/20 rounded-md p-6 mx-4 md:mx-8 lg:mx-12 my-8" data-testid="banner-ad">
      <Badge variant="outline" className="absolute top-2 left-2 text-xs border-primary/30 text-primary">
        Advertisement
      </Badge>
      
      <Button
        size="icon"
        variant="ghost"
        className="absolute top-2 right-2 h-6 w-6"
        onClick={handleClose}
        data-testid="button-close-ad"
      >
        <X className="h-4 w-4" />
      </Button>

      <div className="flex flex-col md:flex-row items-center justify-center gap-4 pt-6">
        <div className="text-center md:text-left">
          <h3 className="text-lg font-semibold mb-2">Support Rampage Films</h3>
          <p className="text-sm text-foreground/70 mb-4">
            Enjoy limited ads while discovering rare cinematic treasures
          </p>
          <Button variant="default" size="sm" data-testid="button-ad-cta">
            Learn More
          </Button>
        </div>
      </div>
    </div>
  );
}
