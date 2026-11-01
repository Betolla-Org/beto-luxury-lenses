
export interface Lens {
  id: string;
  name: string;
  code: string;
  collection: string;
  imageUrl: string;
  price: string;
  description: string;
  color: string;
}

export type CollectionName = 'MERAL' | 'SHERAZ' | 'NATURAL' | 'VENUS';

export interface Collection {
  name: CollectionName;
  description: string;
  lenses: Lens[];
}

export type AppView = 'SPLASH' | 'HOME' | 'TRY_ON' | 'COLLECTION' | 'PROFILE' | 'DASHBOARD';

declare global {
  interface Window {
    FaceMesh: any;
    Camera: any;
  }
}
