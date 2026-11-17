import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, MouseEvent as ReactMouseEvent, ReactNode } from 'react';
import { del, empty, Field, fromText, hasGap, insert, insertText, Kind, move, place, Row, template, toText, Tpl } from './mathrow';
import '../styles/mathfield.css';

/**
 * The working line: maths typed into boxes, as on a scientific calculator.
 * See mathfield.ts for the model; this draws it and takes taps and keys.
 */
export interface MathFieldHandle {
  insert(token: string): void;
  template(kind: Kind, v?: string): void;
  /** False when there was nothing to delete. */
  del(): boolean;
  move(d: -1 | 1): void;
  clear(): void;
  setText(text: string): void;
  focus(): void;
}

const SHOW: Record<string, string> = { '*': '·', '-': '−', '/': '÷', pi: 'π', inf: '∞', '<=': '≤', '>=': '≥' };

interface Props {
  placeholder?: string;
  label: string;
  onChange: (text: string, gaps: boolean) => void;
  onEnter: () => void;
  /** Backspace on an empty line. */
  onEmptyDelete?: () => void;
}

export const MathField = forwardRef<MathFieldHandle, Props>(function MathField({ placeholder, label, onChange, onEnter, onEmptyDelete }, ref) {
  const [field, setField] = useState<Field>(empty);
  const live = useRef(field);
  const box = useRef<HTMLDivElement | null>(null);

  const apply = (next: Field) => {
    if (next === live.current) return;
    const changed = next.row !== live.current.row;
    live.current = next;
    setField(next);
    if (changed) onChange(toText(next.row), hasGap(next.row));
  };

  useImperativeHandle(ref, () => ({
    insert: (t) => apply(t.length > 1 && /^[0-9.]+$/.test(t) ? insertText(live.current, t) : insert(live.current, t)),
    template: (k, v) => apply(template(live.current, k, v)),
    del: () => {
      const next = del(live.current);
      if (next === live.current) return false;
      apply(next);
      return true;
    },
    move: (d) => apply(move(live.current, d)),
    clear: () => apply(empty()),
    setText: (t) => apply(fromText(t)),
    focus: () => box.current?.focus({ preventScroll: true }),
  }));

  // keep the cursor in view on a long line
  useEffect(() => {
    box.current?.querySelector('.mf-caret')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [field]);

  const onKeyDown = (e: ReactKeyboardEvent) => {
    const f = live.current;
    if (e.key === 'Enter') {
      e.preventDefault();
      onEnter();
    } else if (e.key === 'Backspace') {
      e.preventDefault();
      const next = del(f);
      if (next === f) onEmptyDelete?.();
      else apply(next);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      apply(move(f, e.key === 'ArrowLeft' ? -1 : 1));
    } else if (e.key === '^') {
      e.preventDefault();
      apply(template(f, 'pow'));
    } else if (e.key === '/') {
      e.preventDefault();
      apply(template(f, 'frac'));
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && /[0-9a-zA-Z+\-*=().,<>| ]/.test(e.key)) {
      e.preventDefault();
      apply(insert(f, e.key));
    }
  };

  const tapRow = (e: ReactMouseEvent, path: number[], n: number) => {
    e.stopPropagation();
    apply(place(live.current, path, n));
  };

  const sameRow = (path: number[]) => path.length === field.cur.path.length && path.every((p, i) => p === field.cur.path[i]);

  const drawRow = (row: Row, path: number[], small = false): ReactNode => {
    const here = sameRow(path);
    const out: ReactNode[] = [];
    const caret = <i key="caret" className="mf-caret" />;
    row.forEach((it, i) => {
      if (here && field.cur.pos === i) out.push(caret);
      if (typeof it === 'string') {
        out.push(
          <span
            key={i}
            className={`mf-tok ${it === ' ' ? 'sp' : /^[a-zA-Z]$/.test(it) ? 'var' : /^[+\-*/=<>]|<=|>=$/.test(it) ? 'op' : ''}`}
            onClick={(e: ReactMouseEvent<HTMLElement>) => {
              // left half of a symbol puts the cursor before it, right half after
              const r = e.currentTarget.getBoundingClientRect();
              tapRow(e, path, e.clientX < r.left + r.width / 2 ? i : i + 1);
            }}
          >
            {SHOW[it] ?? it}
          </span>,
        );
      } else out.push(drawTpl(it, [...path, i], i));
    });
    if (here && field.cur.pos === row.length) out.push(caret);
    const emptyBox = row.length === 0 && path.length > 0;
    return (
      <span className={`mf-row ${small ? 'small' : ''} ${emptyBox ? 'empty' : ''} ${emptyBox && here ? 'on' : ''}`} onClick={(e: ReactMouseEvent) => tapRow(e, path, row.length)}>
        {out}
      </span>
    );
  };

  const drawTpl = (t: Tpl, at: number[], key: number): ReactNode => {
    const slot = (n: number, small = false) => drawRow(t.slots[n], [...at, n], small);
    const v = t.v ?? 'x';
    switch (t.kind) {
      case 'frac':
        return <span key={key} className="mf-frac"><span className="top">{slot(0)}</span><span className="bot">{slot(1)}</span></span>;
      case 'pow':
        return <sup key={key} className="mf-pow">{slot(0, true)}</sup>;
      case 'sqrt':
        return <span key={key} className="mf-sqrt"><i>√</i><span className="under">{slot(0)}</span></span>;
      case 'abs':
        return <span key={key} className="mf-abs">{slot(0)}</span>;
      case 'ddx':
        return <span key={key} className="mf-fn"><span className="mf-frac lead"><span className="top"><em>d</em></span><span className="bot"><em>d{v}</em></span></span><b>(</b>{slot(0)}<b>)</b></span>;
      case 'int':
        return <span key={key} className="mf-fn"><svg className="mf-int" viewBox="0 0 10 28" aria-hidden="true"><path d="M8.6 2.2c-2.3-.9-3.1.7-3.3 3.200L4.7 22.600c-.2 2.5-1 4.1-3.3 3.2" /></svg>{slot(0)}<em className="dx">d{v}</em></span>;
      case 'defint':
        return <span key={key} className="mf-fn"><span className="mf-lims"><span>{slot(1, true)}</span><svg className="mf-int" viewBox="0 0 10 28" aria-hidden="true"><path d="M8.6 2.2c-2.3-.9-3.1.7-3.3 3.200L4.7 22.600c-.2 2.5-1 4.1-3.3 3.2" /></svg><span>{slot(0, true)}</span></span>{slot(2)}<em className="dx">d{v}</em></span>;
      case 'lim':
        return <span key={key} className="mf-fn"><span className="mf-lim"><span>lim</span><span className="to"><em>{v}</em>→{slot(0, true)}</span></span>{slot(1)}</span>;
    }
  };

  const isEmpty = field.row.length === 0;
  return (
    <div ref={box} className="mf" tabIndex={0} role="textbox" aria-label={label} onKeyDown={onKeyDown} onClick={() => apply(place(live.current, [], live.current.row.length))}>
      {isEmpty && <span className="mf-ph">{placeholder}</span>}
      {drawRow(field.row, [])}
    </div>
  );
});
