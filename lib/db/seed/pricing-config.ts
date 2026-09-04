/**
 * Pricing Configuration File — VidSmaller
 * 定价配置文件
 *
 * Single source of truth for pricing plans.
 * Edit here, then run `pnpm db:seed` to sync to the database.
 * Run `pnpm db:export-pricing` to export the current DB state back into this file.
 *
 * IMPORTANT before going live:
 *   1. Create the products/prices in Stripe (and/or Creem).
 *   2. Paste the resulting price/product ids below.
 *   3. Duplicate each plan with environment: 'live'.
 *   4. Map the plan ids to compressor tiers via PLAN_TIER_MAP in .env
 *      e.g. PLAN_TIER_MAP=<pro-monthly-id>:pro,<max-monthly-id>:max
 */

import type { InferInsertModel } from 'drizzle-orm'
import {
  pricingPlanGroups as pricingPlanGroupsTable,
  pricingPlans as pricingPlansTable,
} from '../schema'

// ============================================================================
// Type Definitions - Derived from Schema
// ============================================================================

export type PricingPlanConfig = Omit<
  InferInsertModel<typeof pricingPlansTable>,
  'createdAt' | 'updatedAt'
>

export type PricingGroupConfig = Omit<
  InferInsertModel<typeof pricingPlanGroupsTable>,
  'createdAt'
>

export interface PricingFeature {
  description: string
  included: boolean
  bold?: boolean
  href?: string
}

export interface LocalizedPricingContent {
  cardTitle?: string
  cardDescription?: string
  displayPrice?: string
  originalPrice?: string
  priceSuffix?: string
  highlightText?: string
  buttonText?: string
  currency?: string
  features?: PricingFeature[]
}

export interface PricingBenefits {
  /** One-time credits granted on purchase */
  oneTimeCredits?: number
  /** Monthly credits for subscriptions */
  monthlyCredits?: number
  /** Total months for yearly plans */
  totalMonths?: number
  [key: string]: unknown
}

// ============================================================================
// Pricing Groups
// ============================================================================

export const pricingGroups: PricingGroupConfig[] = [
  { slug: 'default' },
  { slug: 'monthly' },
  { slug: 'annual' },
  { slug: 'onetime' },
  { slug: 'no-payment' },
]

// ============================================================================
// Helpers
// ============================================================================

const f = (description: string, bold = false): PricingFeature => ({
  description,
  included: true,
  bold,
  href: '',
})

const fx = (description: string): PricingFeature => ({
  description,
  included: false,
  bold: false,
  href: '',
})

// ============================================================================
// Pricing Plans
// ============================================================================

export const pricingPlans: PricingPlanConfig[] = [
  /* ------------------------------- FREE ------------------------------- */
  {
    id: '5b9f6cf0-4a3e-4a3f-9c9f-0f2a1d7b0001',
    environment: 'test',
    groupSlug: 'monthly',
    cardTitle: 'Free',
    cardDescription: 'Enough for the occasional oversized clip.',
    provider: 'none',
    paymentType: null,
    recurringInterval: null,
    price: '0',
    currency: 'USD',
    displayPrice: '$0',
    priceSuffix: 'forever',
    features: [
      f('30 credits / month', true),
      f('Up to 1 GB per file'),
      f('3 files in the queue'),
      f('No watermark, ever'),
      f('H.264 encoding'),
      fx('H.265 / HEVC'),
      fx('Priority queue'),
    ],
    isHighlighted: false,
    buttonText: 'Start for free',
    buttonLink: '/login',
    displayOrder: 1,
    isActive: true,
    langJsonb: {
      en: {
        cardTitle: 'Free',
        cardDescription: 'Enough for the occasional oversized clip.',
        displayPrice: '$0',
        priceSuffix: 'forever',
        buttonText: 'Start for free',
        features: [
          f('30 credits / month', true),
          f('Up to 1 GB per file'),
          f('3 files in the queue'),
          f('No watermark, ever'),
          f('H.264 encoding'),
          fx('H.265 / HEVC'),
          fx('Priority queue'),
        ],
      },
      zh: {
        cardTitle: '免费版',
        cardDescription: '偶尔压个超大文件够用了。',
        displayPrice: '$0',
        priceSuffix: '永久免费',
        buttonText: '免费开始',
        features: [
          f('每月 30 积分', true),
          f('单文件最大 1 GB'),
          f('队列最多 3 个文件'),
          f('永不加水印'),
          f('H.264 编码'),
          fx('H.265 / HEVC'),
          fx('优先队列'),
        ],
      },
      ja: {
        cardTitle: '無料',
        cardDescription: 'たまに大きい動画を扱う方に。',
        displayPrice: '$0',
        priceSuffix: 'ずっと無料',
        buttonText: '無料で始める',
        features: [
          f('毎月 30 クレジット', true),
          f('1 ファイル 1 GB まで'),
          f('キューは 3 ファイルまで'),
          f('ウォーターマークなし'),
          f('H.264 エンコード'),
          fx('H.265 / HEVC'),
          fx('優先キュー'),
        ],
      },
    },
    benefitsJsonb: { monthlyCredits: 30 } as PricingBenefits,
  },

  /* ---------------------------- PRO MONTHLY ---------------------------- */
  {
    id: '5b9f6cf0-4a3e-4a3f-9c9f-0f2a1d7b0002',
    environment: 'test',
    groupSlug: 'monthly',
    cardTitle: 'Pro',
    cardDescription: 'For creators who compress every week.',
    provider: 'stripe',
    stripePriceId: 'REPLACE_WITH_STRIPE_PRICE_ID_PRO_MONTHLY',
    stripeProductId: 'REPLACE_WITH_STRIPE_PRODUCT_ID_PRO',
    paymentType: 'recurring',
    recurringInterval: 'month',
    price: '9',
    currency: 'USD',
    displayPrice: '$9',
    priceSuffix: '/ month',
    features: [
      f('600 credits / month', true),
      f('Up to 5 GB per file'),
      f('10 files in the queue'),
      f('H.265 / HEVC — ~30% smaller'),
      f('Priority queue'),
      f('7-day download history'),
      f('Email support'),
    ],
    isHighlighted: true,
    highlightText: 'Most popular',
    buttonText: 'Go Pro',
    buttonLink: '',
    displayOrder: 2,
    isActive: true,
    langJsonb: {
      en: {
        cardTitle: 'Pro',
        cardDescription: 'For creators who compress every week.',
        displayPrice: '$9',
        priceSuffix: '/ month',
        highlightText: 'Most popular',
        buttonText: 'Go Pro',
        features: [
          f('600 credits / month', true),
          f('Up to 5 GB per file'),
          f('10 files in the queue'),
          f('H.265 / HEVC — ~30% smaller'),
          f('Priority queue'),
          f('7-day download history'),
          f('Email support'),
        ],
      },
      zh: {
        cardTitle: '专业版',
        cardDescription: '给每周都要压视频的创作者。',
        displayPrice: '$9',
        priceSuffix: '/ 月',
        highlightText: '最受欢迎',
        buttonText: '升级 Pro',
        features: [
          f('每月 600 积分', true),
          f('单文件最大 5 GB'),
          f('队列最多 10 个文件'),
          f('H.265 / HEVC，再小约 30%'),
          f('优先队列'),
          f('7 天下载记录'),
          f('邮件支持'),
        ],
      },
      ja: {
        cardTitle: 'Pro',
        cardDescription: '毎週圧縮するクリエイターに。',
        displayPrice: '$9',
        priceSuffix: '/ 月',
        highlightText: '一番人気',
        buttonText: 'Pro にする',
        features: [
          f('毎月 600 クレジット', true),
          f('1 ファイル 5 GB まで'),
          f('キューは 10 ファイルまで'),
          f('H.265 / HEVC で約 30% 小さく'),
          f('優先キュー'),
          f('7 日間のダウンロード履歴'),
          f('メールサポート'),
        ],
      },
    },
    benefitsJsonb: { monthlyCredits: 600 } as PricingBenefits,
  },

  /* ---------------------------- MAX MONTHLY ---------------------------- */
  {
    id: '5b9f6cf0-4a3e-4a3f-9c9f-0f2a1d7b0003',
    environment: 'test',
    groupSlug: 'monthly',
    cardTitle: 'Max',
    cardDescription: 'Big files, long footage, whole libraries.',
    provider: 'stripe',
    stripePriceId: 'REPLACE_WITH_STRIPE_PRICE_ID_MAX_MONTHLY',
    stripeProductId: 'REPLACE_WITH_STRIPE_PRODUCT_ID_MAX',
    paymentType: 'recurring',
    recurringInterval: 'month',
    price: '29',
    currency: 'USD',
    displayPrice: '$29',
    priceSuffix: '/ month',
    features: [
      f('2,000 credits / month', true),
      f('Up to 10 GB per file'),
      f('25 files in the queue'),
      f('H.265 / HEVC'),
      f('Highest queue priority'),
      f('30-day download history'),
      f('Priority support'),
    ],
    isHighlighted: false,
    buttonText: 'Go Max',
    buttonLink: '',
    displayOrder: 3,
    isActive: true,
    langJsonb: {
      en: {
        cardTitle: 'Max',
        cardDescription: 'Big files, long footage, whole libraries.',
        displayPrice: '$29',
        priceSuffix: '/ month',
        buttonText: 'Go Max',
        features: [
          f('2,000 credits / month', true),
          f('Up to 10 GB per file'),
          f('25 files in the queue'),
          f('H.265 / HEVC'),
          f('Highest queue priority'),
          f('30-day download history'),
          f('Priority support'),
        ],
      },
      zh: {
        cardTitle: '旗舰版',
        cardDescription: '大文件、长素材、整个素材库。',
        displayPrice: '$29',
        priceSuffix: '/ 月',
        buttonText: '升级 Max',
        features: [
          f('每月 2,000 积分', true),
          f('单文件最大 10 GB'),
          f('队列最多 25 个文件'),
          f('H.265 / HEVC'),
          f('最高队列优先级'),
          f('30 天下载记录'),
          f('优先支持'),
        ],
      },
      ja: {
        cardTitle: 'Max',
        cardDescription: '大容量・長尺・ライブラリ丸ごと。',
        displayPrice: '$29',
        priceSuffix: '/ 月',
        buttonText: 'Max にする',
        features: [
          f('毎月 2,000 クレジット', true),
          f('1 ファイル 10 GB まで'),
          f('キューは 25 ファイルまで'),
          f('H.265 / HEVC'),
          f('最優先キュー'),
          f('30 日間のダウンロード履歴'),
          f('優先サポート'),
        ],
      },
    },
    benefitsJsonb: { monthlyCredits: 2000 } as PricingBenefits,
  },

  /* ----------------------------- PRO ANNUAL ---------------------------- */
  {
    id: '5b9f6cf0-4a3e-4a3f-9c9f-0f2a1d7b0004',
    environment: 'test',
    groupSlug: 'annual',
    cardTitle: 'Pro',
    cardDescription: 'Two months free versus monthly.',
    provider: 'stripe',
    stripePriceId: 'REPLACE_WITH_STRIPE_PRICE_ID_PRO_YEARLY',
    stripeProductId: 'REPLACE_WITH_STRIPE_PRODUCT_ID_PRO',
    paymentType: 'recurring',
    recurringInterval: 'year',
    price: '90',
    currency: 'USD',
    displayPrice: '$90',
    originalPrice: '$108',
    priceSuffix: '/ year',
    features: [
      f('600 credits every month', true),
      f('Up to 5 GB per file'),
      f('10 files in the queue'),
      f('H.265 / HEVC — ~30% smaller'),
      f('Priority queue'),
      f('7-day download history'),
    ],
    isHighlighted: true,
    highlightText: 'Save 17%',
    buttonText: 'Go Pro yearly',
    buttonLink: '',
    displayOrder: 2,
    isActive: true,
    langJsonb: {
      en: {
        cardTitle: 'Pro',
        cardDescription: 'Two months free versus monthly.',
        displayPrice: '$90',
        originalPrice: '$108',
        priceSuffix: '/ year',
        highlightText: 'Save 17%',
        buttonText: 'Go Pro yearly',
        features: [
          f('600 credits every month', true),
          f('Up to 5 GB per file'),
          f('10 files in the queue'),
          f('H.265 / HEVC — ~30% smaller'),
          f('Priority queue'),
          f('7-day download history'),
        ],
      },
      zh: {
        cardTitle: '专业版',
        cardDescription: '比按月付款少花两个月的钱。',
        displayPrice: '$90',
        originalPrice: '$108',
        priceSuffix: '/ 年',
        highlightText: '省 17%',
        buttonText: '包年 Pro',
        features: [
          f('每月 600 积分', true),
          f('单文件最大 5 GB'),
          f('队列最多 10 个文件'),
          f('H.265 / HEVC，再小约 30%'),
          f('优先队列'),
          f('7 天下载记录'),
        ],
      },
      ja: {
        cardTitle: 'Pro',
        cardDescription: '月額より 2 か月分お得。',
        displayPrice: '$90',
        originalPrice: '$108',
        priceSuffix: '/ 年',
        highlightText: '17% お得',
        buttonText: '年額 Pro',
        features: [
          f('毎月 600 クレジット', true),
          f('1 ファイル 5 GB まで'),
          f('キューは 10 ファイルまで'),
          f('H.265 / HEVC で約 30% 小さく'),
          f('優先キュー'),
          f('7 日間のダウンロード履歴'),
        ],
      },
    },
    benefitsJsonb: { monthlyCredits: 600, totalMonths: 12 } as PricingBenefits,
  },

  /* ----------------------------- MAX ANNUAL ---------------------------- */
  {
    id: '5b9f6cf0-4a3e-4a3f-9c9f-0f2a1d7b0005',
    environment: 'test',
    groupSlug: 'annual',
    cardTitle: 'Max',
    cardDescription: 'Everything in Pro, at library scale.',
    provider: 'stripe',
    stripePriceId: 'REPLACE_WITH_STRIPE_PRICE_ID_MAX_YEARLY',
    stripeProductId: 'REPLACE_WITH_STRIPE_PRODUCT_ID_MAX',
    paymentType: 'recurring',
    recurringInterval: 'year',
    price: '290',
    currency: 'USD',
    displayPrice: '$290',
    originalPrice: '$348',
    priceSuffix: '/ year',
    features: [
      f('2,000 credits every month', true),
      f('Up to 10 GB per file'),
      f('25 files in the queue'),
      f('Highest queue priority'),
      f('30-day download history'),
      f('Priority support'),
    ],
    isHighlighted: false,
    highlightText: 'Save 17%',
    buttonText: 'Go Max yearly',
    buttonLink: '',
    displayOrder: 3,
    isActive: true,
    langJsonb: {
      en: {
        cardTitle: 'Max',
        cardDescription: 'Everything in Pro, at library scale.',
        displayPrice: '$290',
        originalPrice: '$348',
        priceSuffix: '/ year',
        highlightText: 'Save 17%',
        buttonText: 'Go Max yearly',
        features: [
          f('2,000 credits every month', true),
          f('Up to 10 GB per file'),
          f('25 files in the queue'),
          f('Highest queue priority'),
          f('30-day download history'),
          f('Priority support'),
        ],
      },
      zh: {
        cardTitle: '旗舰版',
        cardDescription: 'Pro 的全部功能，素材库级别的额度。',
        displayPrice: '$290',
        originalPrice: '$348',
        priceSuffix: '/ 年',
        highlightText: '省 17%',
        buttonText: '包年 Max',
        features: [
          f('每月 2,000 积分', true),
          f('单文件最大 10 GB'),
          f('队列最多 25 个文件'),
          f('最高队列优先级'),
          f('30 天下载记录'),
          f('优先支持'),
        ],
      },
      ja: {
        cardTitle: 'Max',
        cardDescription: 'Pro の全機能を、ライブラリ規模で。',
        displayPrice: '$290',
        originalPrice: '$348',
        priceSuffix: '/ 年',
        highlightText: '17% お得',
        buttonText: '年額 Max',
        features: [
          f('毎月 2,000 クレジット', true),
          f('1 ファイル 10 GB まで'),
          f('キューは 25 ファイルまで'),
          f('最優先キュー'),
          f('30 日間のダウンロード履歴'),
          f('優先サポート'),
        ],
      },
    },
    benefitsJsonb: { monthlyCredits: 2000, totalMonths: 12 } as PricingBenefits,
  },

  /* --------------------------- CREDIT TOP-UP --------------------------- */
  {
    id: '5b9f6cf0-4a3e-4a3f-9c9f-0f2a1d7b0006',
    environment: 'test',
    groupSlug: 'onetime',
    cardTitle: '500 credits',
    cardDescription: 'No subscription. Credits never expire.',
    provider: 'stripe',
    stripePriceId: 'REPLACE_WITH_STRIPE_PRICE_ID_CREDITS_500',
    stripeProductId: 'REPLACE_WITH_STRIPE_PRODUCT_ID_CREDITS',
    paymentType: 'one_time',
    recurringInterval: null,
    price: '12',
    currency: 'USD',
    displayPrice: '$12',
    priceSuffix: 'one-time',
    features: [
      f('500 credits, no expiry', true),
      f('Up to 5 GB per file'),
      f('H.265 / HEVC'),
      f('Stacks on top of any plan'),
    ],
    isHighlighted: false,
    buttonText: 'Buy credits',
    buttonLink: '',
    displayOrder: 1,
    isActive: true,
    langJsonb: {
      en: {
        cardTitle: '500 credits',
        cardDescription: 'No subscription. Credits never expire.',
        displayPrice: '$12',
        priceSuffix: 'one-time',
        buttonText: 'Buy credits',
        features: [
          f('500 credits, no expiry', true),
          f('Up to 5 GB per file'),
          f('H.265 / HEVC'),
          f('Stacks on top of any plan'),
        ],
      },
      zh: {
        cardTitle: '500 积分',
        cardDescription: '不订阅也能用，积分永不过期。',
        displayPrice: '$12',
        priceSuffix: '一次性',
        buttonText: '购买积分',
        features: [
          f('500 积分，永不过期', true),
          f('单文件最大 5 GB'),
          f('H.265 / HEVC'),
          f('可与任意套餐叠加'),
        ],
      },
      ja: {
        cardTitle: '500 クレジット',
        cardDescription: 'サブスク不要。クレジットは無期限。',
        displayPrice: '$12',
        priceSuffix: '買い切り',
        buttonText: 'クレジットを購入',
        features: [
          f('500 クレジット（無期限）', true),
          f('1 ファイル 5 GB まで'),
          f('H.265 / HEVC'),
          f('どのプランにも上乗せ可能'),
        ],
      },
    },
    benefitsJsonb: { oneTimeCredits: 500 } as PricingBenefits,
  },
]
