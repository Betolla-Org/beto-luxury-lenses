// The lens catalogue is shared with the web app: edit ../../constants.tsx, not this file.
export { APP_LOGO, COLLECTIONS, COLLECTION_IMAGES, HERO_IMAGE, LENSES } from '../../constants';
export type { Collection, CollectionName, Lens } from '../../types';

import { COLLECTIONS, LENSES } from '../../constants';

export const findLens = (id: string) => LENSES.find(l => l.id === id);
export const findCollection = (name: string) => COLLECTIONS.find(c => c.name === name);
