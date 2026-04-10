import { Injectable } from '@angular/core';

export interface OverlayConfig {
  templateId: string;
  variables: Record<string, string>;
}

export interface RenderProgress {
  phase: 'loading' | 'rendering' | 'encoding' | 'done';
  progress: number; // 0-100
}

export interface TextElement {
  kind: 'text';
  text: string;
  x: number;
  y: number;
  fontSize: number;
  fontWeight: string;
  fontFamily?: string;
  letterSpacing?: number;
  color: string;
  align: CanvasTextAlign;
  fadeIn: [number, number];
  fadeOut: [number, number];
  slideFromY?: number;
  scaleAnim?: [number, number];
  scaleWindow?: [number, number];
  shadow?: { blur: number; color: string };
}

export interface ImageElement {
  kind: 'image';
  src: string; // data URI or URL
  x: number;
  y: number;
  width: number;
  height: number;
  fadeIn: [number, number];
  fadeOut: [number, number];
  borderRadius?: number;
  border?: { width: number; color: string };
  objectFit?: 'contain' | 'cover';
  shadow?: { blur: number; color: string };
}

export type OverlayElement = TextElement | ImageElement;

function buildPlayerElements(vars: Record<string, string>, duration: number): OverlayElement[] {
  const nom = (vars['nom'] || 'NOM').toUpperCase();
  const prenom = (vars['prenom'] || 'PRENOM').toUpperCase();
  const club = (vars['club'] || 'NOM DU CLUB').toUpperCase();
  const numero = vars['numero'] || '';
  const photoDataUri = vars['_image_photo'] || '';
  const logoDataUri = vars['_image_logo'] || '';
  const REVEAL = 1.22;
  const NAME_IN = 2.10;
  const fadeOutStart = Math.max(duration - 0.6, NAME_IN + 0.6);

  const displayFont = "'Bebas Neue', 'Anton', 'Oswald', 'Barlow Condensed', 'Impact', sans-serif";
  const surtitleFont = "'Barlow Condensed', 'Oswald', 'Inter', sans-serif";

  const elements: OverlayElement[] = [];

  if (photoDataUri) {
    elements.push({
      kind: 'image',
      src: photoDataUri,
      x: 80, y: 780,
      width: 200, height: 200,
      fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
      borderRadius: 100,
      border: { width: 3, color: 'rgba(255,255,255,0.3)' },
      objectFit: 'cover',
    });
  }

  if (logoDataUri) {
    elements.push({
      kind: 'image',
      src: logoDataUri,
      x: 1760, y: 60,
      width: 100, height: 100,
      fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
      objectFit: 'contain',
      shadow: { blur: 12, color: 'rgba(0,0,0,0.4)' },
    });
  }

  if (numero) {
    elements.push({
      kind: 'text',
      text: numero,
      x: 960, y: 540,
      fontSize: 520, fontWeight: '900',
      fontFamily: displayFont,
      color: '#FFFFFF', align: 'center',
      fadeIn: [0, 0.001],
      fadeOut: [REVEAL, REVEAL + 0.15],
      scaleAnim: [0.15, 1.5],
      scaleWindow: [0, REVEAL],
    });
  }

  elements.push({
    kind: 'text',
    text: club,
    x: 960, y: 145,
    fontSize: 30, fontWeight: '500',
    fontFamily: surtitleFont,
    letterSpacing: 14,
    color: '#FFFFFF', align: 'center',
    fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
  });

  elements.push({
    kind: 'text',
    text: prenom,
    x: 960, y: 460,
    fontSize: 280, fontWeight: '900',
    fontFamily: displayFont,
    color: '#FFFFFF', align: 'center',
    fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
  });

  elements.push({
    kind: 'text',
    text: nom,
    x: 960, y: 700,
    fontSize: 280, fontWeight: '900',
    fontFamily: displayFont,
    color: '#FFFFFF', align: 'center',
    fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
  });

  elements.push({
    kind: 'text',
    text: club,
    x: 960, y: 945,
    fontSize: 30, fontWeight: '500',
    fontFamily: surtitleFont,
    letterSpacing: 14,
    color: '#FFFFFF', align: 'center',
    fadeIn: [NAME_IN, NAME_IN + 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.4],
  });

  return elements;
}

function buildScorePlusElements(vars: Record<string, string>, duration: number): OverlayElement[] {
  const score = vars['score'] || '+1';
  const nom = vars['nom'] || '';
  const club = vars['club'] || '';
  const color = vars['color'] || '#FF3333';
  const logoDataUri = vars['_image_logo'] || '';
  const fadeOutStart = Math.max(duration - 0.8, 1.5);

  const elements: OverlayElement[] = [];

  if (logoDataUri) {
    elements.push({
      kind: 'image',
      src: logoDataUri,
      x: club ? 780 : 908,
      y: 248,
      width: 56, height: 56,
      fadeIn: [0.15, 0.65], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
      objectFit: 'contain',
      shadow: { blur: 8, color: 'rgba(0,0,0,0.4)' },
    });
  }

  if (club) {
    elements.push({
      kind: 'text',
      text: club.toUpperCase(),
      x: logoDataUri ? 1000 : 960, y: 280,
      fontSize: 48, fontWeight: '700', color: '#FFD700', align: 'center',
      fadeIn: [0.15, 0.65], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
      slideFromY: 30,
    });
  }

  elements.push({
    kind: 'text',
    text: score,
    x: 960, y: 500,
    fontSize: 320, fontWeight: '900', color, align: 'center',
    fadeIn: [0, 0.4], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
    scaleAnim: [1.6, 1],
    shadow: { blur: 80, color: color + '66' },
  });

  if (nom) {
    elements.push({
      kind: 'text',
      text: nom.toUpperCase(),
      x: 960, y: 650,
      fontSize: 80, fontWeight: '700', color: '#FFFFFF', align: 'center',
      fadeIn: [0.3, 0.8], fadeOut: [fadeOutStart, fadeOutStart + 0.5],
      slideFromY: 30,
    });
  }

  return elements;
}

function buildButeurElements(vars: Record<string, string>, duration: number): OverlayElement[] {
  const nom = vars['nom'] || '';
  const numero = vars['numero'] || '';
  const club = vars['club'] || '';
  const logoDataUri = vars['_image_logo'] || '';
  const fadeOutStart = Math.max(duration - 1, 2);

  const elements: OverlayElement[] = [];

  if (logoDataUri) {
    elements.push({
      kind: 'image',
      src: logoDataUri,
      x: club ? 760 : 908,
      y: 165,
      width: 64, height: 64,
      fadeIn: [0.1, 0.6], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      objectFit: 'contain',
      shadow: { blur: 8, color: 'rgba(0,0,0,0.4)' },
    });
  }

  if (club) {
    elements.push({
      kind: 'text',
      text: club.toUpperCase(),
      x: logoDataUri ? 1000 : 960, y: 200,
      fontSize: 50, fontWeight: '700', color: '#FFD700', align: 'center',
      fadeIn: [0.1, 0.6], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      slideFromY: 30,
    });
  }

  elements.push({
    kind: 'text',
    text: 'BUUUUT !',
    x: 960, y: 380,
    fontSize: 140, fontWeight: '900', color: '#FF3344', align: 'center',
    fadeIn: [0, 0.5], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
    scaleAnim: [1.8, 1],
    shadow: { blur: 60, color: 'rgba(255,50,70,0.5)' },
  });

  if (numero) {
    elements.push({
      kind: 'text',
      text: `#${numero}`,
      x: 960, y: 560,
      fontSize: 220, fontWeight: '900', color: '#FFFFFF', align: 'center',
      fadeIn: [0.4, 0.9], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      scaleAnim: [1.5, 1],
    });
  }

  if (nom) {
    elements.push({
      kind: 'text',
      text: nom.toUpperCase(),
      x: 960, y: 700,
      fontSize: 90, fontWeight: '700', color: '#FFFFFF', align: 'center',
      fadeIn: [0.7, 1.2], fadeOut: [fadeOutStart, fadeOutStart + 0.6],
      slideFromY: 30,
    });
  }

  return elements;
}

const TEMPLATE_BUILDERS: Record<string, (vars: Record<string, string>, duration: number) => OverlayElement[]> = {
  tpl_player: buildPlayerElements,
  tpl_score_plus: buildScorePlusElements,
  tpl_buteur: buildButeurElements,
};

@Injectable({ providedIn: 'root' })
export class TemplateRendererService {

  buildElements(templateId: string, variables: Record<string, string>, duration: number): OverlayElement[] {
    const builder = TEMPLATE_BUILDERS[templateId];
    if (!builder) {
      throw new Error(`Unknown template: ${templateId}`);
    }
    return builder(variables, duration);
  }

  hasTemplate(templateId: string): boolean {
    return templateId in TEMPLATE_BUILDERS;
  }
}
