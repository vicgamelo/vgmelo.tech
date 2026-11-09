const KEY = 'vgmelo.ads-consent';
export type Choice = 'yes' | 'no';

export function readConsent(): Choice | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'yes' || v === 'no' ? v : null;
  } catch {
    return null; // storage bloqueado: trata como sem escolha, e nada carrega
  }
}

export function saveConsent(choice: Choice): void {
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* sem storage, a escolha vale só para esta página */
  }
}

export function isValidClient(client: string): boolean {
  return /^ca-pub-\d{10,20}$/.test(client);
}

/** Carrega o AdSense e mostra os espaços de anúncio. Só chamar depois do aceite. */
export function loadAds(client: string): void {
  if (!isValidClient(client) || document.querySelector('script[data-adsense]')) return;
  const script = document.createElement('script');
  script.async = true;
  script.dataset.adsense = '';
  script.crossOrigin = 'anonymous';
  script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
  document.head.appendChild(script);
  const w = window as unknown as { adsbygoogle?: unknown[] };
  document.querySelectorAll<HTMLElement>('[data-ad]').forEach((slot) => {
    slot.hidden = false;
    (w.adsbygoogle = w.adsbygoogle || []).push({});
  });
}
