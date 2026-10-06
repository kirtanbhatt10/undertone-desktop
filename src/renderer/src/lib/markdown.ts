import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import bash from 'highlight.js/lib/languages/bash';
import cpp from 'highlight.js/lib/languages/cpp';
import csharp from 'highlight.js/lib/languages/csharp';
import css from 'highlight.js/lib/languages/css';
import go from 'highlight.js/lib/languages/go';
import java from 'highlight.js/lib/languages/java';
import javascript from 'highlight.js/lib/languages/javascript';
import json from 'highlight.js/lib/languages/json';
import markdownLang from 'highlight.js/lib/languages/markdown';
import python from 'highlight.js/lib/languages/python';
import rust from 'highlight.js/lib/languages/rust';
import sql from 'highlight.js/lib/languages/sql';
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';
import yaml from 'highlight.js/lib/languages/yaml';
import { Marked, type Tokens } from 'marked';

const LANGS = { bash, cpp, csharp, css, go, java, javascript, json, markdown: markdownLang, python, rust, sql, typescript, xml, yaml };
for (const [name, lang] of Object.entries(LANGS)) hljs.registerLanguage(name, lang);
hljs.registerAliases(['sh', 'shell', 'zsh', 'powershell', 'ps1'], { languageName: 'bash' });
hljs.registerAliases(['js', 'jsx', 'mjs'], { languageName: 'javascript' });
hljs.registerAliases(['ts', 'tsx'], { languageName: 'typescript' });
hljs.registerAliases(['py'], { languageName: 'python' });
hljs.registerAliases(['html', 'svg'], { languageName: 'xml' });
hljs.registerAliases(['c', 'c++', 'h'], { languageName: 'cpp' });
hljs.registerAliases(['cs'], { languageName: 'csharp' });
hljs.registerAliases(['yml'], { languageName: 'yaml' });
hljs.registerAliases(['rs'], { languageName: 'rust' });
hljs.registerAliases(['golang'], { languageName: 'go' });

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

const marked = new Marked({ gfm: true, breaks: true });
marked.use({
  renderer: {
    code({ text, lang }: Tokens.Code): string {
      const language = (lang ?? '').trim().split(/\s+/)[0]?.toLowerCase() ?? '';
      const known = language && hljs.getLanguage(language);
      const body = known ? hljs.highlight(text, { language, ignoreIllegals: true }).value : escapeHtml(text);
      const label = escapeHtml(language || 'text');
      return `<div class="codeblock"><div class="codeblock-bar"><span>${label}</span><button type="button" class="codeblock-copy" data-copy-code>Copy</button></div><pre><code class="hljs">${body}</code></pre></div>`;
    },
  },
});

// Model output is untrusted. Links may only be http(s)/mailto, and nothing can load remote resources.
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A') {
    const href = node.getAttribute('href') ?? '';
    if (!/^(https:|http:|mailto:)/i.test(href)) node.removeAttribute('href');
    node.setAttribute('rel', 'noopener noreferrer');
    node.removeAttribute('target');
  }
  if (node.tagName === 'IMG') {
    const src = node.getAttribute('src') ?? '';
    if (!/^data:image\/(png|jpeg|gif|webp);base64,/i.test(src)) node.remove();
  }
  if (node.tagName === 'INPUT') node.setAttribute('disabled', '');
});

const ALLOWED_TAGS = [
  'a', 'b', 'blockquote', 'br', 'button', 'code', 'del', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'input',
  'li', 'ol', 'p', 'pre', 's', 'span', 'strong', 'sub', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'ul',
];

export function renderMarkdown(source: string): string {
  const html = marked.parse(source, { async: false });
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ['href', 'title', 'class', 'src', 'alt', 'type', 'checked', 'disabled', 'data-copy-code', 'align', 'start', 'rel'],
    ALLOW_DATA_ATTR: false,
    FORBID_TAGS: ['style', 'script', 'iframe', 'form', 'svg', 'math'],
  });
}
