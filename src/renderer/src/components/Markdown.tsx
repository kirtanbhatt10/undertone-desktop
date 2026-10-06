import { memo, useMemo } from 'react';
import { api } from '../lib/api';
import { renderMarkdown } from '../lib/markdown';

function onClick(e: React.MouseEvent<HTMLDivElement>): void {
  const target = e.target as HTMLElement;
  const copy = target.closest('[data-copy-code]');
  if (copy instanceof HTMLButtonElement) {
    const code = copy.closest('.codeblock')?.querySelector('code')?.textContent ?? '';
    void navigator.clipboard.writeText(code).then(() => {
      copy.textContent = 'Copied';
      window.setTimeout(() => (copy.textContent = 'Copy'), 1400);
    });
    return;
  }
  const link = target.closest('a');
  if (link) {
    e.preventDefault();
    const href = link.getAttribute('href');
    // Links never navigate the app window; https links open in the default browser.
    if (href && /^(https:|mailto:)/i.test(href)) void api.openExternal(href).catch(() => undefined);
  }
}

/** Renders model output. The HTML is produced by marked and sanitised by DOMPurify before it is inserted. */
export const Markdown = memo(function Markdown({ source }: { source: string }) {
  const html = useMemo(() => renderMarkdown(source), [source]);
  return <div className="md" onClick={onClick} dangerouslySetInnerHTML={{ __html: html }} />;
});
