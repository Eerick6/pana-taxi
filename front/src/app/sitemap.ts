import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://pana-taxi.winpanther.live', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: 'https://pana-taxi.winpanther.live/terminos', changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://pana-taxi.winpanther.live/privacidad', changeFrequency: 'yearly', priority: 0.3 },
  ];
}
