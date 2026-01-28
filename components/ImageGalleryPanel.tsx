import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { Upload, X } from 'lucide-react';
import { getAllImages, deleteImage, GalleryImage } from '../utils/galleryDB';
import { ImageDatabase, StoredImage } from '../utils/imageDatabase';

interface ImageGalleryPanelProps {
  onDragStart?: (image: { url: string; fileName: string; fileType: string }, imageType: 'saved' | 'generated') => void;
  onBatchProcess?: (images: StoredImage[]) => void;
}

export interface ImageGalleryPanelRef {
  refresh: () => Promise<void>;
}

type TabType = 'saved' | 'generated';

export const ImageGalleryPanel = forwardRef<ImageGalleryPanelRef, ImageGalleryPanelProps>(({ onDragStart, onBatchProcess }, ref) => {
  const [activeTab, setActiveTab] = useState<TabType>('saved');
  const [savedImages, setSavedImages] = useState<StoredImage[]>([]);
  const [generatedImages, setGeneratedImages] = useState<GalleryImage[]>([]);
  const [selectedImage, setSelectedImage] = useState<GalleryImage | null>(null);
  const [selectedImages, setSelectedImages] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    setLoading(true);
    try {
      // Načíst uložené obrázky z Supabase
      const saved = await ImageDatabase.getAll();
      saved.sort((a, b) => b.timestamp - a.timestamp);
      setSavedImages(saved);

      // Načíst vygenerované obrázky z Supabase
      const generated = await getAllImages();
      setGeneratedImages(generated);
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  };

  // Expose refresh method to parent
  useImperativeHandle(ref, () => ({
    refresh: loadImages
  }));

  // Multi-select handlers
  const toggleSelection = (imageId: string) => {
    setSelectedImages(prev => {
      const newSet = new Set(prev);
      if (newSet.has(imageId)) {
        newSet.delete(imageId);
      } else {
        newSet.add(imageId);
      }
      return newSet;
    });
  };

  const clearSelection = () => {
    setSelectedImages(new Set());
  };

  const handleBatchProcess = () => {
    const selected = savedImages.filter(img => selectedImages.has(img.id));
    if (selected.length > 0 && onBatchProcess) {
      onBatchProcess(selected);
      clearSelection();
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
      fileType: 'fileType' in image ? image.fileType : 'image/jpeg',
      prompt: 'prompt' in image ? image.prompt : undefined // Přidat prompt z vygenerovaných obrázků
    };

    e.dataTransfer.setData('application/json', JSON.stringify(imageData));
    e.dataTransfer.setData('text/plain', image.url);

    if (onDragStart) {
      onDragStart(imageData, type);
    }
  };

  const handleDeleteSaved = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await ImageDatabase.remove(id);
      await loadImages();
    } catch (error) {
      console.error('Error deleting image:', error);
      alert('Chyba při mazání obrázku');
    }
  };

  const handleDeleteGenerated = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteImage(id);
      await loadImages();
    } catch (error) {
      console.error('Error deleting generated image:', error);
      alert('Chyba při mazání obrázku');
    }
  };

  const renderSavedTab = () => {
    if (savedImages.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center h-full py-20 px-4 text-center">
          <div className="w-16 h-16 bg-[#0f1512]/50 rounded-lg flex items-center justify-center mb-4 border border-gray-800">
            <Upload className="w-8 h-8 text-gray-600" />
          </div>
          <p className="text-sm font-bold text-gray-300 mb-2">Žádné obrázky</p>
          <p className="text-xs text-gray-500 mb-4">Nahrajte obrázky z počítače</p>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-4 py-2 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] font-bold text-xs uppercase tracking-widest rounded transition-all shadow-md hover:shadow-[#7ed957]/20"
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
            className="group relative aspect-square bg-[#0f1512] rounded-lg overflow-hidden border border-gray-800 hover:border-[#7ed957] transition-all cursor-move shadow-sm hover:shadow-lg hover:shadow-[#7ed957]/10"
            title="Přetáhněte do referenčního nebo stylového pole"
          >
            {/* Checkbox for multi-select */}
            <div className="absolute top-2 left-2 z-10" onClick={(e) => e.stopPropagation()}>
              <div
                onClick={() => toggleSelection(image.id)}
                className={`w-5 h-5 cursor-pointer rounded border transition-all flex items-center justify-center ${selectedImages.has(image.id)
                  ? 'bg-[#7ed957] border-[#7ed957] text-[#0a0f0d]'
                  : 'bg-black/40 border-gray-700 hover:border-gray-500 text-transparent'
                  }`}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>

            <img
              src={image.url}
              alt={image.fileName}
              className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-2 space-y-1">
                <p className="text-gray-200 text-[9px] font-bold truncate" title={image.fileName}>
                  {image.fileName}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-[8px] font-bold">
                    {new Date(image.timestamp).toLocaleDateString('cs-CZ')}
                  </span>
                  <button
                    onClick={(e) => handleDeleteSaved(image.id, e)}
                    className="p-1.5 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded transition-all backdrop-blur-sm"
                    title="Smazat"
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                </div>
              </div>
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
          <div className="w-16 h-16 bg-[#0f1512]/50 rounded-lg flex items-center justify-center mb-4 border border-gray-800 grayscale opacity-30">
            <span className="text-3xl">🍌</span>
          </div>
          <p className="text-sm font-bold text-gray-300 mb-1">Žádné vygenerované obrázky</p>
          <p className="text-xs text-gray-500">Vygenerované obrázky se zobrazí zde</p>
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
            className="group relative aspect-square bg-[#0f1512] rounded-lg overflow-hidden border border-gray-800 hover:border-[#7ed957] transition-all cursor-pointer shadow-sm hover:shadow-lg hover:shadow-[#7ed957]/10"
            title="Klikněte pro velké zobrazení nebo přetáhněte do pole nalevo"
          >
            {image.isVideo ? (
              <>
                <video
                  src={image.url}
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                  muted
                  loop
                  playsInline
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                  <div className="bg-black/50 backdrop-blur rounded-full p-3 shadow-lg border border-gray-700">
                    <svg className="w-6 h-6 text-[#7ed957]" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </div>
                </div>
              </>
            ) : (
              <img
                src={image.url}
                alt={image.prompt}
                className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/0 to-black/0 opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="absolute bottom-0 left-0 right-0 p-2 space-y-1">
                <p className="text-gray-200 text-[9px] font-bold line-clamp-2" title={image.prompt}>
                  {image.prompt}
                </p>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-[8px] font-bold">
                    {new Date(image.timestamp).toLocaleDateString('cs-CZ')}
                  </span>
                  <button
                    onClick={(e) => handleDeleteGenerated(image.id, e)}
                    className="p-1.5 bg-red-500/20 hover:bg-red-500 text-red-500 hover:text-white rounded transition-all backdrop-blur-sm"
                    title="Smazat"
                  >
                    <X size={12} strokeWidth={3} />
                  </button>
                </div>
              </div>
            </div>
            {/* Drag indicator */}
            <div className="absolute top-2 right-2 bg-black/50 backdrop-blur rounded p-1 opacity-0 group-hover:opacity-100 transition-opacity border border-gray-700">
              <svg className="w-3 h-3 text-[#7ed957]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
              </svg>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-[#0f1512] rounded-lg border border-gray-800/50 overflow-hidden text-gray-100 font-sans">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800/50 bg-[#0f1512]">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-4 bg-[#7ed957] rounded-full shadow-[0_0_10px_rgba(126,217,87,0.5)]"></div>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Image Library</h3>
        </div>

        <div className="flex bg-[#0a0f0d] p-1 rounded-lg border border-gray-800/50">
          <button
            onClick={() => setActiveTab('saved')}
            className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all ${activeTab === 'saved'
              ? 'bg-[#1f2937] text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-300'
              }`}
          >
            Saved
          </button>
          <button
            onClick={() => setActiveTab('generated')}
            className={`px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider font-bold transition-all ${activeTab === 'generated'
              ? 'bg-[#1f2937] text-white shadow-sm'
              : 'text-gray-500 hover:text-gray-300'
              }`}
          >
            Generated
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-3 border-b border-gray-800/50 bg-[#0f1512]/50 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {selectedImages.size > 0 && (
            <div className="flex items-center gap-2 animate-fadeIn">
              <span className="text-xs text-gray-400 font-medium">Selected: <span className="text-white">{selectedImages.size}</span></span>
              {onBatchProcess && (
                <button
                  onClick={handleBatchProcess}
                  className="ml-2 px-2 py-1 bg-[#7ed957]/10 text-[#7ed957] text-[10px] font-bold uppercase tracking-wider rounded border border-[#7ed957]/20 hover:bg-[#7ed957]/20 transition-all"
                >
                  Download ZIP
                </button>
              )}
              <button
                onClick={clearSelection}
                className="px-2 py-1 bg-gray-800 text-gray-400 text-[10px] font-bold uppercase tracking-wider rounded hover:bg-gray-700 transition-all"
              >
                Clear
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            className="hidden"
            onChange={handleBulkUpload}
          />
          {activeTab === 'saved' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] text-[10px] font-bold uppercase tracking-wider rounded transition-all shadow-lg shadow-[#7ed957]/20"
            >
              <Upload size={14} strokeWidth={3} />
              <span>Upload</span>
            </button>
          )}
          <button
            onClick={loadImages}
            className="p-1.5 text-gray-500 hover:text-[#7ed957] transition-colors"
            title="Refresh"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar bg-[#0a0f0d]">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-6 h-6 border-2 border-[#7ed957] border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : (
          <>
            {activeTab === 'saved' && renderSavedTab()}
            {activeTab === 'generated' && renderGeneratedTab()}
          </>
        )}
      </div>

      {/* Footer / Status */}
      <div className="px-6 py-2 border-t border-gray-800/50 bg-[#0f1512] text-[10px] text-gray-500 font-medium flex justify-between">
        <span>{activeTab === 'saved' ? `${savedImages.length} saved images` : `${generatedImages.length} generated images`}</span>
        {loading && <span className="text-[#7ed957]">Syncing...</span>}
      </div>

      {/* Lightbox */}
      {selectedImage && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 backdrop-blur-md p-4"
          onClick={() => setSelectedImage(null)}
        >
          <div className="relative max-w-7xl max-h-full flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="absolute top-0 right-0 p-4 z-10">
              <button
                onClick={() => setSelectedImage(null)}
                className="p-2 bg-black/50 hover:bg-black/70 text-white rounded-full transition-all"
              >
                <X size={24} />
              </button>
            </div>
            <img
              src={selectedImage.url}
              alt="Selected"
              className="max-w-full max-h-[90vh] object-contain rounded-lg"
            />
          </div>
        </div>
      )}
    </div>
  );
});

ImageGalleryPanel.displayName = 'ImageGalleryPanel';

