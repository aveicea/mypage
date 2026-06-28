import { useContext, useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { WidgetChromeContext } from './WidgetFrame.jsx';

/**
 * 보드 위에 놓는 "뷰 버튼". 보기 모드에서 누르면 저장된 화면으로 이동.
 * 편집 모드: 한 번 클릭 → 위젯 선택, 더블클릭 → 제목 편집.
 */
export default function ViewButtonWidget({ widget, editMode, savedViews = [], onJumpTo, getCurrentRect, onChange }) {
  const { host, selected, editMode: ctxEdit } = useContext(WidgetChromeContext);
  const content = widget.content || {};
  const name = content.name ?? '뷰';
  const rect = content.rect;
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  // 선택 해제되면 편집 모드 종료
  useEffect(() => {
    if (!selected) setEditing(false);
  }, [selected]);

  // editing 진입 시 input 포커스
  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  function setHere() {
    onChange({ content: { ...content, rect: getCurrentRect?.() } }, { commit: true });
  }
  function pickView(id) {
    const v = savedViews.find((x) => x.id === id);
    if (v) onChange({ content: { ...content, rect: v.rect } }, { commit: true });
  }

  const tools = (
    <div className="vb-tools" onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={setHere}>여기로</button>
      {savedViews.length > 0 && (
        <select className="vb-select" value="" onChange={(e) => { if (e.target.value) pickView(e.target.value); }}>
          <option value="">저장된 뷰…</option>
          {savedViews.map((v) => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <div className="w-viewbtn">
      {ctxEdit && selected && host && createPortal(tools, host)}
      {ctxEdit && editing ? (
        <input
          ref={inputRef}
          className="vb-input"
          value={name}
          size={Math.max(2, name.length)}
          placeholder="뷰 이름"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ content: { ...content, name: e.target.value } })}
          onBlur={() => { setEditing(false); onChange({ content: { ...content, name: name || '뷰' } }, { commit: true }); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.target.blur(); }}
        />
      ) : (
        <button
          className="vb-main"
          onDoubleClick={(e) => { if (ctxEdit) { e.stopPropagation(); setEditing(true); } }}
          onClick={() => { if (!ctxEdit && rect) onJumpTo?.(rect); }}
        >
          {name || '뷰'}
        </button>
      )}
    </div>
  );
}
