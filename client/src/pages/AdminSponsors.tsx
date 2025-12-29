import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { 
  Building2, Plus, Pencil, Trash2, ExternalLink, Calendar,
  Eye, MousePointerClick, Target, Image, Link2
} from "lucide-react";
import Header from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import { useAdminAuth } from "@/contexts/AdminAuthContext";

interface Sponsor {
  id: string;
  name: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  contactEmail: string | null;
  contactName: string | null;
  notes: string | null;
  isActive: number;
  createdAt: string;
  updatedAt: string;
}

interface SponsorshipPlacement {
  id: string;
  sponsorId: string;
  placementType: string;
  headline: string | null;
  description: string | null;
  imageUrl: string | null;
  clickUrl: string | null;
  startDate: string;
  endDate: string | null;
  isActive: number;
  priority: number;
  impressionCount: number;
  clickCount: number;
  createdAt: string;
  collectionId: string | null;
  movieId: string | null;
  genreTarget: string | null;
}

const PLACEMENT_TYPES = [
  { value: 'hero_banner', label: 'Hero Banner', description: 'Large banner on homepage' },
  { value: 'pre_roll_card', label: 'Pre-Roll Card', description: 'Shows before movie starts' },
  { value: 'collection_sponsor', label: 'Collection Sponsor', description: 'Sponsors a collection row' },
  { value: 'footer_banner', label: 'Footer Banner', description: 'Banner in site footer' }
];

export default function AdminSponsors() {
  const [, setLocation] = useLocation();
  const { isAdmin } = useAdminAuth();
  const { toast } = useToast();
  
  const [sponsorDialogOpen, setSponsorDialogOpen] = useState(false);
  const [placementDialogOpen, setPlacementDialogOpen] = useState(false);
  const [editingSponsor, setEditingSponsor] = useState<Sponsor | null>(null);
  const [editingPlacement, setEditingPlacement] = useState<SponsorshipPlacement | null>(null);

  const [sponsorForm, setSponsorForm] = useState({
    name: '',
    logoUrl: '',
    websiteUrl: '',
    contactEmail: '',
    contactName: '',
    notes: ''
  });

  const [placementForm, setPlacementForm] = useState({
    sponsorId: '',
    placementType: '',
    headline: '',
    description: '',
    imageUrl: '',
    clickUrl: '',
    startDate: '',
    endDate: '',
    priority: 0,
    isActive: true
  });

  const { data: sponsors = [], isLoading: sponsorsLoading } = useQuery<Sponsor[]>({
    queryKey: ['/api/admin/sponsors'],
    enabled: isAdmin
  });

  const { data: placements = [], isLoading: placementsLoading } = useQuery<SponsorshipPlacement[]>({
    queryKey: ['/api/admin/placements'],
    enabled: isAdmin
  });

  const createSponsorMutation = useMutation({
    mutationFn: (data: typeof sponsorForm) => apiRequest('/api/admin/sponsors', 'POST', data),
    onSuccess: () => {
      toast({ title: "Sponsor created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sponsors'] });
      setSponsorDialogOpen(false);
      resetSponsorForm();
    },
    onError: (error: any) => {
      toast({ title: "Error creating sponsor", description: error.message, variant: "destructive" });
    }
  });

  const updateSponsorMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest(`/api/admin/sponsors/${id}`, 'PATCH', data),
    onSuccess: () => {
      toast({ title: "Sponsor updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sponsors'] });
      setSponsorDialogOpen(false);
      setEditingSponsor(null);
      resetSponsorForm();
    },
    onError: (error: any) => {
      toast({ title: "Error updating sponsor", description: error.message, variant: "destructive" });
    }
  });

  const deleteSponsorMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/sponsors/${id}`, 'DELETE'),
    onSuccess: () => {
      toast({ title: "Sponsor deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sponsors'] });
    },
    onError: (error: any) => {
      toast({ title: "Error deleting sponsor", description: error.message, variant: "destructive" });
    }
  });

  const createPlacementMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/admin/placements', 'POST', data),
    onSuccess: () => {
      toast({ title: "Placement created successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/placements'] });
      setPlacementDialogOpen(false);
      resetPlacementForm();
    },
    onError: (error: any) => {
      toast({ title: "Error creating placement", description: error.message, variant: "destructive" });
    }
  });

  const updatePlacementMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      apiRequest(`/api/admin/placements/${id}`, 'PATCH', data),
    onSuccess: () => {
      toast({ title: "Placement updated successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/placements'] });
      setPlacementDialogOpen(false);
      setEditingPlacement(null);
      resetPlacementForm();
    },
    onError: (error: any) => {
      toast({ title: "Error updating placement", description: error.message, variant: "destructive" });
    }
  });

  const deletePlacementMutation = useMutation({
    mutationFn: (id: string) => apiRequest(`/api/admin/placements/${id}`, 'DELETE'),
    onSuccess: () => {
      toast({ title: "Placement deleted successfully" });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/placements'] });
    },
    onError: (error: any) => {
      toast({ title: "Error deleting placement", description: error.message, variant: "destructive" });
    }
  });

  const resetSponsorForm = () => {
    setSponsorForm({ name: '', logoUrl: '', websiteUrl: '', contactEmail: '', contactName: '', notes: '' });
  };

  const resetPlacementForm = () => {
    setPlacementForm({ 
      sponsorId: '', placementType: '', headline: '', description: '', 
      imageUrl: '', clickUrl: '', startDate: '', endDate: '', priority: 0, isActive: true 
    });
  };

  const openEditSponsor = (sponsor: Sponsor) => {
    setEditingSponsor(sponsor);
    setSponsorForm({
      name: sponsor.name,
      logoUrl: sponsor.logoUrl || '',
      websiteUrl: sponsor.websiteUrl || '',
      contactEmail: sponsor.contactEmail || '',
      contactName: sponsor.contactName || '',
      notes: sponsor.notes || ''
    });
    setSponsorDialogOpen(true);
  };

  const openEditPlacement = (placement: SponsorshipPlacement) => {
    setEditingPlacement(placement);
    setPlacementForm({
      sponsorId: placement.sponsorId,
      placementType: placement.placementType,
      headline: placement.headline || '',
      description: placement.description || '',
      imageUrl: placement.imageUrl || '',
      clickUrl: placement.clickUrl || '',
      startDate: placement.startDate ? format(new Date(placement.startDate), 'yyyy-MM-dd') : '',
      endDate: placement.endDate ? format(new Date(placement.endDate), 'yyyy-MM-dd') : '',
      priority: placement.priority,
      isActive: placement.isActive === 1
    });
    setPlacementDialogOpen(true);
  };

  const handleSponsorSubmit = () => {
    if (editingSponsor) {
      updateSponsorMutation.mutate({ id: editingSponsor.id, data: sponsorForm });
    } else {
      createSponsorMutation.mutate(sponsorForm);
    }
  };

  const handlePlacementSubmit = () => {
    const data = {
      ...placementForm,
      isActive: placementForm.isActive ? 1 : 0,
      startDate: placementForm.startDate || new Date().toISOString(),
      endDate: placementForm.endDate || null
    };
    
    if (editingPlacement) {
      updatePlacementMutation.mutate({ id: editingPlacement.id, data });
    } else {
      createPlacementMutation.mutate(data);
    }
  };

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="pt-24 px-4 max-w-xl mx-auto text-center">
          <h1 className="text-2xl font-bold mb-4">Admin Access Required</h1>
          <p className="text-muted-foreground mb-6">Please log in as an administrator.</p>
          <Button onClick={() => setLocation('/admin')} data-testid="button-admin-login">
            Go to Admin
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <div className="pt-20 px-4 md:px-8 lg:px-12 max-w-[1400px] mx-auto py-8">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">
              Sponsorship Management
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage sponsors and ad placements
            </p>
          </div>
          <Button onClick={() => setLocation('/admin')} variant="outline" data-testid="button-back-admin">
            Back to Admin
          </Button>
        </div>

        <Tabs defaultValue="sponsors" className="space-y-6">
          <TabsList>
            <TabsTrigger value="sponsors" data-testid="tab-sponsors">
              <Building2 className="h-4 w-4 mr-2" /> Sponsors
            </TabsTrigger>
            <TabsTrigger value="placements" data-testid="tab-placements">
              <Target className="h-4 w-4 mr-2" /> Placements
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sponsors">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Sponsors ({sponsors.length})</h2>
              <Button 
                onClick={() => { resetSponsorForm(); setEditingSponsor(null); setSponsorDialogOpen(true); }}
                data-testid="button-add-sponsor"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Sponsor
              </Button>
            </div>

            {sponsorsLoading ? (
              <div className="text-center py-8">Loading sponsors...</div>
            ) : sponsors.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Building2 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No sponsors yet. Add your first sponsor to get started.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {sponsors.map((sponsor) => (
                  <Card key={sponsor.id} className="relative" data-testid={`sponsor-card-${sponsor.id}`}>
                    <CardHeader className="pb-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          {sponsor.logoUrl ? (
                            <img src={sponsor.logoUrl} alt={sponsor.name} className="h-10 w-10 object-contain rounded" />
                          ) : (
                            <div className="h-10 w-10 bg-primary/10 rounded flex items-center justify-center">
                              <Building2 className="h-5 w-5 text-primary" />
                            </div>
                          )}
                          <div>
                            <CardTitle className="text-base">{sponsor.name}</CardTitle>
                            <Badge variant={sponsor.isActive ? 'default' : 'secondary'} className="mt-1">
                              {sponsor.isActive ? 'Active' : 'Inactive'}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {sponsor.contactName && (
                        <p className="text-sm text-muted-foreground">Contact: {sponsor.contactName}</p>
                      )}
                      {sponsor.websiteUrl && (
                        <a 
                          href={sponsor.websiteUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-sm text-primary flex items-center gap-1"
                        >
                          <ExternalLink className="h-3 w-3" /> Website
                        </a>
                      )}
                      <div className="flex gap-2 pt-2">
                        <Button 
                          size="sm" 
                          variant="outline" 
                          onClick={() => openEditSponsor(sponsor)}
                          data-testid={`button-edit-sponsor-${sponsor.id}`}
                        >
                          <Pencil className="h-3 w-3 mr-1" /> Edit
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          onClick={() => {
                            if (confirm('Delete this sponsor? This will also delete all their placements.')) {
                              deleteSponsorMutation.mutate(sponsor.id);
                            }
                          }}
                          data-testid={`button-delete-sponsor-${sponsor.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="placements">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Placements ({placements.length})</h2>
              <Button 
                onClick={() => { resetPlacementForm(); setEditingPlacement(null); setPlacementDialogOpen(true); }}
                disabled={sponsors.length === 0}
                data-testid="button-add-placement"
              >
                <Plus className="h-4 w-4 mr-2" /> Add Placement
              </Button>
            </div>

            {sponsors.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">Add a sponsor first before creating placements.</p>
                </CardContent>
              </Card>
            ) : placementsLoading ? (
              <div className="text-center py-8">Loading placements...</div>
            ) : placements.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <Target className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="text-muted-foreground">No placements yet. Create your first placement.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-4">
                {placements.map((placement) => {
                  const sponsor = sponsors.find(s => s.id === placement.sponsorId);
                  const typeInfo = PLACEMENT_TYPES.find(t => t.value === placement.placementType);
                  const ctr = placement.impressionCount > 0 
                    ? ((placement.clickCount / placement.impressionCount) * 100).toFixed(2)
                    : '0.00';
                  
                  return (
                    <Card key={placement.id} data-testid={`placement-card-${placement.id}`}>
                      <CardContent className="pt-6">
                        <div className="flex flex-col md:flex-row justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <Badge variant="outline">{typeInfo?.label || placement.placementType}</Badge>
                              <Badge variant={placement.isActive ? 'default' : 'secondary'}>
                                {placement.isActive ? 'Active' : 'Inactive'}
                              </Badge>
                            </div>
                            <h3 className="font-semibold">{placement.headline || 'No headline'}</h3>
                            <p className="text-sm text-muted-foreground mt-1">
                              Sponsor: {sponsor?.name || 'Unknown'}
                            </p>
                            {placement.description && (
                              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {placement.description}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-3 text-sm">
                              <span className="flex items-center gap-1">
                                <Calendar className="h-4 w-4" />
                                {format(new Date(placement.startDate), 'PP')}
                                {placement.endDate && ` - ${format(new Date(placement.endDate), 'PP')}`}
                              </span>
                            </div>
                          </div>
                          <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                            <div className="flex gap-4 text-sm">
                              <div className="text-center">
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <Eye className="h-4 w-4" />
                                </div>
                                <p className="font-semibold">{placement.impressionCount.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">impressions</p>
                              </div>
                              <div className="text-center">
                                <div className="flex items-center gap-1 text-muted-foreground">
                                  <MousePointerClick className="h-4 w-4" />
                                </div>
                                <p className="font-semibold">{placement.clickCount.toLocaleString()}</p>
                                <p className="text-xs text-muted-foreground">clicks</p>
                              </div>
                              <div className="text-center">
                                <p className="font-semibold text-primary">{ctr}%</p>
                                <p className="text-xs text-muted-foreground">CTR</p>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => openEditPlacement(placement)}
                                data-testid={`button-edit-placement-${placement.id}`}
                              >
                                <Pencil className="h-3 w-3" />
                              </Button>
                              <Button 
                                size="sm" 
                                variant="destructive"
                                onClick={() => {
                                  if (confirm('Delete this placement?')) {
                                    deletePlacementMutation.mutate(placement.id);
                                  }
                                }}
                                data-testid={`button-delete-placement-${placement.id}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <Dialog open={sponsorDialogOpen} onOpenChange={setSponsorDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingSponsor ? 'Edit Sponsor' : 'Add Sponsor'}</DialogTitle>
              <DialogDescription>
                {editingSponsor ? 'Update sponsor details' : 'Add a new sponsor to the platform'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="sponsorName">Sponsor Name *</Label>
                <Input 
                  id="sponsorName"
                  value={sponsorForm.name}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, name: e.target.value })}
                  placeholder="Company Name"
                  data-testid="input-sponsor-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="logoUrl">Logo URL</Label>
                <Input 
                  id="logoUrl"
                  value={sponsorForm.logoUrl}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, logoUrl: e.target.value })}
                  placeholder="https://example.com/logo.png"
                  data-testid="input-sponsor-logo"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="websiteUrl">Website URL</Label>
                <Input 
                  id="websiteUrl"
                  value={sponsorForm.websiteUrl}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, websiteUrl: e.target.value })}
                  placeholder="https://example.com"
                  data-testid="input-sponsor-website"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="contactName">Contact Name</Label>
                  <Input 
                    id="contactName"
                    value={sponsorForm.contactName}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, contactName: e.target.value })}
                    placeholder="John Smith"
                    data-testid="input-sponsor-contact-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="contactEmail">Contact Email</Label>
                  <Input 
                    id="contactEmail"
                    type="email"
                    value={sponsorForm.contactEmail}
                    onChange={(e) => setSponsorForm({ ...sponsorForm, contactEmail: e.target.value })}
                    placeholder="john@example.com"
                    data-testid="input-sponsor-contact-email"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="notes">Notes</Label>
                <Textarea 
                  id="notes"
                  value={sponsorForm.notes}
                  onChange={(e) => setSponsorForm({ ...sponsorForm, notes: e.target.value })}
                  placeholder="Internal notes about this sponsor..."
                  rows={2}
                  data-testid="input-sponsor-notes"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSponsorDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleSponsorSubmit}
                disabled={!sponsorForm.name || createSponsorMutation.isPending || updateSponsorMutation.isPending}
                data-testid="button-save-sponsor"
              >
                {editingSponsor ? 'Update' : 'Create'} Sponsor
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={placementDialogOpen} onOpenChange={setPlacementDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>{editingPlacement ? 'Edit Placement' : 'Add Placement'}</DialogTitle>
              <DialogDescription>
                {editingPlacement ? 'Update placement details' : 'Create a new ad placement'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
              <div className="space-y-2">
                <Label>Sponsor *</Label>
                <Select 
                  value={placementForm.sponsorId} 
                  onValueChange={(v) => setPlacementForm({ ...placementForm, sponsorId: v })}
                >
                  <SelectTrigger data-testid="select-sponsor">
                    <SelectValue placeholder="Select a sponsor" />
                  </SelectTrigger>
                  <SelectContent>
                    {sponsors.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Placement Type *</Label>
                <Select 
                  value={placementForm.placementType} 
                  onValueChange={(v) => setPlacementForm({ ...placementForm, placementType: v })}
                >
                  <SelectTrigger data-testid="select-placement-type">
                    <SelectValue placeholder="Select placement type" />
                  </SelectTrigger>
                  <SelectContent>
                    {PLACEMENT_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label} - {t.description}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="headline">Headline</Label>
                <Input 
                  id="headline"
                  value={placementForm.headline}
                  onChange={(e) => setPlacementForm({ ...placementForm, headline: e.target.value })}
                  placeholder="Sponsored message headline"
                  data-testid="input-placement-headline"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea 
                  id="description"
                  value={placementForm.description}
                  onChange={(e) => setPlacementForm({ ...placementForm, description: e.target.value })}
                  placeholder="Ad description or call to action"
                  rows={2}
                  data-testid="input-placement-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL</Label>
                <Input 
                  id="imageUrl"
                  value={placementForm.imageUrl}
                  onChange={(e) => setPlacementForm({ ...placementForm, imageUrl: e.target.value })}
                  placeholder="https://example.com/banner.jpg"
                  data-testid="input-placement-image"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="clickUrl">Click URL *</Label>
                <Input 
                  id="clickUrl"
                  value={placementForm.clickUrl}
                  onChange={(e) => setPlacementForm({ ...placementForm, clickUrl: e.target.value })}
                  placeholder="https://sponsor-landing.com"
                  data-testid="input-placement-click-url"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="startDate">Start Date *</Label>
                  <Input 
                    id="startDate"
                    type="date"
                    value={placementForm.startDate}
                    onChange={(e) => setPlacementForm({ ...placementForm, startDate: e.target.value })}
                    data-testid="input-placement-start-date"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endDate">End Date</Label>
                  <Input 
                    id="endDate"
                    type="date"
                    value={placementForm.endDate}
                    onChange={(e) => setPlacementForm({ ...placementForm, endDate: e.target.value })}
                    data-testid="input-placement-end-date"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <Label htmlFor="priority">Priority (higher = shown first)</Label>
                  <Input 
                    id="priority"
                    type="number"
                    value={placementForm.priority}
                    onChange={(e) => setPlacementForm({ ...placementForm, priority: parseInt(e.target.value) || 0 })}
                    className="w-24"
                    data-testid="input-placement-priority"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Switch 
                    id="isActive"
                    checked={placementForm.isActive}
                    onCheckedChange={(v) => setPlacementForm({ ...placementForm, isActive: v })}
                    data-testid="switch-placement-active"
                  />
                  <Label htmlFor="isActive">Active</Label>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPlacementDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handlePlacementSubmit}
                disabled={!placementForm.sponsorId || !placementForm.placementType || createPlacementMutation.isPending || updatePlacementMutation.isPending}
                data-testid="button-save-placement"
              >
                {editingPlacement ? 'Update' : 'Create'} Placement
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
