export interface AvailableVideo {
  id: string;
  title: string;
  filename: string;
  duration: number;
  file_size?: number;
}

export interface AssignedSite {
  site_id: string;
  site_name: string;
  club_name?: string;
  city?: string;
  is_active: boolean;
  contract_start?: string;
  contract_end?: string;
  assigned_at: string;
}

export interface AvailableSite {
  id: string;
  name: string;
  club_name?: string;
  city?: string;
}

export interface Sponsor {
  id: string;
  name: string;
  logo_url?: string;
  contact_email?: string;
  contact_phone?: string;
  website?: string;
  status: 'active' | 'inactive' | 'paused';
  contract_start?: string;
  contract_end?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface SponsorVideo {
  video_id: string;
  // Champs bruts de l'API (advertiser.repository.getVideos)
  filename: string;
  original_name: string | null;
  duration: number | null;
  is_primary: boolean;
  added_at: string;
  thumbnail_url: string | null;
  file_size: number | null;
  // Champs legacy (compatibilité)
  video_title?: string;
  video_duration?: number;
  associated_at?: string;
}

export interface Campaign {
  id: string;
  name: string;
  campaign_type?: string;
  target_impressions?: number;
  budget_cents?: number;
  target_cpm_cents?: number;
  status: string;
  start_date?: string;
  end_date?: string;
  videos_count?: number;
  sites_count?: number;
  total_impressions?: number;
  progress_percent?: number;
  created_at: string;
  updated_at: string;
}

export interface CampaignSite {
  site_id: string;
  site_name: string;
  club_name: string;
  deployment_status: string;
  deployed_at?: string;
}

export interface CampaignVideo {
  id: string;
  video_id: string;
  filename: string;
  original_name: string | null;
  duration: number | null;
  weight: number;
}

export interface ResolvedSite {
  id: string;
  site_name: string;
  club_name: string;
  status: string;
}

export interface GroupOption {
  id: string;
  name: string;
}
