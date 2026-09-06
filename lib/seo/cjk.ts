/**
 * Drop the space an interpolated Latin brand name leaves behind in CJK copy.
 *
 * The zh template is `'{platform} 视频压缩'` and the ja one is
 * `'{platform} 用に動画を圧縮'`. That space is correct — Chinese and Japanese
 * typography wants breathing room around Latin text, so "Discord 视频压缩" and
 * "TikTok 用に動画を圧縮" read properly.
 *
 * It is only wrong when the placeholder itself resolves to CJK, which happens
 * for the platforms whose name is a common noun rather than a brand: email is
 * 邮件 in Chinese and メール in Japanese, and "邮件 视频压缩" looks like a typo.
 *
 * Fixing this in the templates would mean a zh string per platform. Fixing it
 * in the data would mean trailing whitespace inside translation values. So it
 * gets fixed here, once, by the rule an editor would actually apply: a space
 * between two CJK characters is not a space.
 */

// Han, Hiragana, Katakana, CJK punctuation, full-width forms.
const CJK =
  /[\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

export function tidyCjk(input: string): string {
  return input.replace(/(.) (.)/g, (match, before: string, after: string) =>
    CJK.test(before) && CJK.test(after) ? before + after : match
  );
}
