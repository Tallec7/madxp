// Mocks brand kit + roster joueurs. En V1 réelle :
//  - brand kit vient de la table site_brand_kits (1 ligne par site)
//  - roster vient de la table players, photo cutout poussée par worker rembg

export type BrandKit = {
  siteId: string;
  clubName: string;
  colors: { primary: string; secondary: string; accent: string };
  logos: { primary: string };
  fonts: { display: string; body: string };
};

export type Player = {
  id: string;
  prenom: string;
  nom: string;
  numero: number;
  poste: string;
  photoRawUrl: string;
  photoCutoutUrl: string | null;
  cutoutStatus: 'pending' | 'processing' | 'ready' | 'failed';
};

export const INITIAL_BRAND_KIT: BrandKit = {
  siteId: 'site-nlf-test',
  clubName: 'NLF',
  colors: { primary: '#0066ff', secondary: '#ffffff', accent: '#ffd400' },
  logos: { primary: '/logos/nlf.png' },
  fonts: { display: 'GeneralSans-Bold', body: 'GeneralSans-Semibold' },
};

export const INITIAL_PLAYERS: Player[] = [
  {
    id: 'p1',
    prenom: 'Kévin',
    nom: 'Dupont',
    numero: 9,
    poste: 'Attaquant',
    photoRawUrl: '/players/001.jpg',
    photoCutoutUrl: '/players/001.jpg',
    cutoutStatus: 'ready',
  },
  {
    id: 'p2',
    prenom: 'Lucas',
    nom: 'Martin',
    numero: 10,
    poste: 'Milieu',
    photoRawUrl: '/players/002.jpg',
    photoCutoutUrl: '/players/002.jpg',
    cutoutStatus: 'ready',
  },
  {
    id: 'p3',
    prenom: 'Théo',
    nom: 'Bernard',
    numero: 4,
    poste: 'Défenseur',
    photoRawUrl: '/players/003.jpg',
    photoCutoutUrl: '/players/003.jpg',
    cutoutStatus: 'ready',
  },
  {
    id: 'p4',
    prenom: 'Hugo',
    nom: 'Petit',
    numero: 7,
    poste: 'Ailier',
    photoRawUrl: '/players/004.jpg',
    photoCutoutUrl: null,
    cutoutStatus: 'processing',
  },
];
