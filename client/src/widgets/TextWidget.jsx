import { useEffect, useRef, useState } from 'react';

/** 인라인 마크다운 (**굵게**, ~~취소~~, ++밑줄++, *기울임*, `코드`, [링크](url)) */
function inlineMd(s) {
  const esc = String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return esc
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/~~([^~]+)~~/g, '<del>$1</del>')
    .replace(/\+\+([^+]+)\+\+/g, '<u>$1</u>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

const TASK_RE = /^(\s*[-*]?\s*)\[([ xX]?)\]\s?(.*)$/;

function parseRows(t) {
  const ls = t.length ? t.split('\n') : [''];
  return ls.map((line) => {
    const m = line.match(TASK_RE);
    if (m) return { task: true, checked: m[2].toLowerCase() === 'x', text: m[3] };
    return { task: false, checked: false, text: line };
  });
}

function serialize(rows) {
  return rows
    .map((r) => (r.task ? `- [${r.checked ? 'x' : ' '}] ${r.text}` : r.text))
    .join('\n');
}

export default function TextWidget({ widget, editMode, autoEdit, onAutoEdited, onAutoEmpty, onChange }) {
  const text = widget.content?.text ?? '';
  const wasAuto = useRef(false);
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState([]);
  const inputRefs = useRef([]);
  const pendingFocus = useRef(null);
  const lastFocus = useRef(0);

  // pendingFocus 적용 (행 변경 후 커서 위치 복원)
  useEffect(() => {
    if (!editing || !pendingFocus.current) return;
    const { index, caret } = pendingFocus.current;
    pendingFocus.current = null;
    const el = inputRefs.current[index];
    if (el) {
      el.focus();
      const c = Math.min(caret, el.value.length);
      el.setSelectionRange(c, c);
    }
  }, [rows, editing]);

  function startEditing() {
    const rs = parseRows(text);
    setRows(rs);
    setEditing(true);
    pendingFocus.current = { index: rs.length - 1, caret: rs[rs.length - 1].text.length };
  }

  // 추가 직후 자동 편집 시작 (편집모드 전환 없이 이 위젯만)
  useEffect(() => {
    if (autoEdit) {
      wasAuto.current = true;
      startEditing();
      onAutoEdited?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit]);

  function commitEditing(rs) {
    setEditing(false);
    const next = serialize(rs);
    // 더블클릭으로 추가했는데 아무것도 입력 안 했으면 위젯 삭제
    if (wasAuto.current && next.trim() === '') {
      wasAuto.current = false;
      onAutoEmpty?.();
      return;
    }
    wasAuto.current = false;
    if (next !== text) onChange({ content: { ...widget.content, text: next } }, { commit: true });
  }

  function onEditorBlur(e) {
    if (e.currentTarget.contains(e.relatedTarget)) return;
    commitEditing(rows);
  }

  function setRow(i, updater) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? updater(r) : r)));
  }

  function updateRow(i, val) {
    // 비-체크박스 행에서 "[] ", "[ ] ", "[x] " 로 시작하면 체크박스로 자동 변환
    const r = rows[i];
    if (!r.task) {
      const m = val.match(/^\[([ xX]?)\]\s(.*)$/);
      if (m) {
        setRow(i, () => ({ task: true, checked: m[1].toLowerCase() === 'x', text: m[2] }));
        pendingFocus.current = { index: i, caret: 0 };
        return;
      }
    }
    setRow(i, (row) => ({ ...row, text: val }));
  }

  function wrapSel(i, marker) {
    const input = inputRefs.current[i];
    if (!input) return;
    const s = input.selectionStart;
    const en = input.selectionEnd;
    const t = rows[i].text;
    const next = t.slice(0, s) + marker + t.slice(s, en) + marker + t.slice(en);
    setRow(i, (row) => ({ ...row, text: next }));
    pendingFocus.current = { index: i, caret: en + marker.length };
  }

  function onRowKey(e, i) {
    const r = rows[i];
    const input = inputRefs.current[i];
    const mod = e.metaKey || e.ctrlKey;
    const k = e.key.toLowerCase();

    if (mod && k === 'b') { e.preventDefault(); return wrapSel(i, '**'); }
    if (mod && k === 'i') { e.preventDefault(); return wrapSel(i, '*'); }
    if (mod && k === 'u') { e.preventDefault(); return wrapSel(i, '++'); }
    if (mod && e.shiftKey && k === 'x') { e.preventDefault(); return wrapSel(i, '~~'); }
    if (mod && k === 'e') { e.preventDefault(); return wrapSel(i, '`'); }

    if (e.key === 'Enter') {
      e.preventDefault();
      const pos = input.selectionStart;
      const left = r.text.slice(0, pos);
      const right = r.text.slice(pos);
      if (r.task && left.trim() === '' && right.trim() === '') {
        setRow(i, () => ({ task: false, checked: false, text: '' }));
        pendingFocus.current = { index: i, caret: 0 };
        return;
      }
      setRows((rs) => {
        const copy = [...rs];
        copy[i] = { ...copy[i], text: left };
        copy.splice(i + 1, 0, { task: r.task, checked: false, text: right });
        return copy;
      });
      pendingFocus.current = { index: i + 1, caret: 0 };
      return;
    }

    if (e.key === 'Backspace' && input.selectionStart === 0 && input.selectionEnd === 0) {
      if (r.task) {
        e.preventDefault();
        setRow(i, (row) => ({ ...row, task: false }));
        pendingFocus.current = { index: i, caret: 0 };
        return;
      }
      if (i > 0) {
        e.preventDefault();
        const prevLen = rows[i - 1].text.length;
        setRows((rs) => {
          const copy = [...rs];
          copy[i - 1] = { ...copy[i - 1], text: copy[i - 1].text + copy[i].text };
          copy.splice(i, 1);
          return copy;
        });
        pendingFocus.current = { index: i - 1, caret: prevLen };
        return;
      }
    }

    if (e.key === 'ArrowUp' && i > 0 && input.selectionStart === 0) {
      e.preventDefault();
      pendingFocus.current = { index: i - 1, caret: rows[i - 1].text.length };
      setRows((rs) => [...rs]);
      return;
    }
    if (e.key === 'ArrowDown' && i < rows.length - 1 && input.selectionStart === input.value.length) {
      e.preventDefault();
      pendingFocus.current = { index: i + 1, caret: 0 };
      setRows((rs) => [...rs]);
      return;
    }
    if (e.key === 'Escape') input.blur();
  }

  // 편집 중 토글(체크박스) — 저장은 blur 시
  function toggleRowEditing(i) {
    setRow(i, (r) => ({ ...r, checked: !r.checked }));
  }

  // 편집 중 서식 바 (포커스된 행에 적용)
  function applyToFocused(fn) {
    const i = lastFocus.current;
    fn(i);
  }

  /* ----- 보기/렌더 상태에서 체크박스 토글 ----- */
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

  /* ===== 편집 모드(인라인 에디터) ===== */
  if (editing) {
    return (
      <div className="w-text w-editor" onBlur={onEditorBlur}>
        <div className="fmt-bar" onMouseDown={(e) => e.preventDefault()}>
          <button onClick={() => applyToFocused((i) => wrapSel(i, '**'))} title="굵게"><b>B</b></button>
          <button onClick={() => applyToFocused((i) => wrapSel(i, '*'))} title="기울임"><i>I</i></button>
          <button onClick={() => applyToFocused((i) => wrapSel(i, '++'))} title="밑줄"><u>U</u></button>
          <button onClick={() => applyToFocused((i) => wrapSel(i, '~~'))} title="취소선"><s>S</s></button>
          <button onClick={() => applyToFocused((i) => wrapSel(i, '`'))} title="코드">{'</>'}</button>
          <button onClick={() => applyToFocused((i) => setRow(i, (r) => ({ ...r, text: /^#{1,3}\s/.test(r.text) ? r.text.replace(/^#{1,3}\s/, '') : '# ' + r.text })))} title="제목">H</button>
          <button onClick={() => applyToFocused((i) => setRow(i, (r) => ({ ...r, task: !r.task })))} title="체크박스">☑</button>
        </div>
        {rows.map((r, i) => (
          <div className="ed-row" key={i}>
            {r.task && (
              <input
                type="checkbox"
                checked={r.checked}
                onChange={() => toggleRowEditing(i)}
                onMouseDown={(e) => e.preventDefault()}
                tabIndex={-1}
              />
            )}
            <input
              className="ed-input"
              value={r.text}
              ref={(el) => (inputRefs.current[i] = el)}
              onFocus={() => (lastFocus.current = i)}
              onChange={(e) => updateRow(i, e.target.value)}
              onKeyDown={(e) => onRowKey(e, i)}
            />
          </div>
        ))}
      </div>
    );
  }

  /* ===== 보기/렌더 ===== */
  if (!text) {
    return (
      <div className="w-text" onDoubleClick={startEditing}>
        <span style={{ color: '#9ca3af' }}>더블클릭하여 편집</span>
      </div>
    );
  }

  const lines = text.split('\n');
  const collapsed = !!widget.content?.collapsed;

  const fold = (
    <div
      className={`fold-btn ${collapsed ? 'on' : ''}`}
      title={collapsed ? '펼치기' : '접기'}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        onChange({ content: { ...widget.content, collapsed: !collapsed } }, { commit: true });
      }}
    />
  );

  if (collapsed) {
    const first = lines.find((l) => l.trim() !== '') || '';
    const clean = first.replace(/^(\s*[-*]?\s*)\[([ xX]?)\]\s?/, '').replace(/^#{1,3}\s+/, '');
    return (
      <>
        <div className="w-text w-collapsed" onDoubleClick={startEditing}>
          <div className="w-collapsed-line" dangerouslySetInnerHTML={{ __html: inlineMd(clean) || '&nbsp;' }} />
        </div>
        {fold}
      </>
    );
  }

  return (
    <>
      <div className="w-text" onDoubleClick={startEditing}>
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
      {fold}
    </>
  );
}
