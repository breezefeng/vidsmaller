/**
 * Pull the FAQ out of a post's markdown so it can be emitted as FAQPage schema.
 *
 * Derived from the visible content rather than declared separately in
 * frontmatter, and that is the whole point: FAQ markup has to describe FAQ
 * content that actually appears on the page. A duplicate list in frontmatter
 * would be free to drift from the prose, and the version Google reads would
 * quietly stop being the version the reader sees. Extracting means they cannot
 * disagree.
 *
 * Convention: an `## FAQ` heading, then one `###` per question, each followed
 * by its answer. Anything else is ignored, and a post with no FAQ section
 * simply gets no FAQ markup.
 */

export interface FaqEntry {
  question: string;
  answer: string;
}

/** Strip the markdown a plain-text answer should not carry into JSON-LD. */
function toPlainText(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1$2')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractFaq(markdown: string): FaqEntry[] {
  if (!markdown) return [];

  const lines = markdown.split('\n');

  // Find the FAQ section. Tolerant of "FAQ", "FAQs", "Discord FAQs", "常见问题".
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^##\s+(.*)$/.exec(lines[i]);
    if (m && /faq|frequently asked|常见问题|よくある/i.test(m[1])) {
      start = i + 1;
      break;
    }
  }
  if (start === -1) return [];

  const entries: FaqEntry[] = [];
  let question: string | null = null;
  let answer: string[] = [];

  const flush = () => {
    if (question) {
      const text = toPlainText(answer.join('\n'));
      if (text) entries.push({ question, answer: text });
    }
    question = null;
    answer = [];
  };

  for (let i = start; i < lines.length; i++) {
    const line = lines[i];

    // Any h1/h2, or a horizontal rule, ends the FAQ section.
    if (/^##?\s+\S/.test(line) || /^---\s*$/.test(line)) {
      flush();
      break;
    }

    const h3 = /^###\s+(.*)$/.exec(line);
    if (h3) {
      flush();
      question = toPlainText(h3[1]);
      continue;
    }

    if (question) answer.push(line);
  }
  flush();

  return entries;
}
