import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { WidgetChromeContext } from './WidgetFrame.jsx';

/**
 * 보드 위에 놓는 "뷰 버튼". 보기 모드에서 누르면 저장된 화면으로 이동.
 * 편집/활성 상태: 제목을 바로 입력, 저장된 뷰 선택 / 현재 화면으로 설정.
 */
export default function ViewButtonWidget({ widget, editMode, savedViews = [], onJumpTo, getCurrentRect, onChange }) {
  const { host, selected, editMode: ctxEdit } = useContext(WidgetChromeContext);
  const content = widget.content || {};
  const name = content.name ?? '뷰';
  const rect = content.rect;

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
        <input
          className="vb-input"
          value={name}
          size={Math.max(2, name.length)}
          placeholder="뷰 이름"
          onPointerDown={(e) => e.stopPropagation()}
          onChange={(e) => onChange({ content: { ...content, name: e.target.value } })}
          onBlur={() => onChange({ content: { ...content, name: name || '뷰' } }, { commit: true })}
        />
      ) : (
        <button className="vb-main" onClick={() => { if (rect) onJumpTo?.(rect); }}>
          {name || '뷰'}
        </button>
      )}
    </div>
  );
}
