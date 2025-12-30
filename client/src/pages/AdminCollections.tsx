import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, Trash2, GripVertical, Eye, EyeOff, X, Check, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import type { Collection, Movie } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

function generateSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function AdminCollections() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthorized, isLoading } = useAdminAuth();
  
  const [isCreating, setIsCreating] = useState(false);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [collectionToDelete, setCollectionToDelete] = useState<Collection | null>(null);
  
  const [formData, setFormData] = useState({
    title: "",
    slug: "",
    description: "",
    backdropUrl: "",
    isActive: true,
    displayOrder: 0,
    movieIds: [] as string[],
  });
  
  const [selectedMovieIds, setSelectedMovieIds] = useState<string[]>([]);
  const [movieSearchQuery, setMovieSearchQuery] = useState("");

  const { data: collections, isLoading: isLoadingCollections } = useQuery<Collection[]>({
    queryKey: ["/api/admin/collections"],
    enabled: isAuthorized,
  });

  const { data: allMovies } = useQuery<Movie[]>({
    queryKey: ["/api/movies"],
    enabled: isAuthorized,
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      return await apiRequest("POST", "/api/admin/collections", {
        ...data,
        isActive: data.isActive ? 1 : 0,
        movieIds: selectedMovieIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({ title: "Success!", description: "Collection created successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create collection",
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: { id: string; updates: typeof formData }) => {
      return await apiRequest("PATCH", `/api/admin/collections/${data.id}`, {
        ...data.updates,
        isActive: data.updates.isActive ? 1 : 0,
        movieIds: selectedMovieIds,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({ title: "Success!", description: "Collection updated successfully" });
      resetForm();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update collection",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return await apiRequest("DELETE", `/api/admin/collections/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/collections"] });
      queryClient.invalidateQueries({ queryKey: ["/api/collections"] });
      toast({ title: "Success!", description: "Collection deleted successfully" });
      setDeleteDialogOpen(false);
      setCollectionToDelete(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete collection",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setIsCreating(false);
    setEditingCollection(null);
    setFormData({
      title: "",
      slug: "",
      description: "",
      backdropUrl: "",
      isActive: true,
      displayOrder: 0,
      movieIds: [],
    });
    setSelectedMovieIds([]);
    setMovieSearchQuery("");
  };

  const handleEdit = (collection: Collection) => {
    setEditingCollection(collection);
    setIsCreating(true);
    setFormData({
      title: collection.title,
      slug: collection.slug,
      description: collection.description || "",
      backdropUrl: collection.backdropUrl || "",
      isActive: collection.isActive === 1,
      displayOrder: collection.displayOrder,
      movieIds: collection.movieIds || [],
    });
    setSelectedMovieIds(collection.movieIds || []);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim()) {
      toast({ title: "Error", description: "Title is required", variant: "destructive" });
      return;
    }
    
    const slug = formData.slug || generateSlug(formData.title);
    const submitData = { ...formData, slug };
    
    if (editingCollection) {
      updateMutation.mutate({ id: editingCollection.id, updates: submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const toggleMovieSelection = (movieId: string) => {
    setSelectedMovieIds(prev => 
      prev.includes(movieId) 
        ? prev.filter(id => id !== movieId)
        : [...prev, movieId]
    );
  };

  const moveMovie = (index: number, direction: "up" | "down") => {
    const newIds = [...selectedMovieIds];
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= newIds.length) return;
    [newIds[index], newIds[newIndex]] = [newIds[newIndex], newIds[index]];
    setSelectedMovieIds(newIds);
  };

  const filteredMovies = allMovies?.filter(movie => 
    movie.title.toLowerCase().includes(movieSearchQuery.toLowerCase()) ||
    movie.genres.some(g => g.toLowerCase().includes(movieSearchQuery.toLowerCase()))
  ) || [];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthorized) {
    setLocation("/admin");
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-16">
        <div className="px-4 md:px-8 lg:px-12 max-w-6xl mx-auto py-8">
          <div className="flex items-center justify-between mb-6">
            <Button
              variant="ghost"
              onClick={() => setLocation("/admin")}
              className="gap-2"
              data-testid="button-back"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Admin
            </Button>
          </div>

          <div className="flex items-center justify-between mb-8">
            <h1 className="text-3xl md:text-4xl font-serif font-bold">Curated Collections</h1>
            {!isCreating && (
              <Button onClick={() => setIsCreating(true)} data-testid="button-new-collection">
                <Plus className="h-4 w-4 mr-2" />
                New Collection
              </Button>
            )}
          </div>

          {isCreating && (
            <Card className="p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-semibold">
                  {editingCollection ? "Edit Collection" : "Create Collection"}
                </h2>
                <Button variant="ghost" size="icon" onClick={resetForm}>
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="title">Collection Title</Label>
                    <Input
                      id="title"
                      value={formData.title}
                      onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                      placeholder="e.g., Cult Classics, Hidden Gems"
                      data-testid="input-collection-title"
                    />
                  </div>
                  <div>
                    <Label htmlFor="slug">URL Slug</Label>
                    <Input
                      id="slug"
                      value={formData.slug}
                      onChange={(e) => setFormData(prev => ({ ...prev, slug: e.target.value }))}
                      placeholder={generateSlug(formData.title) || "auto-generated-from-title"}
                      data-testid="input-collection-slug"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="A brief description of this collection..."
                    rows={3}
                    data-testid="input-collection-description"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor="backdropUrl">Backdrop Image URL (optional)</Label>
                    <Input
                      id="backdropUrl"
                      value={formData.backdropUrl}
                      onChange={(e) => setFormData(prev => ({ ...prev, backdropUrl: e.target.value }))}
                      placeholder="https://..."
                      data-testid="input-collection-backdrop"
                    />
                  </div>
                  <div>
                    <Label htmlFor="displayOrder">Display Order</Label>
                    <Input
                      id="displayOrder"
                      type="number"
                      value={formData.displayOrder}
                      onChange={(e) => setFormData(prev => ({ ...prev, displayOrder: parseInt(e.target.value) || 0 }))}
                      data-testid="input-collection-order"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-6">
                    <Switch
                      id="isActive"
                      checked={formData.isActive}
                      onCheckedChange={(checked) => setFormData(prev => ({ ...prev, isActive: checked }))}
                      data-testid="switch-collection-active"
                    />
                    <Label htmlFor="isActive">Active (visible on homepage)</Label>
                  </div>
                </div>

                <div className="border-t pt-6">
                  <Label className="text-base font-semibold mb-3 block">Select Movies for Collection</Label>
                  
                  <Input
                    value={movieSearchQuery}
                    onChange={(e) => setMovieSearchQuery(e.target.value)}
                    placeholder="Search movies by title or genre..."
                    className="mb-4"
                    data-testid="input-movie-search"
                  />

                  {selectedMovieIds.length > 0 && (
                    <div className="mb-4">
                      <p className="text-sm text-muted-foreground mb-2">
                        Selected Movies ({selectedMovieIds.length}) - drag to reorder:
                      </p>
                      <div className="space-y-2">
                        {selectedMovieIds.map((id, index) => {
                          const movie = allMovies?.find(m => m.id === id);
                          if (!movie) return null;
                          return (
                            <div key={id} className="flex items-center gap-2 bg-primary/10 p-2 rounded">
                              <GripVertical className="h-4 w-4 text-muted-foreground" />
                              <img src={movie.poster} alt={movie.title} className="w-8 h-12 object-cover rounded" />
                              <span className="flex-1 text-sm">{movie.title} ({movie.year})</span>
                              <div className="flex gap-1">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => moveMovie(index, "up")}
                                  disabled={index === 0}
                                  className="h-6 w-6"
                                >
                                  ↑
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => moveMovie(index, "down")}
                                  disabled={index === selectedMovieIds.length - 1}
                                  className="h-6 w-6"
                                >
                                  ↓
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  onClick={() => toggleMovieSelection(id)}
                                  className="h-6 w-6 text-destructive"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="max-h-64 overflow-y-auto border rounded p-2 space-y-1">
                    {filteredMovies.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        No movies found. Add some movies first.
                      </p>
                    ) : (
                      filteredMovies
                        .filter(m => !selectedMovieIds.includes(m.id))
                        .slice(0, 50)
                        .map(movie => (
                          <div
                            key={movie.id}
                            onClick={() => toggleMovieSelection(movie.id)}
                            className="flex items-center gap-2 p-2 rounded cursor-pointer hover-elevate"
                            data-testid={`movie-option-${movie.id}`}
                          >
                            <img src={movie.poster} alt={movie.title} className="w-8 h-12 object-cover rounded" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{movie.title}</p>
                              <p className="text-xs text-muted-foreground">{movie.year} • {movie.genres.slice(0, 2).join(", ")}</p>
                            </div>
                            <Plus className="h-4 w-4 text-primary" />
                          </div>
                        ))
                    )}
                  </div>
                </div>

                <div className="flex gap-4 pt-4">
                  <Button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    data-testid="button-save-collection"
                  >
                    {(createMutation.isPending || updateMutation.isPending) && (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    )}
                    {editingCollection ? "Update Collection" : "Create Collection"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetForm}>
                    Cancel
                  </Button>
                </div>
              </form>
            </Card>
          )}

          <div className="space-y-4">
            {isLoadingCollections ? (
              <div className="text-center py-8">
                <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
              </div>
            ) : collections && collections.length > 0 ? (
              collections.map((collection) => (
                <Card key={collection.id} className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {collection.isActive ? (
                          <Eye className="h-4 w-4 text-green-500" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-muted-foreground" />
                        )}
                        <span className="text-sm text-muted-foreground">#{collection.displayOrder}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold" data-testid={`text-collection-title-${collection.id}`}>
                          {collection.title}
                        </h3>
                        <p className="text-sm text-muted-foreground truncate">
                          /{collection.slug} • {collection.movieIds?.length || 0} movies
                        </p>
                        {collection.description && (
                          <p className="text-xs text-foreground/60 truncate">{collection.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(collection)}
                        data-testid={`button-edit-${collection.id}`}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="destructive"
                        size="icon"
                        onClick={() => {
                          setCollectionToDelete(collection);
                          setDeleteDialogOpen(true);
                        }}
                        data-testid={`button-delete-${collection.id}`}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            ) : (
              <Card className="p-8 text-center">
                <p className="text-muted-foreground mb-4">No collections yet. Create your first collection!</p>
                <Button onClick={() => setIsCreating(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Collection
                </Button>
              </Card>
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Collection</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{collectionToDelete?.title}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => collectionToDelete && deleteMutation.mutate(collectionToDelete.id)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
