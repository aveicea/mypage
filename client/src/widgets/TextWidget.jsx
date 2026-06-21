import { useEffect, useRef, useState } from 'react';

/** 아주 단순한 마크다운 인라인 렌더링 (**굵게**, *기울임*, `코드`, [링크](url)) */
function renderMarkdown(text) {
  const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let html = escape(text || '');
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
    .replace(/^### (.*)$/gm, '<h3>$1</h3>')
    .replace(/^## (.*)$/gm, '<h2>$1</h2>')
    .replace(/^# (.*)$/gm, '<h1>$1</h1>')
    .replace(/\n/g, '<br/>');
  return html;
}

export default function TextWidget({ widget, editMode, onChange }) {
  const text = widget.content?.text ?? '';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const taRef = useRef(null);

  useEffect(() => {
    if (editing && taRef.current) taRef.current.focus();
  }, [editing]);

  // 외부(노션) 동기화로 텍스트가 바뀌면 draft 갱신 (편집 중이 아닐 때만)
  useEffect(() => {
    if (!editing) setDraft(text);
  }, [text, editing]);

  function commit() {
    setEditing(false);
    if (draft !== text) {
      onChange({ content: { ...widget.content, text: draft } }, { commit: true });
    }
  }

  // 편집은 편집 모드에서 더블클릭 시작
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

  return (
    <div
      className="w-text"
      onDoubleClick={() => editMode && setEditing(true)}
      dangerouslySetInnerHTML={{
        __html: text ? renderMarkdown(text) : '<span style="color:#9ca3af">더블클릭하여 편집</span>',
      }}
    />
  );
}
