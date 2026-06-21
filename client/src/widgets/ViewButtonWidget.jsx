import { useContext } from 'react';
import { createPortal } from 'react-dom';
import { WidgetChromeContext } from './WidgetFrame.jsx';

/**
 * 보드 위에 놓는 "뷰 버튼". 보기 모드에서 누르면 저장된 화면으로 이동.
 * 편집 모드(선택 시): 제목 변경, 저장된 뷰 중 선택, 현재 화면으로 설정.
 */
export default function ViewButtonWidget({ widget, editMode, savedViews = [], onJumpTo, getCurrentRect, onChange }) {
  const { host } = useContext(WidgetChromeContext);
  const content = widget.content || {};
  const name = content.name || '뷰';
  const rect = content.rect;

  function rename() {
    const n = window.prompt('버튼 제목', name);
    if (n != null) onChange({ content: { ...content, name: n || '뷰' } }, { commit: true });
  }
  function setHere() {
    onChange({ content: { ...content, rect: getCurrentRect?.() } }, { commit: true });
  }
  function pickView(id) {
    const v = savedViews.find((x) => x.id === id);
    if (v) onChange({ content: { ...content, rect: v.rect, name: content.name || v.name } }, { commit: true });
  }

  const tools = (
    <div className="vb-tools" onPointerDown={(e) => e.stopPropagation()}>
      <button onClick={rename}>제목</button>
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
    <div className="w-viewbtn" onDoubleClick={() => editMode && rename()}>
      {host && createPortal(tools, host)}
      <button className="vb-main" onClick={() => { if (!editMode && rect) onJumpTo?.(rect); }}>
        {name}
      </button>
    </div>
  );
}
