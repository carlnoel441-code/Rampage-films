import { useState, useEffect } from "react";

export interface SkipSegments {
  introStart?: number | null;
  introEnd?: number | null;
  creditsStart?: number | null;
}

interface UseSkipSegmentsProps {
  segments: SkipSegments;
  currentTime: number;
  duration: number;
}

export interface SkipButtonState {
  showSkipIntro: boolean;
  showSkipCredits: boolean;
  skipIntroTo: number | null;
  skipCreditsTo: number | null;
}

export function useSkipSegments({ segments, currentTime, duration }: UseSkipSegmentsProps): SkipButtonState {
  const [showSkipIntro, setShowSkipIntro] = useState(false);
  const [showSkipCredits, setShowSkipCredits] = useState(false);

  const { introStart, introEnd, creditsStart } = segments;

  useEffect(() => {
    const introStartSeconds = introStart ?? null;
    const introEndSeconds = introEnd ?? null;
    const creditsStartSeconds = creditsStart ?? null;

    // Skip Intro: show when currentTime is between introStart and introEnd
    if (introStartSeconds !== null && introEndSeconds !== null) {
      const inIntroRange = currentTime >= introStartSeconds && currentTime < introEndSeconds;
      setShowSkipIntro(inIntroRange);
    } else {
      setShowSkipIntro(false);
    }

    // Skip Credits: show when currentTime >= creditsStart (with 5s buffer before end)
    if (creditsStartSeconds !== null && duration > 0) {
      const inCreditsRange = currentTime >= creditsStartSeconds && currentTime < duration - 5;
      setShowSkipCredits(inCreditsRange);
    } else {
      setShowSkipCredits(false);
    }
  }, [currentTime, introStart, introEnd, creditsStart, duration]);

  return {
    showSkipIntro,
    showSkipCredits,
    skipIntroTo: introEnd ?? null,
    skipCreditsTo: creditsStart ?? null,
  };
}
