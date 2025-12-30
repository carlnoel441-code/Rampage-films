import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { Star, Loader2, ThumbsUp, User, MessageSquare } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import type { Review } from "@shared/schema";

interface ReviewsSectionProps {
  movieId: string;
  movieTitle: string;
}

interface ReviewWithUser extends Review {
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string | null;
  };
}

export default function ReviewsSection({ movieId, movieTitle }: ReviewsSectionProps) {
  const { user, isAuthenticated } = useAuth();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [showReviewForm, setShowReviewForm] = useState(false);

  const { data: reviews, isLoading } = useQuery<ReviewWithUser[]>({
    queryKey: ["/api/movies", movieId, "reviews"],
  });

  const { data: userReview } = useQuery<Review | null>({
    queryKey: ["/api/users/me/reviews", movieId],
    enabled: isAuthenticated,
  });

  const createReviewMutation = useMutation({
    mutationFn: async (data: { movieId: string; rating: number; review: string }) => {
      return await apiRequest("POST", `/api/movies/${movieId}/reviews`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies", movieId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/reviews", movieId] });
      toast({ title: "Review submitted!", description: "Thank you for your feedback." });
      setRating(0);
      setReviewText("");
      setShowReviewForm(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to submit review",
        variant: "destructive",
      });
    },
  });

  const updateReviewMutation = useMutation({
    mutationFn: async (data: { id: string; rating: number; review: string }) => {
      return await apiRequest("PATCH", `/api/reviews/${data.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies", movieId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/reviews", movieId] });
      toast({ title: "Review updated!" });
      setShowReviewForm(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update review",
        variant: "destructive",
      });
    },
  });

  const deleteReviewMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/reviews/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies", movieId, "reviews"] });
      queryClient.invalidateQueries({ queryKey: ["/api/users/me/reviews", movieId] });
      toast({ title: "Review deleted" });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete review",
        variant: "destructive",
      });
    },
  });

  const handleSubmitReview = () => {
    if (rating === 0) {
      toast({
        title: "Rating required",
        description: "Please select a star rating",
        variant: "destructive",
      });
      return;
    }

    if (userReview) {
      updateReviewMutation.mutate({
        id: userReview.id,
        rating,
        review: reviewText,
      });
    } else {
      createReviewMutation.mutate({
        movieId,
        rating,
        review: reviewText,
      });
    }
  };

  const handleEditReview = () => {
    if (userReview) {
      setRating(userReview.rating);
      setReviewText(userReview.review || "");
      setShowReviewForm(true);
    }
  };

  const averageRating = reviews && reviews.length > 0
    ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
    : 0;

  const renderStars = (value: number, interactive = false, size = "h-5 w-5") => {
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <button
            key={star}
            type="button"
            disabled={!interactive}
            onClick={() => interactive && setRating(star)}
            onMouseEnter={() => interactive && setHoverRating(star)}
            onMouseLeave={() => interactive && setHoverRating(0)}
            className={interactive ? "cursor-pointer transition-transform hover:scale-110" : "cursor-default"}
            data-testid={`star-${star}`}
          >
            <Star
              className={`${size} ${
                star <= (interactive ? (hoverRating || rating) : value)
                  ? "fill-primary text-primary"
                  : "text-foreground/20"
              }`}
            />
          </button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6 mt-8" data-testid="reviews-section">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            Reviews
          </h2>
          {reviews && reviews.length > 0 && (
            <div className="flex items-center gap-2 text-sm text-foreground/70">
              <div className="flex items-center gap-1">
                {renderStars(averageRating)}
                <span className="ml-1 font-medium">{averageRating.toFixed(1)}</span>
              </div>
              <span>({reviews.length} {reviews.length === 1 ? "review" : "reviews"})</span>
            </div>
          )}
        </div>

        {isAuthenticated && !userReview && !showReviewForm && (
          <Button onClick={() => setShowReviewForm(true)} data-testid="button-write-review">
            <Star className="h-4 w-4 mr-2" />
            Write a Review
          </Button>
        )}
      </div>

      {showReviewForm && (
        <Card className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <p className="font-medium">Rate {movieTitle}</p>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setShowReviewForm(false);
                setRating(0);
                setReviewText("");
              }}
            >
              Cancel
            </Button>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-foreground/70">Your rating:</span>
            {renderStars(rating, true, "h-8 w-8")}
            {rating > 0 && (
              <span className="text-primary font-medium">{rating}/5</span>
            )}
          </div>

          <Textarea
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Share your thoughts about this movie (optional)..."
            rows={4}
            data-testid="input-review-text"
          />

          <div className="flex gap-2">
            <Button
              onClick={handleSubmitReview}
              disabled={createReviewMutation.isPending || updateReviewMutation.isPending || rating === 0}
              data-testid="button-submit-review"
            >
              {(createReviewMutation.isPending || updateReviewMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {userReview ? "Update Review" : "Submit Review"}
            </Button>
          </div>
        </Card>
      )}

      {userReview && !showReviewForm && (
        <Card className="p-4 border-primary/30">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 flex-1">
              <Avatar className="h-10 w-10 border-2 border-primary/30">
                <AvatarImage src={user?.profileImageUrl || undefined} />
                <AvatarFallback className="bg-primary/10 text-primary">
                  <User className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-primary">Your Review</span>
                  {renderStars(userReview.rating)}
                </div>
                {userReview.review && (
                  <p className="text-foreground/80 mt-2">{userReview.review}</p>
                )}
                <p className="text-xs text-foreground/50 mt-2">
                  {userReview.createdAt && formatDistanceToNow(new Date(userReview.createdAt), { addSuffix: true })}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleEditReview}>
                Edit
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => deleteReviewMutation.mutate(userReview.id)}
                disabled={deleteReviewMutation.isPending}
              >
                Delete
              </Button>
            </div>
          </div>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : reviews && reviews.length > 0 ? (
        <div className="space-y-4">
          {reviews
            .filter(r => r.userId !== user?.id)
            .map((review) => (
              <Card key={review.id} className="p-4" data-testid={`review-${review.id}`}>
                <div className="flex items-start gap-3">
                  <Avatar className="h-10 w-10">
                    <AvatarImage src={review.user?.profileImageUrl || undefined} />
                    <AvatarFallback className="bg-card">
                      <User className="h-4 w-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium">
                        {review.user?.firstName} {review.user?.lastName}
                      </span>
                      {renderStars(review.rating)}
                    </div>
                    {review.review && (
                      <p className="text-foreground/80 mt-2">{review.review}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2">
                      <p className="text-xs text-foreground/50">
                        {review.createdAt && formatDistanceToNow(new Date(review.createdAt), { addSuffix: true })}
                      </p>
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1">
                        <ThumbsUp className="h-3 w-3" />
                        Helpful
                      </Button>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
        </div>
      ) : !userReview ? (
        <Card className="p-8 text-center">
          <MessageSquare className="h-12 w-12 mx-auto text-foreground/20 mb-4" />
          <p className="text-foreground/60">No reviews yet. Be the first to review this movie!</p>
          {isAuthenticated && (
            <Button className="mt-4" onClick={() => setShowReviewForm(true)}>
              <Star className="h-4 w-4 mr-2" />
              Write a Review
            </Button>
          )}
        </Card>
      ) : null}
    </div>
  );
}
