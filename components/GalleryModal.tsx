import React, { useState, useEffect, useRef } from 'react';
import { getAllImages, deleteImage, clearGallery, GalleryImage } from '../utils/galleryDB';
import { exportAllData, importData } from '../utils/dataBackup';

interface GalleryModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const GalleryModal: React.FC<GalleryModalProps> = ({ isOpen, onClose }) => {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      loadImages();
    }
  }, [isOpen]);

  const loadImages = async () => {
    setLoading(true);
    try {
      const allImages = await getAllImages();
      setImages(allImages);
    } catch (error) {
      console.error('Failed to load gallery:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Opravdu chcete smazat tento obrázek?')) return;
    try {
      await deleteImage(id);
      await loadImages();
      if (selectedImage?.id === id) {
        setSelectedImage(null);
      }
    } catch (error) {
      console.error('Failed to delete image:', error);
    }
  };

  const handleClearAll = async () => {
    if (!confirm('Opravdu chcete smazat všechny obrázky z galerie?')) return;
    try {
      await clearGallery();
      setImages([]);
      setSelectedImage(null);
    } catch (error) {
      console.error('Failed to clear gallery:', error);
    }
  };

  const handleExport = async () => {
    try {
      await exportAllData();
      showNotification('✅ Data úspěšně exportována');
    } catch (error) {
      console.error('Export failed:', error);
      showNotification('❌ Export selhal');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const result = await importData(file);
      await loadImages();
      showNotification(`✅ Importováno: ${result.prompts} promptů, ${result.images} obrázků`);
    } catch (error) {
      console.error('Import failed:', error);
      showNotification('❌ Import selhal - zkontrolujte formát souboru');
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const showNotification = (message: string) => {
    setNotification(message);
    setTimeout(() => setNotification(null), 4000);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full h-full max-w-7xl max-h-[90vh] m-4 bg-paper rounded-lg shadow-2xl overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-monstera-200 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-2 h-8 bg-monstera-400 rounded-full"></div>
            <h2 className="text-xl font-black uppercase tracking-wider text-ink">Galerie</h2>
            <span className="text-sm font-bold text-monstera-400">({images.length} obrázků)</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleImportClick}
              className="px-4 py-2 bg-monstera-50 hover:bg-monstera-100 text-monstera-700 font-bold text-xs uppercase tracking-wider rounded-md transition-all border border-monstera-300"
              title="Importovat zálohu"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
                Import
              </div>
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-monstera-400 hover:bg-monstera-500 text-ink font-bold text-xs uppercase tracking-wider rounded-md transition-all border border-ink"
              title="Exportovat všechna data"
            >
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
                Export
              </div>
            </button>
            {images.length > 0 && (
              <button
                onClick={handleClearAll}
                className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 font-bold text-xs uppercase tracking-wider rounded-md transition-all border border-red-200"
              >
                Smazat vše
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 hover:bg-monstera-100 rounded-md transition-all"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-monstera-400 font-bold">Načítám galerii...</div>
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="w-20 h-20 bg-monstera-50 rounded-md flex items-center justify-center opacity-40">
                <svg className="w-12 h-12 text-monstera-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-lg font-bold text-monstera-600">Galerie je prázdná</p>
              <p className="text-sm text-monstera-400">Vygenerované obrázky se automaticky uloží zde</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="group relative aspect-square bg-monstera-50 rounded-md overflow-hidden border border-monstera-200 hover:border-monstera-400 transition-all cursor-pointer shadow-sm hover:shadow-lg"
                  onClick={() => setSelectedImage(image)}
                >
                  <img
                    src={image.thumbnail || image.url}
                    alt={image.prompt}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                      <p className="text-white text-xs font-bold line-clamp-2">{image.prompt}</p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-white/60 text-[10px] font-bold">
                          {new Date(image.timestamp).toLocaleDateString('cs-CZ')}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(image.id);
                          }}
                          className="p-1.5 bg-red-500 hover:bg-red-600 text-white rounded-md transition-all"
                          title="Smazat"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Lightbox */}
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(selectedImage.id);
                  }}
                  className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white font-bold text-sm uppercase tracking-wider rounded-md transition-all shadow-lg"
                >
                  Smazat
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleImportFile}
        style={{ display: 'none' }}
      />

      {/* Notification */}
      {notification && (
        <div className="fixed top-4 right-4 z-[70] bg-white border-2 border-monstera-400 rounded-lg shadow-2xl px-6 py-4 animate-fadeIn">
          <p className="text-sm font-bold text-ink">{notification}</p>
        </div>
      )}
    </div>
  );
};
