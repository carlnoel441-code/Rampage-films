import { Film } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="text-center space-y-6">
        <Film className="h-24 w-24 text-primary mx-auto" />
        <h1 className="text-6xl font-serif font-bold text-foreground">404</h1>
        <h2 className="text-2xl font-semibold text-foreground">Page Not Found</h2>
        <p className="text-foreground/70 max-w-md">
          This page seems to be as hard to find as our rarest films.
        </p>
        <Button
          onClick={() => window.location.href = "/"}
          variant="default"
          size="lg"
          data-testid="button-home"
        >
          Return Home
        </Button>
      </div>
    </div>
  );
}
