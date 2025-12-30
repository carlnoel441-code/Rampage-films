import { useState } from "react";
import { Facebook, Twitter, Instagram, Youtube, Tv, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import TipJar from "./TipJar";

export default function Footer() {
  const currentYear = new Date().getFullYear();
  const { toast } = useToast();
  const [email, setEmail] = useState("");

  const subscribeMutation = useMutation({
    mutationFn: (email: string) => apiRequest('/api/newsletter/subscribe', 'POST', { email }),
    onSuccess: () => {
      toast({ title: "Subscribed!", description: "You'll receive updates about new rare films." });
      setEmail("");
    },
    onError: () => {
      toast({ title: "Subscription failed", variant: "destructive" });
    }
  });

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      subscribeMutation.mutate(email);
    }
  };

  return (
    <footer className="bg-background border-t border-primary/10 py-8 px-4 md:px-8 lg:px-12">
      <div className="max-w-[1920px] mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
          <div>
            <h3 className="text-sm font-semibold mb-4 flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" />
              Stay Updated
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              Get notified when we add rare films to our collection.
            </p>
            <form onSubmit={handleSubscribe} className="flex gap-2">
              <Input
                type="email"
                placeholder="your@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-9"
                data-testid="input-newsletter-email"
              />
              <Button 
                type="submit" 
                size="sm"
                disabled={subscribeMutation.isPending || !email}
                data-testid="button-newsletter-subscribe"
              >
                {subscribeMutation.isPending ? '...' : 'Subscribe'}
              </Button>
            </form>
          </div>

          <div className="flex flex-wrap items-start justify-center md:justify-start gap-4 text-sm text-foreground/60">
            <TipJar 
              variant="button" 
              buttonText="Support Us" 
              className="text-xs h-8"
            />
            <Link 
              href="/tv-access" 
              className="hover:text-primary transition-colors cursor-pointer flex items-center gap-1.5" 
              data-testid="link-tv-access"
            >
              <Tv className="h-3.5 w-3.5" />
              Watch on TV
            </Link>
            <a href="#" className="hover:text-primary transition-colors" data-testid="link-about">
              About
            </a>
            <a href="#" className="hover:text-primary transition-colors" data-testid="link-contact">
              Contact
            </a>
            <a href="#" className="hover:text-primary transition-colors" data-testid="link-terms">
              Terms
            </a>
            <a href="#" className="hover:text-primary transition-colors" data-testid="link-privacy">
              Privacy
            </a>
          </div>

          <div className="flex items-center justify-center lg:justify-end gap-2">
            <Button size="icon" variant="ghost" className="h-8 w-8" data-testid="button-facebook">
              <Facebook className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" data-testid="button-twitter">
              <Twitter className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" data-testid="button-instagram">
              <Instagram className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="h-8 w-8" data-testid="button-youtube">
              <Youtube className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="text-center pt-6 border-t border-primary/5 text-xs text-foreground/40">
          <p>© {currentYear} Rampage Films. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
