import HeroSection from '../HeroSection'
import heroBackdrop1 from '@assets/generated_images/Cyberpunk_city_hero_backdrop_d85b49aa.png'
import heroBackdrop2 from '@assets/generated_images/Stormy_ocean_hero_backdrop_00b6c209.png'

export default function HeroSectionExample() {
  const movies = [
    {
      title: "Neon Shadows",
      description: "In a dystopian future where memories can be stolen, a rogue detective must navigate the neon-lit streets to uncover a conspiracy that threatens humanity's last free thoughts.",
      year: "1987",
      rating: "R",
      genres: ["Sci-Fi", "Thriller", "Cyberpunk"],
      backdrop: heroBackdrop1
    },
    {
      title: "The Lighthouse Keeper",
      description: "A mysterious lighthouse keeper guards a terrible secret in this atmospheric thriller. When a storm strands a group of travelers, they discover that some secrets are worth killing for.",
      year: "1974",
      rating: "PG-13",
      genres: ["Mystery", "Horror", "Drama"],
      backdrop: heroBackdrop2
    }
  ];

  return <HeroSection movies={movies} />
}
