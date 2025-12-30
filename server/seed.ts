import { storage } from "./storage";
import { type InsertMovie } from "@shared/schema";

export async function seedDatabase() {
  const movies: InsertMovie[] = [
    {
      title: "Midnight Conspiracy",
      description: "A gripping thriller that follows a journalist uncovering a web of political corruption. When she gets too close to the truth, she becomes the target of a sinister conspiracy that reaches the highest levels of government.",
      year: "1975",
      rating: "R",
      genres: ["Thriller", "Mystery", "Drama"],
      poster: "/api/assets/vintage-thriller.png",
      backdrop: "/api/assets/cyberpunk-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      duration: 128,
      director: "James Mitchell",
      cast: ["Sarah Connor", "Michael Roberts", "Jennifer Hayes", "David Thompson"]
    },
    {
      title: "Stellar Odyssey",
      description: "In a dystopian future, a rogue space pilot discovers an ancient alien artifact that could save humanity or destroy it. A visually stunning sci-fi epic that redefined the genre.",
      year: "1983",
      rating: "PG-13",
      genres: ["Sci-Fi", "Adventure", "Action"],
      poster: "/api/assets/scifi-poster.png",
      backdrop: "/api/assets/stormy-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      duration: 145,
      director: "Robert Yamato",
      cast: ["Mark Stevens", "Elena Rodriguez", "Tommy Chen", "Alice Walker"]
    },
    {
      title: "Shadow Detective",
      description: "A hard-boiled detective navigates the dark underbelly of a rain-soaked city to solve a murder that everyone wants to forget. Classic film noir at its finest.",
      year: "1948",
      rating: "PG",
      genres: ["Noir", "Crime", "Mystery"],
      poster: "/api/assets/noir-poster.png",
      backdrop: "/api/assets/cyberpunk-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
      duration: 98,
      director: "Vincent Black",
      cast: ["Richard Crane", "Barbara Maxwell", "George Hamilton", "Rita Morrison"]
    },
    {
      title: "Terminal Velocity",
      description: "An adrenaline-pumping action thriller about a former special ops agent racing against time to prevent a terrorist attack. Non-stop action from start to finish.",
      year: "1995",
      rating: "R",
      genres: ["Action", "Thriller", "Crime"],
      poster: "/api/assets/action-poster.png",
      backdrop: "/api/assets/stormy-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4",
      duration: 112,
      director: "Marcus Kane",
      cast: ["Jake Morrison", "Lisa Chen", "Robert Drake", "Angela Martinez"]
    },
    {
      title: "Echoes in the Dark",
      description: "A family moves into an old Victorian mansion, only to discover it harbors dark secrets and vengeful spirits. A chilling psychological horror that will keep you up at night.",
      year: "2001",
      rating: "R",
      genres: ["Horror", "Thriller", "Supernatural"],
      poster: "/api/assets/horror-poster.png",
      backdrop: "/api/assets/cyberpunk-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4",
      duration: 105,
      director: "Amanda Cross",
      cast: ["Emily Watson", "Jonathan Price", "Sarah Miller", "Daniel Foster"]
    },
    {
      title: "Dust & Glory",
      description: "A lone gunslinger seeks redemption in the lawless frontier. This revisionist western explores themes of justice, revenge, and the cost of violence.",
      year: "1969",
      rating: "PG-13",
      genres: ["Western", "Drama", "Action"],
      poster: "/api/assets/western-poster.png",
      backdrop: "/api/assets/stormy-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4",
      duration: 136,
      director: "Sergio Montana",
      cast: ["Clint Harrison", "Maria Rodriguez", "Buck Wilson", "Sam Jackson"]
    },
    {
      title: "Neon Shadows",
      description: "In a dystopian future where memories can be stolen, a rogue detective must navigate the neon-lit streets to uncover a conspiracy that threatens humanity's last free thoughts.",
      year: "1987",
      rating: "R",
      genres: ["Sci-Fi", "Thriller", "Cyberpunk"],
      poster: "/api/assets/scifi-poster.png",
      backdrop: "/api/assets/cyberpunk-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/Sintel.mp4",
      duration: 118,
      director: "Akira Tanaka",
      cast: ["Ryan Cooper", "Jade Lin", "Marcus Black", "Nina Volkov"]
    },
    {
      title: "The Lighthouse Keeper",
      description: "A mysterious lighthouse keeper guards a terrible secret in this atmospheric thriller. When a storm strands a group of travelers, they discover that some secrets are worth killing for.",
      year: "1974",
      rating: "PG-13",
      genres: ["Mystery", "Horror", "Drama"],
      poster: "/api/assets/vintage-thriller.png",
      backdrop: "/api/assets/stormy-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4",
      duration: 95,
      director: "Edgar Price",
      cast: ["Patrick Stewart", "Catherine Deneuve", "Tom Hardy", "Emma Stone"]
    },
    {
      title: "The Crimson Heist",
      description: "A master thief plans one last score that could set him up for life, but when his crew betrays him, he must fight to survive and get his revenge.",
      year: "1991",
      rating: "R",
      genres: ["Crime", "Thriller", "Action"],
      poster: "/api/assets/action-poster.png",
      backdrop: "/api/assets/cyberpunk-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
      duration: 122,
      director: "Michael Bay",
      cast: ["Bruce Willis", "Samuel Jackson", "Jennifer Lopez", "Robert De Niro"]
    },
    {
      title: "Whispers from Beyond",
      description: "A paranormal investigator confronts her own demons while investigating a haunted asylum. Reality and nightmare blur in this terrifying supernatural thriller.",
      year: "2003",
      rating: "R",
      genres: ["Horror", "Supernatural", "Mystery"],
      poster: "/api/assets/horror-poster.png",
      backdrop: "/api/assets/stormy-backdrop.png",
      videoUrl: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
      duration: 101,
      director: "James Wan",
      cast: ["Vera Farmiga", "Patrick Wilson", "Lin Shaye", "Rose Byrne"]
    }
  ];

  try {
    await storage.seedMovies(movies);
    console.log("Database seeded successfully with", movies.length, "movies");
  } catch (error) {
    console.error("Error seeding database:", error);
  }
}
