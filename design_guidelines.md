# Rampage Films - Design Guidelines

## Design Approach
**Reference-Based:** Drawing inspiration from Netflix, Hulu, and Tubi, with premium aesthetic elevating the streaming experience through black and gold luxury theme.

## Color Palette
- **Primary Black:** Deep black (#0A0A0A) for backgrounds and main surfaces
- **Gold Accent:** Rich gold (#D4AF37) for CTAs, highlights, and interactive elements
- **Secondary Gold:** Muted gold (#8B7355) for secondary actions and borders
- **Text:** Pure white (#FFFFFF) for primary text, rgba(255,255,255,0.7) for secondary text
- **Surfaces:** Dark gray (#1A1A1A) for cards and elevated surfaces

## Typography
- **Primary Font:** Inter (Google Fonts) for UI elements
- **Display Font:** Playfair Display for hero headlines and movie titles
- **Hierarchy:**
  - Hero headlines: 56px-72px, Playfair Display, bold
  - Section headers: 32px-40px, Inter, semibold
  - Movie titles: 18px-24px, Inter, medium
  - Body text: 14px-16px, Inter, regular
  - Metadata: 12px-14px, Inter, regular, reduced opacity

## Layout System
**Spacing Units:** Consistently use Tailwind units of 2, 4, 6, 8, 12, 16, and 24 for rhythm
- Page padding: px-4 md:px-8 lg:px-12
- Section spacing: py-12 md:py-16 lg:py-24
- Component gaps: gap-4 to gap-8

## Core Components

### Navigation Header
- Fixed top bar with black background, subtle gold bottom border
- Logo left (Rampage Films wordmark), search center, user profile/menu right
- Height: 64px desktop, 56px mobile
- Search bar: Dark surface with gold focus state

### Hero Section
Full-width featured movie showcase (16:9 aspect ratio, 70vh height):
- Large featured movie backdrop image with gradient overlay (black to transparent, bottom to top)
- Movie title (Playfair Display), rating, year, genre tags overlay bottom-left
- CTA buttons (Play, Add to Watchlist) with blurred black backgrounds (backdrop-blur-md)
- Auto-rotating carousel every 8 seconds

### Movie Grid Layouts
**Primary Pattern:** Horizontal scrolling rows by category
- Row spacing: mb-12
- Card aspect ratio: 2:3 (poster style)
- Cards per row: 6-8 desktop, 3-4 tablet, 2-3 mobile
- Hover effect: Scale to 1.05, gold border glow, show metadata overlay

### Movie Cards
- Poster image fills card
- Gradient overlay on hover revealing: title, year, rating, quick-add icon
- Gold bookmark icon (top-right) for watchlist status
- Loading skeleton: Dark gray with subtle shimmer

### Movie Detail Page
Two-column layout (desktop):
- Left: Movie poster (fixed width 400px)
- Right: Title, metadata, synopsis, cast, trailer embed
- Below: Related movies carousel
- Floating CTA: "Watch Now" button (gold, prominent)

### Video Player
Full-screen native experience:
- Custom controls bar (black with 80% opacity)
- Gold progress bar and volume indicator
- Controls: Play/pause, timeline, volume, quality selector, fullscreen
- Ad countdown timer (when applicable): Gold text, top-right

### Ad Placement
Strategic, non-intrusive integration:
- Pre-roll: 15-30 second max before content
- Mid-roll: Every 45 minutes for movies over 90 minutes
- Ad indicators: Gold "Ad" badge with countdown
- Skip button: Available after 5 seconds (gold accent)

### Search & Filter
Overlay modal with dark background:
- Search input: Large, centered, gold underline
- Filter chips: Genre, year, rating (gold outline when selected)
- Results: Same grid pattern as browse

### Footer
Compact single row:
- Links: About, Contact, Terms, Privacy
- Social icons (gold on hover)
- Copyright text
- Background: Pure black

## Images Strategy

### Hero Images
- **Featured Movie Backdrops:** High-quality 1920x1080 cinematic stills from featured films
- **Placement:** Full-width hero section with gradient overlay
- **Treatment:** Subtle blur on far edges, sharp center focus

### Movie Posters
- **Standard:** 400x600 vertical posters for all movie cards
- **Quality:** High-resolution, properly cropped theatrical posters

### Trailer Thumbnails
- **Format:** 16:9 aspect ratio stills
- **Overlay:** Gold play icon centered

## Interaction Patterns
- Page transitions: Smooth fade (200ms)
- Card hover: Quick scale transform (150ms)
- Button hover: Brighten gold by 15%, no other states on blurred buttons
- Scroll behavior: Smooth scrolling throughout
- Loading states: Gold shimmer animation on dark skeletons

## Accessibility
- Maintain 4.5:1 contrast ratio (white text on black backgrounds)
- Focus states: 2px gold outline with 4px offset
- Keyboard navigation: Clear focus indicators throughout
- Screen reader labels: Comprehensive aria-labels on all interactive elements
- Skip to content link: Available for keyboard users

## Responsive Breakpoints
- Mobile: < 768px (single/double column grids)
- Tablet: 768px - 1024px (3-4 column grids)
- Desktop: > 1024px (6-8 column grids)
- Large Desktop: > 1440px (max-width container at 1400px)

---

**Key Principle:** Premium streaming experience with black and gold luxury aesthetic, Netflix-level polish with unique personality through gold accents and curated hard-to-find content discovery.