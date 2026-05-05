/**
 * Template Studio v3 — Preview fixtures (PREV-02).
 *
 * Auto-filled values displayed in the live Player when the admin's form
 * fields are empty. Non-modifiable in v3.0 (anti-feature "personnaliser
 * les fixtures" deferred — see 02-CONTEXT.md).
 *
 * Imported by RemotionPreviewService.buildRuntimePlayerState() AND
 * WizardPreviewPanelComponent for the "no layer yet" placeholder.
 */

export const PREVIEW_FIXTURES = {
  playerFirstName: 'PRÉNOM',
  playerLastName: 'NOM',
  playerFullName: 'PRÉNOM NOM',
  clubName: 'NOM DU CLUB',
  logoUrl: '/assets/preview/neopro-placeholder-logo.png',
  photoUrl: '/assets/preview/neopro-placeholder-photo.png',
} as const;

export type PreviewFixtures = typeof PREVIEW_FIXTURES;
