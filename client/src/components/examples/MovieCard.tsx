import MovieCard from '../MovieCard'
import poster1 from '@assets/generated_images/Vintage_thriller_movie_poster_177dcf87.png'

export default function MovieCardExample() {
  return (
    <div className="w-64 p-8 bg-background">
      <MovieCard
        id="1"
        title="Midnight Conspiracy"
        year="1975"
        rating="7.8"
        poster={poster1}
        genre="Thriller"
      />
    </div>
  )
}
