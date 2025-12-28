import { useQuery } from "@tanstack/react-query";
import { useProfile } from "@/hooks/useProfile";
import { useLocation } from "wouter";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { User, Baby } from "lucide-react";
import type { Profile } from "@shared/schema";

const AVATAR_COLORS = [
  "from-amber-500 to-yellow-600",
  "from-blue-500 to-indigo-600",
  "from-purple-500 to-pink-600",
  "from-green-500 to-emerald-600",
  "from-red-500 to-orange-600",
];

export default function ProfileSelector() {
  const { data: profilesData, isLoading } = useQuery<Profile[]>({
    queryKey: ["/api/profiles"],
  });
  const { selectProfile, isSelecting } = useProfile({ enabled: true });
  const [, setLocation] = useLocation();

  const handleSelectProfile = async (profileId: string) => {
    try {
      await selectProfile(profileId);
      setLocation("/");
    } catch (error) {
      console.error("Failed to select profile:", error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-full max-w-4xl px-4">
          <h1 className="text-4xl md:text-5xl font-bold text-center mb-12">
            Who's watching?
          </h1>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex flex-col items-center space-y-3">
                <Skeleton className="w-32 h-32 rounded-md" />
                <Skeleton className="h-6 w-24" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const profiles = profilesData || [];

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <h1 className="text-4xl md:text-5xl font-bold text-center mb-12 text-foreground">
          Who's watching?
        </h1>
        
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 max-w-3xl mx-auto">
          {profiles.map((profile, index) => {
            const colorClass = AVATAR_COLORS[index % AVATAR_COLORS.length];
            return (
              <button
                key={profile.id}
                onClick={() => handleSelectProfile(profile.id)}
                disabled={isSelecting}
                className="group flex flex-col items-center space-y-3 focus:outline-none"
                data-testid={`button-select-profile-${profile.id}`}
              >
                <Card
                  className={`
                    w-32 h-32 flex items-center justify-center
                    bg-gradient-to-br ${colorClass}
                    hover-elevate active-elevate-2
                    transition-all duration-200
                    ${isSelecting ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                  `}
                >
                  {profile.isKidsProfile === 1 ? (
                    <Baby className="w-16 h-16 text-white" />
                  ) : (
                    <User className="w-16 h-16 text-white" />
                  )}
                </Card>
                <span className="text-lg font-medium text-foreground/90 group-hover:text-foreground transition-colors">
                  {profile.name}
                </span>
                {profile.isKidsProfile === 1 && (
                  <span className="text-xs text-foreground/60">Kids Profile</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
