import { useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { WidgetChromeContext } from './WidgetFrame.jsx';

/**
 * 보드 위에 놓는 "뷰 버튼". 보기 모드에서 누르면 저장된 화면으로 이동.
 * 편집 모드: 한 번 클릭 = 선택, 더블클릭 = 제목 편집. 저장된 뷰 선택 / 현재 화면으로 설정.
 */
export default function ViewButtonWidget({ widget, editMode, savedViews = [], onJumpTo, getCurrentRect, onChange }) {
  const { host, selected, editMode: ctxEdit } = useContext(WidgetChromeContext);
  const content = widget.content || {};
  const name = content.name ?? '뷰';
  const rect = content.rect;
  const [editing, setEditing] = useState(false);
  const inputRef = useRef(null);

  // 편집 진입 시 입력란에 포커스 + 전체 선택
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  // 선택이 풀리거나 편집 모드를 벗어나면 제목 편집도 종료
  useEffect(() => {
    if (!ctxEdit || !selected) setEditing(false);
  }, [ctxEdit, selected]);

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
      {ctxEdit ? (
        editing ? (
          <input
            ref={inputRef}
            className="vb-input"
            value={name}
            size={Math.max(2, name.length)}
            placeholder="뷰 이름"
            onPointerDown={(e) => e.stopPropagation()}
            onChange={(e) => onChange({ content: { ...content, name: e.target.value } })}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === 'Escape') e.currentTarget.blur(); }}
            onBlur={() => { onChange({ content: { ...content, name: name || '뷰' } }, { commit: true }); setEditing(false); }}
          />
        ) : (
          // 한 번 클릭은 WidgetFrame 으로 전파돼 선택, 더블클릭에서만 제목 편집.
          <div className="vb-main" onDoubleClick={() => setEditing(true)}>
            {name || '뷰'}
          </div>
        )
      ) : (
        <button className="vb-main" onClick={() => { if (rect) onJumpTo?.(rect); }}>
          {name || '뷰'}
        </button>
      )}
    </div>
  );
}
