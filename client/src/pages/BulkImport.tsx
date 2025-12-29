import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { useAdminAuth } from "@/contexts/AdminAuthContext";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileJson, ArrowLeft } from "lucide-react";
import { useLocation } from "wouter";

export default function BulkImport() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { isAuthorized, isLoading } = useAdminAuth();
  const [jsonData, setJsonData] = useState("");
  const [importResults, setImportResults] = useState<{
    imported: number;
    updated: number;
    total: number;
    skipped: number;
  } | null>(null);

  const bulkImportMutation = useMutation({
    mutationFn: async (moviesData: any[]) => {
      const res = await fetch("/api/admin/bulk-import", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ movies: moviesData }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to bulk import movies");
      }

      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/movies"] });
      setImportResults({
        imported: data.imported,
        updated: data.updated,
        total: data.total,
        skipped: data.skipped || 0,
      });
      toast({
        title: "Import Complete!",
        description: `Imported ${data.imported} new movies, updated ${data.updated} existing movies.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import movies",
        variant: "destructive",
      });
    },
  });

  const handleImport = () => {
    try {
      const parsedData = JSON.parse(jsonData);
      if (!Array.isArray(parsedData)) {
        toast({
          title: "Invalid Format",
          description: "JSON data must be an array of movies",
          variant: "destructive",
        });
        return;
      }
      bulkImportMutation.mutate(parsedData);
    } catch (error) {
      toast({
        title: "Invalid JSON",
        description: "Please check your JSON format and try again",
        variant: "destructive",
      });
    }
  };

  const loadSampleData = async () => {
    try {
      const res = await fetch("/api/admin/movies-export", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.text();
        setJsonData(data);
        toast({
          title: "Sample Data Loaded",
          description: "Development movies loaded. Click Import to transfer them.",
        });
      } else {
        toast({
          title: "Could not load sample data",
          description: "You can paste your exported JSON manually",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Could not load sample data",
        description: "You can paste your exported JSON manually",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 container max-w-2xl mx-auto px-4 py-16">
          <Card className="p-8">
            <h1 className="text-2xl font-bold mb-4">Unauthorized</h1>
            <p className="text-muted-foreground mb-4">
              You need admin access to use the bulk import feature.
            </p>
            <Button onClick={() => setLocation("/admin-login")} data-testid="button-login">
              Go to Admin Login
            </Button>
          </Card>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 container max-w-4xl mx-auto px-4 py-8">
        <div className="mb-6">
          <Button
            variant="ghost"
            onClick={() => setLocation("/admin")}
            className="mb-4"
            data-testid="button-back-admin"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Admin
          </Button>
          <h1 className="text-3xl font-bold mb-2">Bulk Import Movies</h1>
          <p className="text-muted-foreground">
            Import multiple movies at once from JSON data. This will add new movies
            and update existing ones based on title and year.
          </p>
        </div>

        <div className="grid gap-6">
          <Card className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <FileJson className="w-5 h-5 text-primary" />
              <h2 className="text-xl font-semibold">Import Instructions</h2>
            </div>
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>1. Export your movies from the development database as JSON</p>
              <p>2. Paste the JSON array below (or load sample data)</p>
              <p>3. Click Import to transfer all movies to production</p>
              <p className="text-xs mt-4">
                <strong>Note:</strong> Movies with matching title+year will be updated,
                new movies will be added.
              </p>
            </div>
            <div className="mt-4">
              <Button
                onClick={loadSampleData}
                variant="outline"
                size="sm"
                data-testid="button-load-sample"
              >
                <Upload className="w-4 h-4 mr-2" />
                Load Development Movies
              </Button>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-xl font-semibold mb-4">JSON Data</h2>
            <Textarea
              value={jsonData}
              onChange={(e) => setJsonData(e.target.value)}
              placeholder='Paste your JSON array here: [{"title": "Movie Title", "year": "2024", ...}]'
              className="min-h-[300px] font-mono text-sm"
              data-testid="textarea-json-data"
            />
            <div className="flex gap-2 mt-4">
              <Button
                onClick={handleImport}
                disabled={!jsonData || bulkImportMutation.isPending}
                data-testid="button-import"
              >
                {bulkImportMutation.isPending ? "Importing..." : "Import Movies"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setJsonData("");
                  setImportResults(null);
                }}
                data-testid="button-clear"
              >
                Clear
              </Button>
            </div>
          </Card>

          {importResults && (
            <Card className="p-6 border-primary">
              <h2 className="text-xl font-semibold mb-4 text-primary">Import Results</h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Total Processed</p>
                  <p className="text-2xl font-bold" data-testid="text-total">
                    {importResults.total}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">New Movies</p>
                  <p className="text-2xl font-bold text-green-600" data-testid="text-imported">
                    {importResults.imported}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Updated</p>
                  <p className="text-2xl font-bold text-blue-600" data-testid="text-updated">
                    {importResults.updated}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Skipped</p>
                  <p className="text-2xl font-bold text-yellow-600" data-testid="text-skipped">
                    {importResults.skipped}
                  </p>
                </div>
              </div>
              <Button
                onClick={() => setLocation("/admin")}
                className="mt-6"
                data-testid="button-view-movies"
              >
                View All Movies
              </Button>
            </Card>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
