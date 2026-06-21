import { useRef, useState } from 'react';

export default function ImageWidget({ widget, editMode, api, onChange }) {
  const src = widget.content?.src || '';
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  function setUrl() {
    const url = window.prompt('이미지 URL 입력', src);
    if (url != null) onChange({ content: { ...widget.content, src: url } }, { commit: true });
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1];
      try {
        // Notion Files 속성에 실제 업로드 → 기기 간 동기화됨
        const { widget: updated } = await api.uploadImage(widget.id, {
          filename: file.name,
          contentType: file.type,
          dataBase64: base64,
        });
        onChange({ content: { ...widget.content, src: updated.content?.src || '' } });
      } catch (err) {
        alert('이미지 업로드 실패: ' + err.message);
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  if (uploading) {
    return <div className="w-placeholder">업로드 중…</div>;
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
    <>
      <img
        className="w-image"
        src={src}
        alt=""
        onDoubleClick={() => editMode && fileRef.current?.click()}
        draggable={false}
      />
      <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />
    </>
  );
}
