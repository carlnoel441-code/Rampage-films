import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Heart, DollarSign, Coffee, Sparkles, Gift, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

const SUGGESTED_AMOUNTS = [3, 5, 10, 20, 50];

type TipType = 'platform_support' | 'filmmaker_split';

interface TipJarProps {
  variant?: 'button' | 'card' | 'inline';
  tipType?: TipType;
  movieId?: string;
  filmmakerName?: string;
  buttonText?: string;
  className?: string;
}

interface TipConfig {
  platformTipsEnabled: boolean;
  filmmakerTipsEnabled: boolean;
  suggestedAmounts: number[];
  currency: string;
  platformSharePercent: number;
  filmmakerSharePercent: number;
  stripeConfigured: boolean;
}

export default function TipJar({ 
  variant = 'button', 
  tipType = 'platform_support',
  movieId,
  filmmakerName,
  buttonText = 'Support Us',
  className = ''
}: TipJarProps) {
  const [open, setOpen] = useState(false);
  const [selectedAmount, setSelectedAmount] = useState<number | null>(5);
  const [customAmount, setCustomAmount] = useState('');
  const [tipperName, setTipperName] = useState('');
  const [tipperEmail, setTipperEmail] = useState('');
  const [message, setMessage] = useState('');
  const [isAnonymous, setIsAnonymous] = useState(false);
  const { toast } = useToast();

  const { data: tipConfig } = useQuery<TipConfig>({
    queryKey: ['/api/tips/config'],
    staleTime: 60000
  });

  const tipMutation = useMutation({
    mutationFn: async (data: { 
      amountCents: number; 
      tipperName?: string; 
      tipperEmail?: string; 
      message?: string;
      isAnonymous: boolean;
    }) => {
      const endpoint = tipType === 'platform_support' 
        ? '/api/tips/platform'
        : `/api/tips/filmmaker/${movieId}`;
      const response = await apiRequest(endpoint, 'POST', data);
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to create tip');
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else if (data.error) {
        toast({
          title: "Payment Error",
          description: data.error,
          variant: "destructive"
        });
      } else {
        toast({
          title: "Thank you for your support!",
          description: "Your tip is being processed.",
        });
        setOpen(false);
        resetForm();
        queryClient.invalidateQueries({ queryKey: ['/api/tips/recent'] });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Payment Error",
        description: error.message || "Unable to create payment session. Please try again.",
        variant: "destructive"
      });
    }
  });

  const resetForm = () => {
    setSelectedAmount(5);
    setCustomAmount('');
    setTipperName('');
    setTipperEmail('');
    setMessage('');
    setIsAnonymous(false);
  };

  const getFinalAmount = (): number => {
    if (customAmount && parseFloat(customAmount) >= 1) {
      return parseFloat(customAmount);
    }
    return selectedAmount || 5;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = getFinalAmount();
    
    if (amount < 1) {
      toast({
        title: "Invalid amount",
        description: "Minimum tip amount is $1.00",
        variant: "destructive"
      });
      return;
    }

    tipMutation.mutate({
      amountCents: Math.round(amount * 100),
      tipperName: isAnonymous ? undefined : tipperName || undefined,
      tipperEmail: tipperEmail || undefined,
      message: message || undefined,
      isAnonymous
    });
  };

  const TipButton = () => (
    <Button 
      className={`gap-2 bg-gradient-to-r from-primary to-amber-500 hover:from-primary/90 hover:to-amber-500/90 text-background font-semibold ${className}`}
      onClick={() => setOpen(true)}
      data-testid="button-open-tip-jar"
    >
      <Heart className="h-4 w-4" />
      {buttonText}
    </Button>
  );

  const TipCard = () => (
    <Card 
      className={`border-primary/20 bg-gradient-to-br from-background to-primary/5 cursor-pointer transition-all hover:border-primary/40 ${className}`}
      onClick={() => setOpen(true)}
      data-testid="card-tip-jar"
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Heart className="h-5 w-5 text-primary" />
          Support Rampage Films
        </CardTitle>
        <CardDescription>
          Help us bring you rare and forgotten cinematic treasures
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button 
          className="w-full gap-2 bg-gradient-to-r from-primary to-amber-500"
          data-testid="button-support-platform"
        >
          <Gift className="h-4 w-4" />
          Leave a Tip
        </Button>
      </CardContent>
    </Card>
  );

  const InlineTip = () => (
    <div 
      className={`flex items-center gap-3 p-3 rounded-lg border border-primary/20 bg-primary/5 cursor-pointer transition-all hover:border-primary/40 ${className}`}
      onClick={() => setOpen(true)}
      data-testid="inline-tip-jar"
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-full bg-primary/10">
        <Coffee className="h-5 w-5 text-primary" />
      </div>
      <div className="flex-1">
        <p className="text-sm font-medium">Buy us a coffee</p>
        <p className="text-xs text-muted-foreground">Support our mission</p>
      </div>
      <Button size="sm" variant="outline" className="border-primary/30" data-testid="button-quick-tip">
        Tip
      </Button>
    </div>
  );

  const TipModal = () => (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            {tipType === 'platform_support' 
              ? 'Support Rampage Films' 
              : `Support ${filmmakerName || 'the Filmmaker'}`}
          </DialogTitle>
          <DialogDescription>
            {tipType === 'platform_support'
              ? 'Help us discover and share rare cinematic treasures. 100% of your tip supports our platform.'
              : `70% of your tip goes directly to the filmmaker, 30% supports the platform.`}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Select Amount</Label>
            <div className="grid grid-cols-5 gap-2">
              {(tipConfig?.suggestedAmounts || SUGGESTED_AMOUNTS).map((amount) => (
                <Button
                  key={amount}
                  type="button"
                  variant={selectedAmount === amount && !customAmount ? 'default' : 'outline'}
                  className={selectedAmount === amount && !customAmount ? 'bg-primary' : ''}
                  onClick={() => {
                    setSelectedAmount(amount);
                    setCustomAmount('');
                  }}
                  data-testid={`button-amount-${amount}`}
                >
                  ${amount}
                </Button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="custom-amount">Or enter custom amount</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="custom-amount"
                type="number"
                min="1"
                step="0.01"
                placeholder="Custom amount"
                value={customAmount}
                onChange={(e) => {
                  setCustomAmount(e.target.value);
                  if (e.target.value) setSelectedAmount(null);
                }}
                className="pl-9"
                data-testid="input-custom-amount"
              />
            </div>
          </div>

          {!isAnonymous && (
            <div className="space-y-2">
              <Label htmlFor="tipper-name">Your Name (optional)</Label>
              <Input
                id="tipper-name"
                placeholder="Enter your name"
                value={tipperName}
                onChange={(e) => setTipperName(e.target.value)}
                data-testid="input-tipper-name"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="tipper-email">Email (optional, for receipt)</Label>
            <Input
              id="tipper-email"
              type="email"
              placeholder="your@email.com"
              value={tipperEmail}
              onChange={(e) => setTipperEmail(e.target.value)}
              data-testid="input-tipper-email"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">Message (optional)</Label>
            <Textarea
              id="message"
              placeholder="Leave a message..."
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={2}
              data-testid="input-tip-message"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="anonymous"
              checked={isAnonymous}
              onCheckedChange={(checked) => setIsAnonymous(checked === true)}
              data-testid="checkbox-anonymous"
            />
            <Label htmlFor="anonymous" className="text-sm cursor-pointer">
              Make this tip anonymous
            </Label>
          </div>

          <div className="pt-2">
            <Button 
              type="submit" 
              className="w-full gap-2 bg-gradient-to-r from-primary to-amber-500"
              disabled={tipMutation.isPending}
              data-testid="button-submit-tip"
            >
              {tipMutation.isPending ? (
                <>Redirecting to payment...</>
              ) : (
                <>
                  <Send className="h-4 w-4" />
                  Send ${getFinalAmount().toFixed(2)} Tip
                </>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center mt-2">
              Secure payment powered by Stripe
            </p>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );

  return (
    <>
      {variant === 'button' && <TipButton />}
      {variant === 'card' && <TipCard />}
      {variant === 'inline' && <InlineTip />}
      <TipModal />
    </>
  );
}

export function RecentSupporters({ limit = 5 }: { limit?: number }) {
  const { data: tips } = useQuery<any[]>({
    queryKey: ['/api/tips/recent', limit],
    staleTime: 30000
  });

  if (!tips || tips.length === 0) {
    return null;
  }

  return (
    <Card className="border-primary/10">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Heart className="h-4 w-4 text-primary" />
          Recent Supporters
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {tips.slice(0, limit).map((tip) => (
          <div key={tip.id} className="flex items-start gap-3" data-testid={`tip-${tip.id}`}>
            <div className="flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-bold">
              ${tip.amount}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">
                {tip.tipperName || 'Anonymous'}
              </p>
              {tip.message && (
                <p className="text-xs text-muted-foreground line-clamp-2">
                  "{tip.message}"
                </p>
              )}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
