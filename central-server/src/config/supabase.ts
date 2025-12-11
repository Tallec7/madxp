import { createClient } from '@supabase/supabase-js';
import logger from './logger';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  logger.warn('SUPABASE_URL or SUPABASE_SERVICE_KEY not set - file storage will not work');
}

export const supabase = supabaseUrl && supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

export const STORAGE_BUCKET = 'videos';
export const UPDATE_BUCKET = 'software-updates';

export const getPublicUrl = (path: string, bucket: string = STORAGE_BUCKET): string => {
  if (!supabase || !supabaseUrl) {
    return '';
  }
  // Nettoyer le path : supprimer le slash initial s'il existe
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${supabaseUrl}/storage/v1/object/public/${bucket}/${cleanPath}`;
};

export const uploadFile = async (
  file: Buffer,
  filename: string,
  contentType: string,
  bucket: string = STORAGE_BUCKET
): Promise<{ path: string; url: string } | null> => {
  if (!supabase) {
    logger.error('Supabase client not initialized');
    return null;
  }

  const filePath = `uploads/${filename}`;

  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(filePath, file, {
      contentType,
      upsert: false,
    });

  if (error) {
    logger.error('Error uploading file to Supabase:', error);
    return null;
  }

  const url = getPublicUrl(data.path, bucket);
  logger.info('File uploaded to Supabase:', { path: data.path, url });

  return { path: data.path, url };
};

export const deleteFile = async (path: string, bucket: string = STORAGE_BUCKET): Promise<boolean> => {
  if (!supabase) {
    logger.error('Supabase client not initialized');
    return false;
  }

  const { error } = await supabase.storage
    .from(bucket)
    .remove([path]);

  if (error) {
    logger.error('Error deleting file from Supabase:', error);
    return false;
  }

  logger.info('File deleted from Supabase:', { path });
  return true;
};
