import React, { useState, useEffect } from 'react';
import { ImageDatabase, StoredImage } from '../utils/imageDatabase';

interface ImageLibraryProps {
  category: 'reference' | 'style';
  onImagesSelected: (images: { url: string; fileName: string; fileType: string }[]) => void;
  remainingSlots: number;
}

export const ImageLibrary: React.FC<ImageLibraryProps> = ({
  category,
  onImagesSelected,
  remainingSlots
}) => {
  const [images, setImages] = useState<StoredImage[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadImages();
  }, [category]);

  const loadImages = async () => {
    setIsLoading(true);
    try {
      const allImages = await ImageDatabase.getByCategoryAsync(category);
      // Seřaď od nejnovějších
      allImages.sort((a, b) => b.timestamp - a.timestamp);
      setImages(allImages);
    } catch (error) {
      console.error('Error loading images:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSelection = (image: StoredImage) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(image.id)) {
      newSelected.delete(image.id);
    } else {
      if (newSelected.size < remainingSlots) {
        newSelected.add(image.id);
      }
    }
    setSelectedIds(newSelected);
  };

  const handleAdd = () => {
    const selectedImages = images
      .filter(img => selectedIds.has(img.id))
      .map(img => ({
        url: img.url,
        fileName: img.fileName,
        fileType: img.fileType
      }));

    if (selectedImages.length > 0) {
      onImagesSelected(selectedImages);
      setSelectedIds(new Set());
    }
  };

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Opravdu chcete tento obrázek odstranit z databáze?')) {
      try {
        await ImageDatabase.remove(id);
        await loadImages();
        selectedIds.delete(id);
        setSelectedIds(new Set(selectedIds));
      } catch (error) {
        console.error('Error deleting image:', error);
        alert('Chyba při mazání obrázku');
      }
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-8 h-8 border-2 border-monstera-300 border-t-monstera-500 rounded-full animate-spin mb-4"></div>
        <p className="text-[10px] font-bold text-monstera-400 uppercase tracking-widest">
          Načítání obrázků...
        </p>
      </div>
    );
  }

  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
        <div className="w-16 h-16 bg-monstera-50 rounded-md flex items-center justify-center mb-4 border border-monstera-200">
          <svg className="w-8 h-8 text-monstera-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
        <p className="text-[10px] font-bold text-monstera-400 uppercase tracking-widest">
          Zatím žádné uložené obrázky
        </p>
        <p className="text-[8px] text-monstera-400 mt-1">
          Nahrajte obrázky z počítače a automaticky se uloží
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5 max-h-[300px] overflow-y-auto custom-scrollbar p-1">
        {images.map((image) => {
          const isSelected = selectedIds.has(image.id);
          return (
            <div
              key={image.id}
              onClick={() => toggleSelection(image)}
              className={`relative group aspect-square rounded-md overflow-hidden border-2 cursor-pointer transition-all shadow-sm ${
                isSelected
                  ? 'border-monstera-500 ring-2 ring-monstera-300 scale-95'
                  : 'border-monstera-200 hover:border-monstera-400 hover:shadow-md'
              }`}
            >
              <img
                src={image.url}
                alt={image.fileName}
                className="w-full h-full object-cover"
              />
              <div
                className={`absolute top-1 right-1 w-5 h-5 rounded-full border flex items-center justify-center transition-all backdrop-blur ${isSelected
                  ? 'bg-monstera-500 border-monstera-500 text-ink shadow-[0_0_0_3px_rgba(126,217,87,0.15)]'
                  : 'bg-black/20 border-white/10 text-white/70 opacity-0 group-hover:opacity-100'
                  }`}
              >
                <svg className={`w-3.5 h-3.5 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-40'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <button
                onClick={(e) => handleDelete(image.id, e)}
                className="absolute top-1 left-1 bg-red-500 text-white rounded-md p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-lg hover:bg-red-600"
                title="Smazat z databáze"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
              <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <p className="text-[7px] text-white font-bold truncate" title={image.fileName}>
                  {image.fileName}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 pt-2 border-t border-monstera-200">
          <span className="text-[9px] font-bold text-monstera-600 uppercase tracking-widest">
            Vybráno: {selectedIds.size} / {remainingSlots}
          </span>
          <button
            onClick={handleAdd}
            className="px-3 py-1.5 bg-monstera-400 hover:bg-monstera-500 text-ink font-black text-[9px] uppercase tracking-widest rounded-md transition-all active:scale-95 shadow-sm"
          >
            Přidat vybrané
          </button>
        </div>
      )}
    </div>
  );
};
