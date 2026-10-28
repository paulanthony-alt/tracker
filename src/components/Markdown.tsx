/**
 * Tiny, safe Markdown renderer for notes. It builds React elements directly
 * (never injects HTML), so note content can't run scripts.
 * Supports: # headings, - / * / 1. lists, - [ ] checkboxes (clickable),
 * **bold**, *italic*, `code`, [links](https://…), > quotes, --- rules.
 */
import { Fragment, type ReactNode } from 'react';

function inline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const tok = m[0];
    const k = `${keyBase}-${i++}`;
    if (tok.startsWith('**')) out.push(<strong key={k}>{tok.slice(2, -2)}</strong>);
    else if (tok.startsWith('`')) out.push(<code key={k}>{tok.slice(1, -1)}</code>);
    else if (tok.startsWith('[')) {
      const [, label, href] = tok.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/) ?? [];
      const safe = /^(https?:|mailto:|#\/)/i.test(href ?? '');
      out.push(
        safe ? (
          <a key={k} href={href} target={href.startsWith('#') ? undefined : '_blank'} rel="noopener noreferrer">
            {label}
          </a>
        ) : (
          <span key={k}>{label}</span>
        ),
      );
    } else out.push(<em key={k}>{tok.slice(1, -1)}</em>);
    last = m.index + tok.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source, onToggleCheckbox }: { source: string; onToggleCheckbox?: (lineIndex: number) => void }) {
  const lines = source.split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const key = `l${i}`;
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const Tag = (['h1', 'h2', 'h3'] as const)[h[1].length - 1];
      blocks.push(<Tag key={key}>{inline(h[2], key)}</Tag>);
      i++;
      continue;
    }
    if (/^\s*(---|\*\*\*)\s*$/.test(line)) {
      blocks.push(<hr key={key} />);
      i++;
      continue;
    }
    if (/^>\s?/.test(line)) {
      const quote: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) quote.push(lines[i++].replace(/^>\s?/, ''));
      blocks.push(<blockquote key={key}>{inline(quote.join(' '), key)}</blockquote>);
      continue;
    }
    if (/^\s*([-*]|\d+\.)\s+/.test(line)) {
      const ordered = /^\s*\d+\./.test(line);
      const items: ReactNode[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) {
        const idx = i;
        const raw = lines[i].replace(/^\s*([-*]|\d+\.)\s+/, '');
        const task = raw.match(/^\[( |x|X)\]\s?(.*)$/);
        if (task) {
          const checked = task[1].toLowerCase() === 'x';
          items.push(
            <li key={`li${idx}`} className="!list-none -ml-5 flex items-start gap-2">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleCheckbox?.(idx)}
                disabled={!onToggleCheckbox}
                className="mt-1 accent-[rgb(var(--accent))]"
                aria-label={task[2] || 'Checklist item'}
              />
              <span className={checked ? 'text-faint line-through' : ''}>{inline(task[2], `li${idx}`)}</span>
            </li>,
          );
        } else items.push(<li key={`li${idx}`}>{inline(raw, `li${idx}`)}</li>);
        i++;
      }
      blocks.push(ordered ? <ol key={key}>{items}</ol> : <ul key={key}>{items}</ul>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#{1,3}\s|>|\s*([-*]|\d+\.)\s+|---)/.test(lines[i])) para.push(lines[i++]);
    blocks.push(
      <p key={key}>
        {para.map((p, j) => (
          <Fragment key={j}>
            {j > 0 && <br />}
            {inline(p, `${key}-${j}`)}
          </Fragment>
        ))}
      </p>,
    );
  }
  return <div className="prose-note text-[14px]">{blocks}</div>;
}

/** Flip the checkbox on a given line of markdown. */
export function toggleCheckboxLine(source: string, lineIndex: number): string {
  const lines = source.split('\n');
  const l = lines[lineIndex];
  if (l === undefined) return source;
  lines[lineIndex] = l.replace(/\[( |x|X)\]/, (m) => (m === '[ ]' ? '[x]' : '[ ]'));
  return lines.join('\n');
}
