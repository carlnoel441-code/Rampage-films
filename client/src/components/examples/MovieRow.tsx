import MovieRow from '../MovieRow'
import poster1 from '@assets/generated_images/Vintage_thriller_movie_poster_177dcf87.png'
import poster2 from '@assets/generated_images/Retro_sci-fi_movie_poster_c3aa9067.png'
import poster3 from '@assets/generated_images/Film_noir_movie_poster_f13dd592.png'
import poster4 from '@assets/generated_images/Action_thriller_movie_poster_af1ac279.png'
import poster5 from '@assets/generated_images/Horror_movie_poster_1af41bb8.png'
import poster6 from '@assets/generated_images/Western_movie_poster_0797166e.png'

export default function MovieRowExample() {
  const movies = [
    { id: "1", title: "Midnight Conspiracy", year: "1975", rating: "7.8", poster: poster1, genre: "Thriller" },
    { id: "2", title: "Stellar Odyssey", year: "1983", rating: "8.2", poster: poster2, genre: "Sci-Fi" },
    { id: "3", title: "Shadow Detective", year: "1948", rating: "8.5", poster: poster3, genre: "Noir" },
    { id: "4", title: "Terminal Velocity", year: "1995", rating: "7.1", poster: poster4, genre: "Action" },
    { id: "5", title: "Echoes in the Dark", year: "2001", rating: "7.6", poster: poster5, genre: "Horror" },
    { id: "6", title: "Dust & Glory", year: "1969", rating: "8.0", poster: poster6, genre: "Western" },
  ];

  return (
    <div className="bg-background py-8">
      <MovieRow title="Cult Classics" movies={movies} />
    </div>
  )
}
