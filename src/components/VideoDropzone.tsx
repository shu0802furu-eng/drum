import { useRef, useState } from 'react';
import type { DragEvent } from 'react';

interface VideoDropzoneProps {
  fileName: string | null;
  onFile: (file: File) => void;
}

export function VideoDropzone({ fileName, onFile }: VideoDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) onFile(file);
  }

  return (
    <div
      className={`dropzone${isDragging ? ' dropzone--active' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setIsDragging(true);
      }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click();
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = '';
        }}
      />
      <p className="dropzone__title">
        {fileName ? `選択中: ${fileName}` : '動画をドラッグ&ドロップ、またはクリックして選択'}
      </p>
      <p className="dropzone__hint">mp4 / webm / mov などの動画ファイルに対応</p>
    </div>
  );
}
