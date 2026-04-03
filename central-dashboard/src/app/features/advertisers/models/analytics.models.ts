export interface AnalyticsSummary {
  total_impressions: number;
  total_screen_time: number;
  avg_watch_duration: number;
  completion_rate: number;
  unique_sites: number;
  unique_videos: number;
}

export interface VideoPerformance {
  video_id: string;
  video_title: string;
  impressions: number;
  total_screen_time: number;
  completion_rate: number;
  avg_watch_duration: number;
}

export interface SitePerformance {
  site_id: string;
  site_name: string;
  impressions: number;
  total_screen_time: number;
  unique_videos: number;
}

export interface DailyTrend {
  date: string;
  impressions: number;
  screen_time: number;
  completed_views: number;
}

export interface Distribution {
  label: string;
  value: number;
  percentage: number;
}

export interface KpisResponse {
  kpis: {
    total_impressions: number;
    verified_impressions: number;
    tv_on_rate: number;
    match_day_impressions: number;
    completion_rate: number;
    sites_coverage: number;
    total_screen_time_seconds: number;
    rotation_fairness: number;
    renewal_score: number;
  };
  peak_hours: {
    hourly_heatmap: number[];
  };
  rotation: Array<{
    video_filename: string;
    play_count: number;
  }>;
}
