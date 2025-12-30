import { useEffect } from "react";
import { useIsTVMode } from "@/utils/tvDetection";

interface KeyboardNavigationOptions {
  enabled?: boolean;
  onBack?: () => void;
  onEnter?: () => void;
}

/**
 * Opt-in spatial D-pad navigation for TV remotes
 * Only activates on TV platforms and within marked containers
 * Uses bounding-box geometry for directional focus movement
 */
export function useKeyboardNavigation(options: KeyboardNavigationOptions = {}) {
  const { enabled = true, onBack, onEnter } = options;
  const isTV = useIsTVMode();

  useEffect(() => {
    // Only enable for TV users
    if (!enabled || !isTV) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement;
      
      // Handle back navigation (Escape key)
      if (event.key === 'Escape' && onBack) {
        event.preventDefault();
        onBack();
        return;
      }
      
      // Handle Enter key callback
      if (event.key === 'Enter' && onEnter) {
        event.preventDefault();
        onEnter();
        return;
      }
      
      // Only handle arrow keys if we're inside a data-tv-nav container
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        return;
      }
      
      // Check if current element or any parent has data-tv-nav
      const tvNavContainer = activeElement?.closest('[data-tv-nav]');
      if (!tvNavContainer) {
        // Not in a TV navigation container - use browser defaults
        return;
      }
      
      // Check if element explicitly disables TV navigation
      if (activeElement?.hasAttribute('data-tv-disable-nav')) {
        return;
      }
      
      // Skip navigation for text inputs, textareas, and other native controls
      const isTextInput = activeElement instanceof HTMLInputElement && 
        ['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(activeElement.type);
      const isTextArea = activeElement instanceof HTMLTextAreaElement;
      const isSelect = activeElement instanceof HTMLSelectElement;
      const isContentEditable = activeElement?.isContentEditable;
      
      if (isTextInput || isTextArea || isSelect || isContentEditable) {
        // Allow native behavior for form controls
        return;
      }
      
      // Get all focusable elements within the TV nav container
      const focusableElements = Array.from(
        tvNavContainer.querySelectorAll<HTMLElement>(
          'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter(el => {
        // Filter out hidden elements and those that opted out
        if (el.hasAttribute('data-tv-disable-nav')) return false;
        if (el.hasAttribute('aria-hidden') && el.getAttribute('aria-hidden') === 'true') return false;
        
        const style = window.getComputedStyle(el);
        const isVisible = style.display !== 'none' && 
                         style.visibility !== 'hidden' &&
                         el.offsetParent !== null;
        return isVisible;
      });
      
      if (focusableElements.length === 0) return;
      
      // Get bounding box of currently focused element
      const currentRect = activeElement.getBoundingClientRect();
      const currentCenter = {
        x: currentRect.left + currentRect.width / 2,
        y: currentRect.top + currentRect.height / 2
      };
      
      // Find the best candidate in the requested direction
      let bestCandidate: HTMLElement | null = null;
      let bestScore = Infinity;
      
      const axis = tvNavContainer.getAttribute('data-tv-axis') || 'both';
      
      for (const candidate of focusableElements) {
        if (candidate === activeElement) continue;
        
        const rect = candidate.getBoundingClientRect();
        const center = {
          x: rect.left + rect.width / 2,
          y: rect.top + rect.height / 2
        };
        
        let isInDirection = false;
        let distance = 0;
        
        switch (event.key) {
          case 'ArrowRight':
            if (axis === 'vertical') continue;
            isInDirection = center.x > currentCenter.x;
            distance = Math.abs(center.x - currentCenter.x) + Math.abs(center.y - currentCenter.y) * 0.3;
            break;
          case 'ArrowLeft':
            if (axis === 'vertical') continue;
            isInDirection = center.x < currentCenter.x;
            distance = Math.abs(center.x - currentCenter.x) + Math.abs(center.y - currentCenter.y) * 0.3;
            break;
          case 'ArrowDown':
            if (axis === 'horizontal') continue;
            isInDirection = center.y > currentCenter.y;
            distance = Math.abs(center.y - currentCenter.y) + Math.abs(center.x - currentCenter.x) * 0.3;
            break;
          case 'ArrowUp':
            if (axis === 'horizontal') continue;
            isInDirection = center.y < currentCenter.y;
            distance = Math.abs(center.y - currentCenter.y) + Math.abs(center.x - currentCenter.x) * 0.3;
            break;
        }
        
        if (isInDirection && distance < bestScore) {
          bestScore = distance;
          bestCandidate = candidate;
        }
      }
      
      // If no candidate found in current container AND user pressed vertical arrow,
      // search all containers for cross-container vertical navigation
      if (!bestCandidate && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
        const allContainers = Array.from(document.querySelectorAll('[data-tv-nav]'));
        
        for (const container of allContainers) {
          if (container === tvNavContainer) continue; // Skip current container
          
          const containerElements = Array.from(
            container.querySelectorAll<HTMLElement>(
              'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
            )
          ).filter(el => {
            if (el.hasAttribute('data-tv-disable-nav')) return false;
            if (el.hasAttribute('aria-hidden') && el.getAttribute('aria-hidden') === 'true') return false;
            
            const style = window.getComputedStyle(el);
            return style.display !== 'none' && style.visibility !== 'hidden' && el.offsetParent !== null;
          });
          
          for (const candidate of containerElements) {
            const rect = candidate.getBoundingClientRect();
            const center = {
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2
            };
            
            let isInDirection = false;
            let distance = 0;
            
            // Only check vertical direction for cross-container navigation
            if (event.key === 'ArrowDown') {
              isInDirection = center.y > currentCenter.y;
              distance = Math.abs(center.y - currentCenter.y) + Math.abs(center.x - currentCenter.x) * 0.3;
            } else if (event.key === 'ArrowUp') {
              isInDirection = center.y < currentCenter.y;
              distance = Math.abs(center.y - currentCenter.y) + Math.abs(center.x - currentCenter.x) * 0.3;
            }
            
            if (isInDirection && distance < bestScore) {
              bestScore = distance;
              bestCandidate = candidate;
            }
          }
        }
      }
      
      // Move focus to best candidate
      if (bestCandidate) {
        event.preventDefault();
        bestCandidate.focus();
        
        // Scroll into view smoothly
        bestCandidate.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [enabled, isTV, onBack, onEnter]);
}
