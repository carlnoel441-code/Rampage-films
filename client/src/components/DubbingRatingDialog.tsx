import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { type DubbedAudioTrack } from "@shared/schema";
import { queryClient, apiRequest } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Star, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface DubbingRatingDialogProps {
  track: DubbedAudioTrack | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  movieId: string;
}

const ISSUE_TYPES = [
  { value: "none", label: "No issues" },
  { value: "timing", label: "Audio timing/sync issues" },
  { value: "voice_quality", label: "Voice quality issues" },
  { value: "translation", label: "Translation accuracy" },
  { value: "volume", label: "Volume levels" },
  { value: "other", label: "Other" },
];

export default function DubbingRatingDialog({
  track,
  open,
  onOpenChange,
  movieId,
}: DubbingRatingDialogProps) {
  const { toast } = useToast();
  const [rating, setRating] = useState<number>(0);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [issueType, setIssueType] = useState<string>("none");
  const [feedback, setFeedback] = useState("");

  const rateMutation = useMutation({
    mutationFn: async () => {
      if (!track) throw new Error("No track selected");
      
      return apiRequest(`/api/dubbed-tracks/${track.id}/rate`, {
        method: "POST",
        body: JSON.stringify({
          rating,
          issueType: issueType !== "none" ? issueType : undefined,
          feedback: feedback.trim() || undefined,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/movies', movieId, 'dubbed-tracks'] });
      toast({
        title: "Thanks for your feedback",
        description: "Your rating helps improve audio quality",
      });
      handleClose();
    },
    onError: (error: any) => {
      toast({
        title: "Rating Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleClose = () => {
    setRating(0);
    setHoverRating(0);
    setIssueType("none");
    setFeedback("");
    onOpenChange(false);
  };

  const displayRating = hoverRating || rating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Rate Dubbed Audio</DialogTitle>
          <DialogDescription>
            How would you rate the {track?.languageName} audio quality?
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(0)}
                  className="p-1 hover-elevate rounded"
                  data-testid={`button-star-${star}`}
                >
                  <Star
                    className={`w-8 h-8 transition-colors ${
                      star <= displayRating
                        ? "fill-primary text-primary"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
            <p className="text-sm text-muted-foreground">
              {displayRating === 0 && "Select a rating"}
              {displayRating === 1 && "Poor"}
              {displayRating === 2 && "Fair"}
              {displayRating === 3 && "Good"}
              {displayRating === 4 && "Very Good"}
              {displayRating === 5 && "Excellent"}
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="issue-type">Any issues?</Label>
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger id="issue-type" data-testid="select-issue-type">
                <SelectValue placeholder="Select issue type" />
              </SelectTrigger>
              <SelectContent>
                {ISSUE_TYPES.map((type) => (
                  <SelectItem 
                    key={type.value} 
                    value={type.value}
                    data-testid={`select-item-issue-${type.value}`}
                  >
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="feedback">Additional feedback (optional)</Label>
            <Textarea
              id="feedback"
              placeholder="Tell us more about your experience..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="textarea-feedback"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-rating">
            Cancel
          </Button>
          <Button
            onClick={() => rateMutation.mutate()}
            disabled={rating === 0 || rateMutation.isPending}
            data-testid="button-submit-rating"
          >
            {rateMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Rating"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
