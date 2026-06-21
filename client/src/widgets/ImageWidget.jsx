import { useRef } from 'react';

export default function ImageWidget({ widget, editMode, onChange }) {
  const src = widget.content?.src || '';
  const fileRef = useRef(null);

  function setUrl() {
    const url = window.prompt('이미지 URL 입력', src);
    if (url != null) onChange({ content: { ...widget.content, src: url } }, { commit: true });
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // dataURL 로 인코딩해 Content JSON 에 저장 (노션 rich_text 2000자 제한 주의)
      onChange({ content: { ...widget.content, src: reader.result } }, { commit: true });
    };
    reader.readAsDataURL(file);
  }

  if (!src) {
    return (
      <div className="w-placeholder">
        {editMode ? (
          <div>
            <button className="btn" onClick={setUrl}>URL 입력</button>{' '}
            <button className="btn" onClick={() => fileRef.current?.click()}>파일 업로드</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
          </div>
        ) : (
          '이미지 없음'
        )}
      </div>
    );
  }

  return (
    <img
      className="w-image"
      src={src}
      alt=""
      onDoubleClick={() => editMode && setUrl()}
      draggable={false}
    />
  );
}
