/**
 * FreeConvert API v1 type definitions.
 * Docs: https://www.freeconvert.com/api/v1/
 */

export type FCTaskStatus =
  | 'created'
  | 'waiting'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'deleted';

export type FCJobStatus = FCTaskStatus;

export interface FCUploadForm {
  url: string;
  parameters: Record<string, string>;
}

export interface FCTaskResult {
  /** present on export/url tasks */
  url?: string;
  filename?: string;
  size?: number;
  /** present on import/upload tasks */
  form?: FCUploadForm;
  /** failure info */
  errorCode?: string;
  msg?: string;
  /** free-form extras returned by the engine (duration, width, height...) */
  [key: string]: unknown;
}

export interface FCTask {
  id: string;
  name?: string;
  operation: string;
  status: FCTaskStatus;
  result?: FCTaskResult;
  percent?: number;
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

export interface FCJob {
  id: string;
  tag?: string;
  status: FCJobStatus;
  tasks: FCTask[];
  result?: { errorCode?: string; msg?: string };
  createdAt?: string;
  updatedAt?: string;
  [key: string]: unknown;
}

/** A task definition inside a job payload. */
export type FCTaskDefinition = Record<string, unknown> & { operation: string };

export interface FCJobDefinition {
  tag?: string;
  tasks: Record<string, FCTaskDefinition>;
}

/* ------------------------------------------------------------------ */
/* Video compression advanced options                                  */
/* Source: GET /v1/query/options/compress?input_format=mp4             */
/* ------------------------------------------------------------------ */

export type FCCompressMethod =
  | 'by_percentage'
  | 'by_size'
  | 'by_video_quality'
  | 'by_resolution'
  | 'by_max_bitrate';

export type FCVideoCodec =
  | 'libx264'
  | 'libx265'
  | 'h264_nvenc'
  | 'hevc_nvenc'
  | 'av1_nvenc';

export type FCEncodeSpeed =
  | 'ultrafast'
  | 'superfast'
  | 'veryfast'
  | 'faster'
  | 'fast'
  | 'medium'
  | 'slow'
  | 'slower'
  | 'veryslow';

export type FCResolutionPreset =
  | '7680:4320'
  | '3840:2160'
  | '2560:1440'
  | '1920:1080'
  | '1366:768'
  | '1280:720'
  | '1152:648'
  | '1024:576'
  | '720:480'
  | '480:360'
  | '352:240'
  | '256:144';

export interface FCVideoCompressOptions {
  compress_video?: FCCompressMethod;
  video_codec_compress?: FCVideoCodec;
  /** by_percentage: target size as % of the original (0 - 10000), default 60 */
  video_compress_quality_percentage?: number;
  /** by_size: target size in MB (max 10240) */
  video_compress_max_filesize?: number;
  /** by_video_quality: CRF for libx264 (18 - 51) */
  video_compress_crf_x264?: number;
  /** by_video_quality: CRF for libx265 (18 - 51) */
  video_compress_crf_x265?: number;
  /** by_max_bitrate: kbps (0 - 512000) */
  video_compress_max_bitrate?: number;
  video_compressor_bufsize?: number;
  /** by_resolution */
  video_compression_resize_method?:
    | 'preset_resolutions'
    | 'by_width_keep_ar'
    | 'by_height_keep_ar'
    | 'by_width_height';
  video_compression_resolution_preset?: FCResolutionPreset;
  video_custom_width_compress?: number;
  video_custom_height_compress?: number;
  video_compress_speed?: FCEncodeSpeed;
  isCompatibleWithOldDevices_compress?: boolean;
  [key: string]: unknown;
}
