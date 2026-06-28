import { useRef, useState, useCallback } from 'react';
import PdfViewer from './PdfViewer.jsx';

// 서버리스(호스팅) 요청 본문 한계 때문에 직접 업로드는 약 4MB 까지만 안전.
const MAX_DIRECT = 4 * 1024 * 1024;

/** content(mime/name/src)로 미디어 종류 판별 */
function detectKind(content) {
  const mime = content?.mime || '';
  const name = content?.name || '';
  const src = content?.src || '';
  const base = name || src.split('?')[0];
  const ext = base.includes('.') ? base.split('.').pop().toLowerCase() : '';
  if (mime.startsWith('image/') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif', 'bmp'].includes(ext)) return 'image';
  if (mime.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v', 'ogv'].includes(ext)) return 'video';
  if (mime.startsWith('audio/') || ['mp3', 'm4a', 'wav', 'ogg', 'oga', 'aac', 'flac', 'opus'].includes(ext)) return 'audio';
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  return 'file';
}

/**
 * 통합 미디어/파일 위젯.
 * 노션 Files 속성에 업로드(이미지·PDF·음악·영상·기타) 하거나, URL(외부 링크)을 넣어
 * 종류에 맞게 이미지/영상/오디오/PDF/다운로드 카드로 표시한다.
 */
export default function MediaWidget({ widget, editMode, api, onChange }) {
  const content = widget.content || {};
  const src = content.src || '';
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  function setUrl() {
    const url = window.prompt('미디어 URL 입력 (이미지·영상·음악·PDF 직접 링크)', content.external ? src : '');
    if (url == null) return;
    const name = url ? url.split('/').pop()?.split('?')[0] || '' : '';
    onChange({ content: { ...content, src: url, name, mime: '', external: !!url } }, { commit: true });
  }

  function onFile(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_DIRECT) {
      const mb = (file.size / 1024 / 1024).toFixed(1);
      const go = window.confirm(
        `이 파일은 ${mb}MB 예요. 직접 업로드는 호스팅 한계로 약 4MB까지만 됩니다.\n` +
        `큰 영상/음악은 [URL]로 외부 링크(YouTube·Drive 등)를 넣는 걸 추천해요.\n그래도 시도할까요?`
      );
      if (!go) return;
    }
    setUploading(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = String(reader.result).split(',')[1];
      try {
        const { widget: updated } = await api.uploadFile(widget.id, {
          filename: file.name,
          contentType: file.type,
          dataBase64: base64,
        });
        onChange(
          { content: { ...content, src: updated.content?.src || '', name: file.name, mime: file.type, external: false } },
          { commit: true }
        );
      } catch (err) {
        alert('업로드 실패: ' + err.message + '\n(파일이 너무 크면 URL 링크를 사용하세요)');
      } finally {
        setUploading(false);
      }
    };
    reader.readAsDataURL(file);
  }

  const onPdfPageChange = useCallback((page) => {
    onChange({ content: { ...content, pdfPage: page } }, { commit: true });
  }, [content, onChange]);

  const hiddenInput = <input ref={fileRef} type="file" hidden onChange={onFile} />;

  if (uploading) return <div className="w-placeholder">업로드 중…{hiddenInput}</div>;

  if (!src) {
    return (
      <div className="w-placeholder">
        {editMode ? (
          <div className="media-empty">
            <button className="btn" onClick={() => fileRef.current?.click()}>파일 업로드</button>{' '}
            <button className="btn" onClick={setUrl}>URL</button>
            {hiddenInput}
          </div>
        ) : (
          '비어 있음'
        )}
      </div>
    );
  }

  const kind = detectKind(content);
  const reopen = () => editMode && fileRef.current?.click();

  let body;
  if (kind === 'image') {
    body = <img className="w-media-el" src={src} alt={content.name || ''} draggable={false} />;
  } else if (kind === 'video') {
    body = <video className="w-media-el" src={src} controls playsInline />;
  } else if (kind === 'audio') {
    body = (
      <div className="w-audio">
        <div className="w-audio-name">{content.name || '오디오'}</div>
        <audio src={src} controls />
      </div>
    );
  } else if (kind === 'pdf') {
    body = (
      <PdfViewer
        src={src}
        savedPage={content.pdfPage || 1}
        onPageChange={onPdfPageChange}
      />
    );
  } else {
    body = (
      <a className="w-file" href={src} target="_blank" rel="noreferrer" download>
        ⬇ {content.name || '파일 다운로드'}
      </a>
    );
  }

  return (
    <div className="w-media" onDoubleClick={reopen} title={editMode ? '더블클릭하여 교체' : undefined}>
      {body}
      {hiddenInput}
    </div>
  );
}
