import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | number | Date | null | undefined) {
  if (!date) {
    return new Date().toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    });
  }
  const d = new Date(date);
  if (isNaN(d.getTime())) {
    return 'Recently';
  }
  return d.toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && envUrl.trim() !== "") {
    let url = envUrl.trim();
    if (url.endsWith('/')) {
      url = url.slice(0, -1);
    }
    if (url.endsWith('/api')) {
      url = url.slice(0, -4);
    }
    return url;
  }
  
  // All API endpoints are served by the full-stack server on the same origin.
  // Using relative path ensures all requests seamlessly hit the local pipeline.
  return '';
}

export function getAssetPath(path: string): string {
  const baseUrl = import.meta.env.BASE_URL || '/';
  const combined = `${baseUrl}${path}`;
  return combined.replace(/\/+/g, '/');
}
