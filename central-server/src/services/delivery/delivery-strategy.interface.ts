/**
 * ADR-069 — Delivery Strategy pattern
 *
 * Interface commune pour toutes les stratégies de livraison vidéo
 * (Pi socket, SaaS direct, futurs canaux : Chromecast, Android TV, ...).
 *
 * `deployment.service.ts` orchestre et délègue à la stratégie qui `canHandle(site)`.
 */

export interface DeliverySite {
  siteId: string;
  siteName: string;
  siteType: string;
}

export interface DeliveryDeployment {
  id: string;
  video_id: string;
  filename: string;
  original_name: string;
  category: string | null;
  subcategory: string | null;
  duration: number | null;
  storage_path: string;
  checksum: string | null;
  metadata: { title?: string; analytics_category?: string } | null;
  advertiser_id: string | null;
  analytics_category: string | null;
}

export interface DeliveryContext {
  deploymentId: string;
  site: DeliverySite;
  deployment: DeliveryDeployment;
  videoUrl: string;
}

export type DeliveryOutcome = 'sent' | 'queued' | 'completed' | 'failed';

export interface DeliveryResult {
  success: boolean;
  outcome: DeliveryOutcome;
  message?: string;
}

export interface DeliveryStrategy {
  readonly name: string;
  canHandle(site: DeliverySite): boolean;
  deliver(context: DeliveryContext): Promise<DeliveryResult>;
}
