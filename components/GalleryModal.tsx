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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSelectionMode, setIsSelectionMode] = useState(false);

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

  const toggleSelection = (id: string) => {
    const newSelectedIds = new Set(selectedIds);
    if (newSelectedIds.has(id)) {
      newSelectedIds.delete(id);
    } else {
      newSelectedIds.add(id);
    }
    setSelectedIds(newSelectedIds);
  };

  const selectAll = () => {
    setSelectedIds(new Set(images.map(img => img.id)));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`Opravdu chcete smazat ${selectedIds.size} vybraných obrázků?`)) return;

    try {
      for (const id of Array.from(selectedIds)) {
        await deleteImage(id);
      }
      await loadImages();
      setSelectedIds(new Set());
      setIsSelectionMode(false);
      showNotification(`✅ Smazáno ${selectedIds.size} obrázků`);
    } catch (error) {
      console.error('Batch delete failed:', error);
      showNotification('❌ Hromadné mazání selhalo');
    }
  };

  const handleBatchExport = async () => {
    if (selectedIds.size === 0) return;

    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const selectedImages = images.filter(img => selectedIds.has(img.id));

      for (const image of selectedImages) {
        const response = await fetch(image.url);
        const blob = await response.blob();
        zip.file(`${image.id}.jpg`, blob);

        // Přidat metadata
        const metadata = [
          `Prompt: ${image.prompt}`,
          `Timestamp: ${new Date(image.timestamp).toISOString()}`,
          `Resolution: ${image.resolution || 'N/A'}`,
          `Aspect Ratio: ${image.aspectRatio || 'N/A'}`,
        ].join('\n');
        zip.file(`${image.id}.txt`, metadata);
      }

      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `nano-banana-batch-${Date.now()}.zip`;
      link.click();

      showNotification(`✅ Exportováno ${selectedIds.size} obrázků`);
    } catch (error) {
      console.error('Batch export failed:', error);
      showNotification('❌ Export selhal');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm" onClick={onClose}>
      <div className="relative w-full h-full max-w-7xl max-h-[90vh] m-4 bg-[#0f1512] rounded-xl shadow-2xl overflow-hidden flex flex-col border border-gray-800" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#0f1512]/50">
          <div className="flex items-center gap-3">
            <div className="w-1.5 h-8 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"></div>
            <h2 className="text-xl font-bold uppercase tracking-wider text-gray-100">Gallery</h2>
            <span className="text-sm font-bold text-gray-500">
              ({images.length} images{isSelectionMode && selectedIds.size > 0 ? ` • ${selectedIds.size} selected` : ''})
            </span>
          </div>
          <div className="flex items-center gap-2">
            {!isSelectionMode ? (
              <>
                <button
                  onClick={() => setIsSelectionMode(true)}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-lg transition-all border border-gray-700 hover:border-[#7ed957]/50"
                  title="Select Multiple"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                    </svg>
                    Select
                  </div>
                </button>
                <button
                  onClick={handleImportClick}
                  className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-lg transition-all border border-gray-700 hover:border-[#7ed957]/50"
                  title="Import Backup"
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
                  className="px-4 py-2 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] font-bold text-xs uppercase tracking-wider rounded-lg transition-all border border-transparent shadow-lg shadow-[#7ed957]/20"
                  title="Export All Data"
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
                    className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all border border-red-500/20 hover:border-red-500"
                  >
                    Clear All
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={selectAll}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-lg transition-all border border-gray-700"
                >
                  Select All
                </button>
                <button
                  onClick={deselectAll}
                  className="px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold text-xs uppercase tracking-wider rounded-lg transition-all border border-gray-700"
                >
                  Deselect
                </button>
                {selectedIds.size > 0 && (
                  <>
                    <button
                      onClick={handleBatchExport}
                      className="px-4 py-2 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] font-bold text-xs uppercase tracking-wider rounded-lg transition-all shadow-lg shadow-[#7ed957]/20"
                    >
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Export ({selectedIds.size})
                      </div>
                    </button>
                    <button
                      onClick={handleBatchDelete}
                      className="px-4 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all"
                    >
                      Delete ({selectedIds.size})
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    setIsSelectionMode(false);
                    setSelectedIds(new Set());
                  }}
                  className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white font-bold text-xs uppercase tracking-wider rounded-lg transition-all"
                >
                  Done
                </button>
              </>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#0f1512]/30">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-[#7ed957] font-bold animate-pulse">Loading gallery...</div>
            </div>
          ) : images.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4">
              <div className="w-20 h-20 bg-gray-800/50 rounded-lg flex items-center justify-center">
                <svg className="w-12 h-12 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-lg font-bold text-gray-400">Gallery is empty</p>
              <p className="text-sm text-gray-600">Generated images will appear here</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={`group relative aspect-square bg-[#0a0f0d] rounded-lg overflow-hidden border transition-all cursor-pointer shadow-lg ${isSelectionMode && selectedIds.has(image.id)
                      ? 'border-[#7ed957] ring-1 ring-[#7ed957]'
                      : 'border-gray-800 hover:border-gray-600'
                    }`}
                  onClick={() => isSelectionMode ? toggleSelection(image.id) : setSelectedImage(image)}
                >
                  {isSelectionMode && (
                    <div className="absolute top-2 left-2 z-10">
                      <div className={`w-5 h-5 rounded border transition-colors flex items-center justify-center ${selectedIds.has(image.id) ? 'bg-[#7ed957] border-[#7ed957]' : 'bg-black/50 border-white/50'
                        }`}>
                        {selectedIds.has(image.id) && (
                          <svg className="w-3.5 h-3.5 text-[#0a0f0d]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </div>
                  )}
                  <img
                    src={image.thumbnail || image.url}
                    alt={image.prompt}
                    className={`w-full h-full object-cover transition-opacity ${isSelectionMode && selectedIds.has(image.id) ? 'opacity-40' : 'group-hover:opacity-90'}`}
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0f1512] via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-3 space-y-2">
                      <p className="text-white text-xs font-bold line-clamp-2">{image.prompt}</p>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[#7ed957] text-[10px] font-bold">
                          {new Date(image.timestamp).toLocaleDateString('cs-CZ')}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(image.id);
                          }}
                          className="p-1.5 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded-md transition-all"
                          title="Delete"
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
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md p-4 animate-fadeIn"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-7xl max-h-full flex flex-col w-full" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 p-6 z-10 flex justify-between items-start pointer-events-none">
              <div className="bg-black/50 backdrop-blur-md rounded-lg p-4 pointer-events-auto border border-white/10 max-w-2xl">
                <p className="text-white font-bold text-lg mb-1">{selectedImage.prompt}</p>
                <div className="flex items-center gap-3 text-sm text-gray-400">
                  <span>{new Date(selectedImage.timestamp).toLocaleString('cs-CZ')}</span>
                  {selectedImage.resolution && <span className="text-[#7ed957]">• {selectedImage.resolution}</span>}
                  {selectedImage.aspectRatio && <span>• {selectedImage.aspectRatio}</span>}
                </div>
              </div>

              <button
                onClick={() => setSelectedImage(null)}
                className="p-2 bg-black/50 hover:bg-white/20 text-white rounded-lg transition-all pointer-events-auto border border-white/10"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center overflow-hidden py-20">
              <img
                src={selectedImage.url}
                alt={selectedImage.prompt}
                className="max-w-full max-h-[80vh] object-contain rounded-lg shadow-2xl"
              />
            </div>

            {/* Actions */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center pointer-events-none">
              <div className="flex items-center gap-3 bg-black/50 backdrop-blur-md p-2 rounded-xl border border-white/10 pointer-events-auto">
                <a
                  href={selectedImage.url}
                  download={`${selectedImage.id}.jpg`}
                  className="px-6 py-3 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] font-bold text-sm uppercase tracking-wider rounded-lg transition-all shadow-lg"
                  onClick={(e) => e.stopPropagation()}
                >
                  Download
                </a>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(selectedImage.id);
                  }}
                  className="px-6 py-3 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white font-bold text-sm uppercase tracking-wider rounded-lg transition-all"
                >
                  Delete
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
        <div className="fixed top-4 right-4 z-[70] bg-[#0f1512] border border-[#7ed957] rounded-lg shadow-2xl shadow-[#7ed957]/10 px-6 py-4 animate-fadeIn">
          <p className="text-sm font-bold text-gray-200 flex items-center gap-2">
            {notification.startsWith('✅') ? (
              <span className="text-[#7ed957]">{notification}</span>
            ) : (
              <span className="text-red-500">{notification}</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
};
