/**
 * 보드 위에 놓는 "뷰 버튼". 보기 모드에서 누르면 저장된 화면(위치/줌)으로 이동.
 * 편집 모드: 더블클릭 이름 변경, "여기로" 버튼으로 현재 화면을 이 버튼에 저장.
 */
export default function ViewButtonWidget({ widget, editMode, onJumpTo, getCurrentRect, onChange }) {
  const content = widget.content || {};
  const name = content.name || '뷰';
  const rect = content.rect;

  function rename() {
    const n = window.prompt('버튼 이름', name);
    if (n != null) onChange({ content: { ...content, name: n || '뷰' } }, { commit: true });
  }
  function setHere() {
    onChange({ content: { ...content, rect: getCurrentRect?.() } }, { commit: true });
  }

  return (
    <div className="w-viewbtn" onDoubleClick={() => editMode && rename()}>
      <button
        className="vb-main"
        onClick={() => { if (!editMode && rect) onJumpTo?.(rect); }}
      >
        ⤢ {name}
      </button>
      {editMode && (
        <button className="vb-set" title="현재 화면을 이 버튼에 저장" onClick={setHere}>여기로</button>
      )}
    </div>
  );
}
