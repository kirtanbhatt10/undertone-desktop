import { Fragment, type ReactNode } from 'react';

function inline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    out.push(t.startsWith('**') ? <strong key={k++}>{t.slice(2, -2)}</strong> : <em key={k++}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** A deliberately small Markdown renderer for the simulated replies. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <div className="md">
      {blocks.map((block, i) => {
        const lines = block.split('\n');
        if (lines.every((l) => /^- /.test(l))) {
          return (
            <ul key={i}>
              {lines.map((l, j) => {
                const task = /^- \[ \] /.test(l);
                return (
                  <li key={j} className={task ? 'task' : undefined}>
                    {task && <span className="box" aria-hidden />}
                    {inline(l.replace(/^- (\[ \] )?/, ''))}
                  </li>
                );
              })}
            </ul>
          );
        }
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            <ol key={i}>
              {lines.map((l, j) => (
                <li key={j}>{inline(l.replace(/^\d+\. /, ''))}</li>
              ))}
            </ol>
          );
        }
        if (block.startsWith('> ')) return <blockquote key={i}>{inline(block.slice(2))}</blockquote>;
        return (
          <p key={i}>
            {lines.map((l, j) => (
              <Fragment key={j}>
                {j > 0 && <br />}
                {inline(l)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}
