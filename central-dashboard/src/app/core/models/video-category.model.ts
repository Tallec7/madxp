export type VideoCategoryType = 'action' | 'loop' | 'match';

export interface VideoCategory {
  id: string;
  siteId: string;
  name: string;
  type: VideoCategoryType;
  icon: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVideoCategoryDto {
  name: string;
  type: VideoCategoryType;
  icon?: string | null;
  sort_order?: number;
}

export interface UpdateVideoCategoryDto {
  name?: string;
  type?: VideoCategoryType;
  icon?: string | null;
  sort_order?: number;
}

/** Maps a raw snake_case API row to a VideoCategory view model */
export function mapVideoCategory(raw: Record<string, unknown>): VideoCategory {
  return {
    id: raw['id'] as string,
    siteId: raw['site_id'] as string,
    name: raw['name'] as string,
    type: raw['type'] as VideoCategoryType,
    icon: (raw['icon'] as string | null) ?? null,
    sortOrder: raw['sort_order'] as number,
    createdAt: raw['created_at'] as string,
    updatedAt: raw['updated_at'] as string,
  };
}
