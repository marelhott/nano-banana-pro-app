import React, { useState, useEffect, useRef } from 'react';
import { getAllImages, GalleryImage } from '../utils/galleryDB';
import { ImageDatabase, StoredImage } from '../utils/imageDatabase';

interface ImageGalleryPanelProps {
  onDragStart?: (image: { url: string; fileName: string; fileType: string }, imageType: 'saved' | 'generated') => void;
}

type TabType = 'saved' | 'generated';

export const ImageGalleryPanel: React.FC<ImageGalleryPanelProps> = ({ onDragStart }) => {
  const [activeTab, setActiveTab] = useState<TabType>('saved');
  const [savedImages, setSavedImages] = useState<StoredImage[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GalleryImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    setLoading(true);
    try {
      // Načíst uložené obrázky z localStorage
      const saved = ImageDatabase.getAll();
      saved.sort((a, b) => b.timestamp - a.timestamp);
      setSavedImages(saved);

      // Načíst vygenerované obrázky z IndexedDB
      const generated = await getAllImages();
      setGeneratedImages(generated);
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBulkUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result && typeof e.target.result === 'string') {
          try {
            // Uložit do databáze bez kategorie (nebo s obecnou kategorií)
            await ImageDatabase.add(file, e.target.result, 'reference');
            await loadImages();
          } catch (error) {
            console.error('Failed to save image:', error);
          }
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleDragStart = (e: React.DragEvent, image: StoredImage | GalleryImage, type: 'saved' | 'generated') => {
    e.dataTransfer.effectAllowed = 'copy';

    const imageData = {
      url: image.url,
      fileName: 'fileName' in image ? image.fileName : `${image.id}.jpg`,
      fileType: 'fileType' in image ? image.fileType : 'image/jpeg'
    };

    e.dataTransfer.setData('application/json', JSON.stringify(imageData));
    e.dataTransfer.setData('text/plain', image.url);

    if (onDragStart) {
      onDragStart(imageData, type);
    }
  };

  const handleDeleteSaved = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Opravdu chcete tento obrázek odstranit?')) {
      ImageDatabase.remove(id);
      loadImages();
    }
  };

  const renderSavedTab = () => {
    if (savedImages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 px-4 text-center">
          <div className="w-16 h-16 bg-monstera-50 rounded-md flex items-center justify-center mb-4 border border-monstera-200">
            <svg className="w-8 h-8 text-monstera-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-monstera-600 mb-2">Zatím žádné uložené obrázky</p>
          <p className="text-xs text-monstera-400 mb-4">Nahrajte obrázky z počítače</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-monstera-400 hover:bg-monstera-500 text-ink font-black text-xs uppercase tracking-widest rounded-md transition-all border-2 border-ink shadow-md"
          >
            Nahrát obrázky
          </button>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-3 p-4">
        {savedImages.map((image) => (
          <div
            key={image.id}
            draggable
            onDragStart={(e) => handleDragStart(e, image, 'saved')}
            className="group relative aspect-square bg-monstera-50 rounded-md overflow-hidden border-2 border-monstera-200 hover:border-monstera-400 transition-all cursor-move shadow-sm hover:shadow-lg"
            title="Přetáhněte do referenčního nebo stylového pole"
          >
            <img
              src={image.url}
              alt={image.fileName}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-2 space-y-1">
                <p className="text-white text-[9px] font-bold truncate" title={image.fileName}>
                  {image.fileName}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-white/60 text-[8px] font-bold">
                    {new Date(image.timestamp).toLocaleDateString('cs-CZ')}
                  </span>
                  <button
                    onClick={(e) => handleDeleteSaved(image.id, e)}
                    className="p-1 bg-red-500 hover:bg-red-600 text-white rounded transition-all"
                    title="Smazat"
                  >
                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
            {/* Drag indicator */}
            <div className="absolute top-2 right-2 bg-white/90 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-3 h-3 text-monstera-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderGeneratedTab = () => {
    if (generatedImages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 px-4 text-center">
          <div className="w-16 h-16 bg-monstera-50 rounded-md flex items-center justify-center mb-4 border border-monstera-200 grayscale opacity-30">
            <span className="text-3xl">🍌</span>
          </div>
          <p className="text-sm font-bold text-monstera-600 mb-1">Zatím žádné vygenerované obrázky</p>
          <p className="text-xs text-monstera-400">Vygenerované obrázky se zobrazí zde</p>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-2 gap-3 p-4">
        {generatedImages.map((image) => (
          <div
            key={image.id}
            draggable
            onDragStart={(e) => handleDragStart(e, image, 'generated')}
            onClick={() => setSelectedImage(image)}
            className="group relative aspect-square bg-monstera-50 rounded-md overflow-hidden border-2 border-monstera-200 hover:border-monstera-400 transition-all cursor-pointer shadow-sm hover:shadow-lg"
            title="Klikněte pro velké zobrazení nebo přetáhněte do pole nalevo"
          >
            <img
              src={image.url}
              alt={image.prompt}
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-2">
                <p className="text-white text-[9px] font-bold line-clamp-2 mb-1" title={image.prompt}>
                  {image.prompt}
                </p>
                <span className="text-white/60 text-[8px] font-bold">
                  {new Date(image.timestamp).toLocaleDateString('cs-CZ')}
                </span>
              </div>
            </div>
            {/* Drag indicator */}
            <div className="absolute top-2 right-2 bg-white/90 rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <svg className="w-3 h-3 text-monstera-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-paper border-l border-monstera-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-monstera-200 bg-white flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="w-1.5 h-6 bg-monstera-400 rounded-full"></div>
          <h3 className="text-[11px] font-black uppercase tracking-wider text-ink whitespace-nowrap">Knihovna obrázků</h3>
        </div>
        {activeTab === 'saved' && (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-monstera-400 hover:bg-monstera-500 text-ink font-black text-[9px] uppercase tracking-widest rounded-md transition-all border border-ink shadow-sm flex-shrink-0"
            title="Nahrát obrázky"
          >
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
              </svg>
              Nahrát
            </div>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-4 pt-4 pb-2 bg-white border-b border-monstera-200">
        <button
          onClick={() => setActiveTab('saved')}
          className={`flex-1 px-4 py-2.5 font-black text-[10px] uppercase tracking-widest rounded-md transition-all ${
            activeTab === 'saved'
              ? 'bg-monstera-400 text-ink shadow-md border-2 border-ink'
              : 'bg-monstera-50 text-monstera-600 hover:bg-monstera-100 border-2 border-monstera-200'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
            Uložené
            {savedImages.length > 0 && (
              <span className="ml-1 text-[8px] bg-white/30 px-1.5 py-0.5 rounded-full">
                {savedImages.length}
              </span>
            )}
          </div>
        </button>
        <button
          onClick={() => setActiveTab('generated')}
          className={`flex-1 px-4 py-2.5 font-black text-[10px] uppercase tracking-widest rounded-md transition-all ${
            activeTab === 'generated'
              ? 'bg-monstera-400 text-ink shadow-md border-2 border-ink'
              : 'bg-monstera-50 text-monstera-600 hover:bg-monstera-100 border-2 border-monstera-200'
          }`}
        >
          <div className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            Vygenerované
            {generatedImages.length > 0 && (
              <span className="ml-1 text-[8px] bg-white/30 px-1.5 py-0.5 rounded-full">
                {generatedImages.length}
              </span>
            )}
          </div>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto custom-scrollbar bg-white">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-monstera-400 font-bold text-sm">Načítám...</div>
          </div>
        ) : (
          <>
            {activeTab === 'saved' && renderSavedTab()}
            {activeTab === 'generated' && renderGeneratedTab()}
          </>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleBulkUpload}
        style={{ display: 'none' }}
      />

      {/* Lightbox for generated images */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-7xl max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black/80 to-transparent p-6 z-10">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <p className="text-white font-bold text-lg">{selectedImage.prompt}</p>
                  <div className="flex items-center gap-3 text-sm text-white/60">
                    <span>{new Date(selectedImage.timestamp).toLocaleString('cs-CZ')}</span>
                    {selectedImage.resolution && <span>• {selectedImage.resolution}</span>}
                    {selectedImage.aspectRatio && <span>• {selectedImage.aspectRatio}</span>}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedImage(null)}
                  className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-md transition-all"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Image */}
            <img
              src={selectedImage.url}
              alt={selectedImage.prompt}
              className="max-w-full max-h-[90vh] object-contain rounded-lg shadow-2xl"
            />

            {/* Actions */}
            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-6">
              <div className="flex items-center justify-center gap-3">
                <a
                  href={selectedImage.url}
                  download={`${selectedImage.id}.jpg`}
                  className="px-6 py-3 bg-monstera-400 hover:bg-monstera-500 text-ink font-bold text-sm uppercase tracking-wider rounded-md transition-all border-2 border-ink shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  Stáhnout
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
