import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: 'https://panataxiapp.com', lastModified: new Date(), changeFrequency: 'weekly', priority: 1 },
    { url: 'https://panataxiapp.com/terminos', changeFrequency: 'yearly', priority: 0.3 },
    { url: 'https://panataxiapp.com/privacidad', changeFrequency: 'yearly', priority: 0.3 },
  ];
}
