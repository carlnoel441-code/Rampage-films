import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface IntroAnimationProps {
  onComplete: () => void;
  duration?: number;
}

export function IntroAnimation({ onComplete, duration = 4000 }: IntroAnimationProps) {
  const [phase, setPhase] = useState<'building' | 'reveal' | 'fade'>('building');
  const skipButtonRef = useRef<HTMLButtonElement>(null);
  
  // Check for reduced motion preference
  const prefersReducedMotion = typeof window !== 'undefined' 
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    // Skip animation entirely if user prefers reduced motion
    if (prefersReducedMotion) {
      onComplete();
      return;
    }

    const buildTimer = setTimeout(() => setPhase('reveal'), 1500);
    const revealTimer = setTimeout(() => setPhase('fade'), duration - 500);
    const completeTimer = setTimeout(onComplete, duration);
    
    // Focus skip button after it appears for keyboard/TV remote users
    const focusTimer = setTimeout(() => {
      skipButtonRef.current?.focus();
    }, 1600);

    return () => {
      clearTimeout(buildTimer);
      clearTimeout(revealTimer);
      clearTimeout(completeTimer);
      clearTimeout(focusTimer);
    };
  }, [onComplete, duration, prefersReducedMotion]);

  const handleSkip = () => {
    onComplete();
  };
  
  // Handle keyboard events for accessibility
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
      e.preventDefault();
      onComplete();
    }
  };

  return (
    <AnimatePresence>
      {phase !== 'fade' ? null : null}
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: phase === 'fade' ? 0 : 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-[9999] bg-black flex items-center justify-center overflow-hidden"
        data-testid="intro-animation"
        role="dialog"
        aria-label="Rampage Films intro animation"
        aria-modal="true"
        onKeyDown={handleKeyDown}
        tabIndex={-1}
      >
        {/* Film grain overlay */}
        <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%' height='100%' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* Cinematic light rays */}
        <motion.div
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ 
            opacity: phase === 'building' ? 0 : [0.3, 0.5, 0.3],
            scale: phase === 'building' ? 0.5 : 1.5,
            rotate: [0, 180, 360]
          }}
          transition={{ 
            duration: 3,
            rotate: { duration: 20, repeat: Infinity, ease: "linear" }
          }}
          className="absolute w-[800px] h-[800px]"
          style={{
            background: 'conic-gradient(from 0deg, transparent, rgba(212, 175, 55, 0.1), transparent, rgba(212, 175, 55, 0.1), transparent)',
          }}
        />

        {/* Center glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0 }}
          animate={{ 
            opacity: phase === 'building' ? 0.3 : 0.6,
            scale: phase === 'building' ? 0.5 : 1
          }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="absolute w-96 h-96 rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.3) 0%, rgba(212, 175, 55, 0.1) 30%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />

        {/* Main logo container */}
        <div className="relative z-10 text-center">
          {/* RAMPAGE text */}
          <motion.div
            initial={{ opacity: 0, y: 20, letterSpacing: '0.5em' }}
            animate={{ 
              opacity: phase === 'building' ? 0 : 1,
              y: phase === 'building' ? 20 : 0,
              letterSpacing: phase === 'building' ? '0.5em' : '0.15em'
            }}
            transition={{ duration: 1.2, ease: [0.25, 0.46, 0.45, 0.94] }}
            className="relative"
          >
            <h1 
              className="text-6xl md:text-8xl font-bold tracking-wider"
              style={{
                fontFamily: "'Playfair Display', serif",
                background: 'linear-gradient(180deg, #F5E6A3 0%, #D4AF37 50%, #AA8C2C 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                textShadow: '0 0 60px rgba(212, 175, 55, 0.5)',
                filter: 'drop-shadow(0 0 20px rgba(212, 175, 55, 0.3))',
              }}
            >
              RAMPAGE
            </h1>
            
            {/* Gold underline accent */}
            <motion.div
              initial={{ scaleX: 0, opacity: 0 }}
              animate={{ 
                scaleX: phase === 'building' ? 0 : 1,
                opacity: phase === 'building' ? 0 : 1
              }}
              transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}
              className="h-[2px] mt-2 mx-auto"
              style={{
                width: '60%',
                background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)',
              }}
            />
          </motion.div>

          {/* FILMS text */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ 
              opacity: phase === 'building' ? 0 : 1,
              y: phase === 'building' ? -10 : 0
            }}
            transition={{ duration: 0.8, delay: 0.5, ease: "easeOut" }}
          >
            <h2 
              className="text-2xl md:text-4xl tracking-[0.4em] mt-4"
              style={{
                fontFamily: "'Inter', sans-serif",
                fontWeight: 300,
                color: '#D4AF37',
                textShadow: '0 0 30px rgba(212, 175, 55, 0.4)',
              }}
            >
              FILMS
            </h2>
          </motion.div>

          {/* Tagline */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: phase === 'reveal' ? 0.7 : 0 }}
            transition={{ duration: 1, delay: 0.8 }}
            className="mt-8 text-sm md:text-base tracking-widest uppercase"
            style={{
              color: 'rgba(212, 175, 55, 0.6)',
              fontFamily: "'Inter', sans-serif",
              fontWeight: 300,
            }}
          >
            Rare Cinema. Rediscovered.
          </motion.p>
        </div>

        {/* Particle effects */}
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0,
              x: Math.random() * window.innerWidth - window.innerWidth / 2,
              y: window.innerHeight / 2 + 100,
              scale: Math.random() * 0.5 + 0.5
            }}
            animate={{ 
              opacity: phase === 'building' ? 0 : [0, 0.8, 0],
              y: -window.innerHeight / 2 - 100,
            }}
            transition={{ 
              duration: Math.random() * 3 + 2,
              delay: Math.random() * 2,
              repeat: Infinity,
              ease: "easeOut"
            }}
            className="absolute w-1 h-1 rounded-full"
            style={{
              background: 'radial-gradient(circle, #D4AF37 0%, transparent 70%)',
              boxShadow: '0 0 6px 2px rgba(212, 175, 55, 0.3)',
            }}
          />
        ))}

        {/* Skip button */}
        <motion.button
          ref={skipButtonRef}
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.5 }}
          whileHover={{ opacity: 1 }}
          whileFocus={{ opacity: 1 }}
          transition={{ delay: 1.5 }}
          onClick={handleSkip}
          className="absolute bottom-8 right-8 text-xs tracking-widest uppercase px-4 py-2 border border-white/20 rounded hover:border-white/40 focus:border-[#D4AF37] focus:outline-none focus:ring-2 focus:ring-[#D4AF37]/50 transition-colors"
          style={{ color: 'rgba(255, 255, 255, 0.5)' }}
          data-testid="button-skip-intro"
          aria-label="Skip intro animation"
        >
          Skip
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
}
