import { useEffect, useRef, useState } from 'react';

/** 인라인 마크다운 (**굵게**, *기울임*, `코드`, [링크](url)) */
function inlineMd(s) {
  const esc = String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

// 체크박스 라인: 선택적 -/* 글머리 + [], [ ], [x]
const TASK_RE = /^(\s*[-*]?\s*)\[([ xX]?)\]\s?(.*)$/;

export default function TextWidget({ widget, editMode, onChange }) {
  const text = widget.content?.text ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const taRef = useRef(null);

  useEffect(() => {
    if (editing && taRef.current) taRef.current.focus();
  }, [editing]);

  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  function commit() {
    setEditing(false);
    if (draft !== text) {
      onChange({ content: { ...widget.content, text: draft } }, { commit: true });
    }
  }

  function toggleTask(idx) {
    const lines = text.split('\n');
    const line = lines[idx];
    if (line == null) return;
    const m = line.match(/\[([ xX]?)\]/);
    if (!m) return;
    const checked = m[1].toLowerCase() === 'x';
    lines[idx] = line.replace(/\[([ xX]?)\]/, checked ? '[ ]' : '[x]');
    onChange({ content: { ...widget.content, text: lines.join('\n') } }, { commit: true });
  }

  if (editing && editMode) {
    return (
      <div className="w-text">
        <textarea
          ref={taRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
        />
      </div>
    );
  }

  if (!text) {
    return (
      <div className="w-text" onDoubleClick={() => editMode && setEditing(true)}>
        <span style={{ color: '#9ca3af' }}>더블클릭하여 편집</span>
      </div>
    );
  }

  const lines = text.split('\n');

  return (
    <div className="w-text" onDoubleClick={() => editMode && setEditing(true)}>
      {lines.map((line, idx) => {
        const task = line.match(TASK_RE);
        if (task) {
          const checked = task[2].toLowerCase() === 'x';
          return (
            <label key={idx} className="w-task">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggleTask(idx)}
                onClick={(e) => e.stopPropagation()}
              />
              <span
                className={checked ? 'w-task-done' : ''}
                dangerouslySetInnerHTML={{ __html: inlineMd(task[3]) || '&nbsp;' }}
              />
            </label>
          );
        }

        const h = line.match(/^(#{1,3})\s+(.*)$/);
        if (h) {
          const Tag = `h${h[1].length}`;
          return <Tag key={idx} dangerouslySetInnerHTML={{ __html: inlineMd(h[2]) }} />;
        }

        if (line.trim() === '') return <div key={idx} className="w-blank" />;
        return <div key={idx} dangerouslySetInnerHTML={{ __html: inlineMd(line) }} />;
      })}
    </div>
  );
}
