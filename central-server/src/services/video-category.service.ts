import { videoCategoryRepository, VideoCategoryRow, CreateVideoCategoryInput, UpdateVideoCategoryInput } from '../repositories/video-category.repository';
import logger from '../config/logger';

class VideoCategoryService {
  async listForSite(siteId: string): Promise<VideoCategoryRow[]> {
    return videoCategoryRepository.findBySiteId(siteId);
  }

  async create(siteId: string, input: Omit<CreateVideoCategoryInput, 'site_id'>): Promise<VideoCategoryRow> {
    const category = await videoCategoryRepository.create({ ...input, site_id: siteId });
    logger.info('video_category.created', { siteId, categoryId: category.id, name: category.name });
    return category;
  }

  async update(id: string, siteId: string, input: UpdateVideoCategoryInput): Promise<VideoCategoryRow | null> {
    const category = await videoCategoryRepository.update(id, siteId, input);
    if (category) {
      logger.info('video_category.updated', { siteId, categoryId: id });
    }
    return category;
  }

  async delete(id: string, siteId: string): Promise<boolean> {
    const deleted = await videoCategoryRepository.deleteByIdAndSite(id, siteId);
    if (deleted) {
      logger.info('video_category.deleted', { siteId, categoryId: id });
    }
    return deleted;
  }
}

export const videoCategoryService = new VideoCategoryService();
