import { z } from 'zod';
import type {
  FCJobDefinition,
  FCVideoCodec,
  FCVideoCompressOptions,
} from './types';

/* ------------------------------------------------------------------ */
/* Public request schema (validated on the API route)                  */
/* ------------------------------------------------------------------ */

export const CODECS = ['libx264', 'libx265'] as const;

export const RESOLUTION_PRESETS = [
  '3840:2160',
  '2560:1440',
  '1920:1080',
  '1280:720',
  '1024:576',
  '854:480',
  '640:360',
] as const;

/** Values FreeConvert actually accepts for the resolution preset option. */
const FC_RESOLUTION_PRESETS: Record<string, string> = {
  '3840:2160': '3840:2160',
  '2560:1440': '2560:1440',
  '1920:1080': '1920:1080',
  '1280:720': '1280:720',
  '1024:576': '1024:576',
  '854:480': '720:480',
  '640:360': '480:360',
};

export const QUICK_PRESETS = {
  light: { percentage: 70, label: 'Light' },
  balanced: { percentage: 50, label: 'Balanced' },
  strong: { percentage: 30, label: 'Strong' },
  extreme: { percentage: 15, label: 'Extreme' },
} as const;

export type QuickPresetKey = keyof typeof QUICK_PRESETS;

export const compressSettingsSchema = z
  .object({
    /** how the target is expressed */
    mode: z
      .enum(['preset', 'target_size', 'quality', 'resolution', 'bitrate'])
      .default('preset'),

    preset: z
      .enum(['light', 'balanced', 'strong', 'extreme'])
      .default('balanced'),

    /** mode=target_size, MB */
    targetSizeMb: z.number().positive().max(10240).optional(),

    /** mode=quality, CRF 18..51 (lower = better) */
    crf: z.number().int().min(18).max(51).optional(),

    /** mode=resolution */
    resolution: z.enum(RESOLUTION_PRESETS).optional(),

    /** mode=bitrate, kbps */
    bitrateKbps: z.number().int().min(100).max(512000).optional(),

    codec: z.enum(CODECS).default('libx264'),

    /** trade encode time for compression */
    speed: z
      .enum(['veryfast', 'faster', 'fast', 'medium', 'slow'])
      .default('medium'),

    outputFormat: z.enum(['mp4', 'mkv', 'webm', 'mov']).default('mp4'),

    /** baseline profile + yuv420p for ancient players */
    oldDeviceCompatible: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    const need = (
      field: keyof typeof val,
      mode: string
    ): void => {
      if (val.mode === mode && val[field] === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [field as string],
          message: `${String(field)} is required when mode is "${mode}"`,
        });
      }
    };
    need('targetSizeMb', 'target_size');
    need('crf', 'quality');
    need('resolution', 'resolution');
    need('bitrateKbps', 'bitrate');
  });

export type CompressSettings = z.infer<typeof compressSettingsSchema>;

export const DEFAULT_SETTINGS: CompressSettings = {
  mode: 'preset',
  preset: 'balanced',
  codec: 'libx264',
  speed: 'medium',
  outputFormat: 'mp4',
  oldDeviceCompatible: false,
};

/* ------------------------------------------------------------------ */
/* Settings -> FreeConvert advanced options                            */
/* ------------------------------------------------------------------ */

export function buildCompressOptions(
  settings: CompressSettings
): FCVideoCompressOptions {
  const codec = settings.codec as FCVideoCodec;

  const options: FCVideoCompressOptions = {
    video_codec_compress: codec,
    video_compress_speed: settings.speed,
  };

  if (settings.oldDeviceCompatible) {
    options.isCompatibleWithOldDevices_compress = true;
  }

  switch (settings.mode) {
    case 'preset': {
      options.compress_video = 'by_percentage';
      options.video_compress_quality_percentage =
        QUICK_PRESETS[settings.preset].percentage;
      break;
    }

    case 'target_size': {
      options.compress_video = 'by_size';
      options.video_compress_max_filesize = settings.targetSizeMb!;
      break;
    }

    case 'quality': {
      options.compress_video = 'by_video_quality';
      if (codec === 'libx265') {
        options.video_compress_crf_x265 = Math.min(settings.crf!, 50);
      } else {
        options.video_compress_crf_x264 = settings.crf!;
      }
      break;
    }

    case 'resolution': {
      options.compress_video = 'by_resolution';
      options.video_compression_resize_method = 'preset_resolutions';
      options.video_compression_resolution_preset = FC_RESOLUTION_PRESETS[
        settings.resolution!
      ] as FCVideoCompressOptions['video_compression_resolution_preset'];
      break;
    }

    case 'bitrate': {
      options.compress_video = 'by_max_bitrate';
      options.video_compress_max_bitrate = settings.bitrateKbps!;
      options.video_compressor_bufsize = Math.min(
        Math.max(settings.bitrateKbps! * 2, 1000),
        10000
      );
      if (codec === 'libx265') {
        options.video_compress_crf_x265 = 28;
      } else {
        options.video_compress_crf_x264 = 28;
      }
      break;
    }
  }

  return options;
}

/* ------------------------------------------------------------------ */
/* Job definition builder                                              */
/* ------------------------------------------------------------------ */

export const TASK_IMPORT = 'vs_import';
export const TASK_COMPRESS = 'vs_compress';
export const TASK_EXPORT = 'vs_export';

export interface BuildJobInput {
  inputFormat: string;
  outputFilename: string;
  settings: CompressSettings;
  tag?: string;
  /** when provided the job imports from a URL instead of a browser upload */
  importUrl?: string;
  /**
   * When provided, the provider writes the result straight into our own
   * S3-compatible bucket instead of serving it from the box that ran the job.
   * See lib/compress/staging.ts for why that matters.
   */
  output?: {
    bucket: string;
    region: string;
    endpoint: string;
    accessKeyId: string;
    secretAccessKey: string;
    key: string;
  };
}

export function buildCompressJob(input: BuildJobInput): FCJobDefinition {
  const importTask: Record<string, unknown> = input.importUrl
    ? {
        operation: 'import/url',
        url: input.importUrl,
        filename: input.outputFilename,
      }
    : { operation: 'import/upload' };

  return {
    tag: input.tag ?? 'vidsmaller',
    tasks: {
      [TASK_IMPORT]: importTask as FCJobDefinition['tasks'][string],
      [TASK_COMPRESS]: {
        operation: 'compress',
        input: TASK_IMPORT,
        input_format: input.inputFormat,
        output_format: input.settings.outputFormat,
        options: buildCompressOptions(input.settings),
      },
      [TASK_EXPORT]: input.output
        ? ({
            operation: 'export/s3',
            input: TASK_COMPRESS,
            bucket: input.output.bucket,
            region: input.output.region,
            endpoint: input.output.endpoint,
            access_key_id: input.output.accessKeyId,
            secret_access_key: input.output.secretAccessKey,
            key: input.output.key,
            // Required by the provider, and only accepts the bare token — a
            // full header string is rejected. The real filename is attached
            // when we sign the download URL.
            content_disposition: 'attachment',
          } as FCJobDefinition['tasks'][string])
        : {
            operation: 'export/url',
            input: TASK_COMPRESS,
            filename: input.outputFilename,
          },
    },
  };
}

/* ------------------------------------------------------------------ */
/* Filename helpers                                                    */
/* ------------------------------------------------------------------ */

export function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  if (idx === -1 || idx === filename.length - 1) return '';
  return filename.slice(idx + 1).toLowerCase();
}

export function buildOutputFilename(
  original: string,
  outputFormat: string
): string {
  const base = original.replace(/\.[^./\\]+$/, '') || 'video';
  const safe = base
    .replace(/[\\/:*?"<>|]+/g, '_')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 100);
  return `${safe || 'video'}-compressed.${outputFormat}`;
}
