export interface TVInfo {
  isTV: boolean;
  platform: string | null;
  manufacturer: string | null;
  version: string | null;
}

export function detectSmartTV(): TVInfo {
  const userAgent = navigator.userAgent.toLowerCase();
  
  const tvInfo: TVInfo = {
    isTV: false,
    platform: null,
    manufacturer: null,
    version: null
  };
  
  // Samsung Tizen TV
  if (userAgent.includes('tizen') || userAgent.includes('smart-tv')) {
    tvInfo.isTV = true;
    tvInfo.platform = 'Tizen';
    tvInfo.manufacturer = 'Samsung';
    
    const tizenMatch = userAgent.match(/tizen[\/\s](\d+\.\d+)/i);
    if (tizenMatch) {
      tvInfo.version = tizenMatch[1];
    }
  }
  // LG webOS TV
  else if (userAgent.includes('web0s') || userAgent.includes('webos') || userAgent.includes('netcast')) {
    tvInfo.isTV = true;
    tvInfo.platform = 'webOS';
    tvInfo.manufacturer = 'LG';
    
    const webosMatch = userAgent.match(/webos\.tv-(\d+)/i);
    if (webosMatch) {
      tvInfo.version = webosMatch[1];
    }
  }
  // Android TV
  else if (userAgent.includes('android') && 
           (userAgent.includes('tv') || 
            userAgent.includes('adt-') || 
            userAgent.includes('aftb') || 
            userAgent.includes('afts'))) {
    tvInfo.isTV = true;
    tvInfo.platform = 'Android TV';
    
    if (userAgent.includes('bravia')) {
      tvInfo.manufacturer = 'Sony';
    } else if (userAgent.includes('shield')) {
      tvInfo.manufacturer = 'Nvidia';
    } else if (userAgent.includes('adt-') || userAgent.includes('aft')) {
      tvInfo.manufacturer = 'Amazon';
      tvInfo.platform = 'Fire TV';
    }
  }
  // Apple TV
  else if (userAgent.includes('apple tv')) {
    tvInfo.isTV = true;
    tvInfo.platform = 'tvOS';
    tvInfo.manufacturer = 'Apple';
  }
  // Vizio SmartCast
  else if (userAgent.includes('vizio')) {
    tvInfo.isTV = true;
    tvInfo.manufacturer = 'Vizio';
    tvInfo.platform = 'SmartCast';
  }
  // Hisense/Roku TV
  else if (userAgent.includes('roku') || userAgent.includes('hisense')) {
    tvInfo.isTV = true;
    tvInfo.platform = 'Roku';
  }
  
  return tvInfo;
}

export function isSmartTV(): boolean {
  return detectSmartTV().isTV;
}

/**
 * React hook to check if user is in TV mode
 * Returns true if on a TV platform OR if ?tv=1 query param is present
 */
export function useIsTVMode(): boolean {
  if (typeof window === 'undefined') return false;
  
  // Check for explicit TV mode query param
  const hasQueryParam = window.location.search.includes('tv=1');
  
  // Or detect TV platform
  const isTVPlatform = isSmartTV();
  
  return hasQueryParam || isTVPlatform;
}
