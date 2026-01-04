import React, { useState, useEffect } from 'react';
import { CollectionsDB, Collection } from '../utils/collectionsDB';

interface CollectionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedImageIds?: string[];
  onAddToCollection?: (collectionId: string) => void;
}

const PRESET_COLORS = [
  '#f87171', // red
  '#fb923c', // orange
  '#fbbf24', // yellow
  '#a3e635', // lime
  '#4ade80', // green
  '#22d3ee', // cyan
  '#60a5fa', // blue
  '#a78bfa', // violet
  '#f472b6', // pink
];

export const CollectionsModal: React.FC<CollectionsModalProps> = ({
  isOpen,
  onClose,
  selectedImageIds = [],
  onAddToCollection,
}) => {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [newCollectionName, setNewCollectionName] = useState('');
  const [newCollectionDescription, setNewCollectionDescription] = useState('');
  const [selectedColor, setSelectedColor] = useState(PRESET_COLORS[0]);
  const [editingCollection, setEditingCollection] = useState<Collection | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadCollections();
    }
  }, [isOpen]);

  const loadCollections = () => {
    const allCollections = CollectionsDB.getAll();
    setCollections(allCollections);
  };

  const handleCreateCollection = () => {
    if (!newCollectionName.trim()) return;

    CollectionsDB.create(newCollectionName, newCollectionDescription, selectedColor);
    setNewCollectionName('');
    setNewCollectionDescription('');
    setSelectedColor(PRESET_COLORS[0]);
    setIsCreating(false);
    loadCollections();
  };

  const handleDeleteCollection = (id: string) => {
    if (window.confirm('Opravdu chcete smazat tuto kolekci?')) {
      CollectionsDB.delete(id);
      loadCollections();
    }
  };

  const handleAddImagesToCollection = (collectionId: string) => {
    if (selectedImageIds.length > 0) {
      CollectionsDB.addImages(collectionId, selectedImageIds);
      if (onAddToCollection) {
        onAddToCollection(collectionId);
      }
      loadCollections();
    }
  };

  const handleUpdateCollection = () => {
    if (!editingCollection) return;

    CollectionsDB.update(editingCollection.id, {
      name: editingCollection.name,
      description: editingCollection.description,
      color: editingCollection.color,
    });

    setEditingCollection(null);
    loadCollections();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border-2 border-monstera-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-monstera-200 bg-monstera-50">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-monstera-800" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h2 className="text-base font-black uppercase tracking-widest text-ink">Kolekce</h2>
            {selectedImageIds.length > 0 && (
              <span className="px-2 py-1 bg-monstera-400 text-ink text-[9px] font-black uppercase rounded">
                {selectedImageIds.length} vybraných
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-monstera-600 hover:text-ink hover:bg-monstera-100 rounded-md transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {/* Create New Collection */}
          <div className="mb-6">
            {!isCreating ? (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-br from-monstera-300 to-monstera-400 hover:from-monstera-400 hover:to-monstera-500 text-ink font-black text-[10px] uppercase tracking-widest rounded-md border-2 border-ink shadow-md transition-all"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Vytvořit novou kolekci
              </button>
            ) : (
              <div className="bg-monstera-50 border border-monstera-200 rounded-lg p-4 space-y-3">
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Název kolekce"
                  className="w-full px-3 py-2 border border-monstera-300 rounded-md text-sm font-medium outline-none focus:border-monstera-500"
                  autoFocus
                />
                <textarea
                  value={newCollectionDescription}
                  onChange={(e) => setNewCollectionDescription(e.target.value)}
                  placeholder="Popis (volitelné)"
                  className="w-full px-3 py-2 border border-monstera-300 rounded-md text-sm font-medium outline-none focus:border-monstera-500 resize-none"
                  rows={2}
                />

                <div className="space-y-2">
                  <label className="text-[9px] font-black text-monstera-600 uppercase tracking-widest">Barva</label>
                  <div className="flex gap-2">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`w-8 h-8 rounded-md transition-all border-2 ${selectedColor === color ? 'border-ink scale-110' : 'border-monstera-200'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleCreateCollection}
                    disabled={!newCollectionName.trim()}
                    className="flex-1 px-4 py-2 bg-ink text-white font-black text-[9px] uppercase tracking-widest rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Vytvořit
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false);
                      setNewCollectionName('');
                      setNewCollectionDescription('');
                    }}
                    className="px-4 py-2 bg-white text-monstera-600 font-black text-[9px] uppercase tracking-widest rounded-md border border-monstera-200"
                  >
                    Zrušit
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Collections List */}
          {collections.length === 0 ? (
            <div className="py-12 text-center text-monstera-400">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-sm font-medium">Zatím žádné kolekce</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {collections.map(collection => (
                <div
                  key={collection.id}
                  className="bg-white border-2 border-monstera-200 rounded-lg p-4 hover:border-monstera-300 transition-all"
                  style={{ borderLeftWidth: '6px', borderLeftColor: collection.color }}
                >
                  {editingCollection?.id === collection.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editingCollection.name}
                        onChange={(e) => setEditingCollection({ ...editingCollection, name: e.target.value })}
                        className="w-full px-3 py-2 border border-monstera-300 rounded-md text-sm font-medium outline-none focus:border-monstera-500"
                      />
                      <textarea
                        value={editingCollection.description || ''}
                        onChange={(e) => setEditingCollection({ ...editingCollection, description: e.target.value })}
                        className="w-full px-3 py-2 border border-monstera-300 rounded-md text-sm font-medium outline-none focus:border-monstera-500 resize-none"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdateCollection}
                          className="flex-1 px-3 py-2 bg-ink text-white font-black text-[9px] uppercase rounded-md"
                        >
                          Uložit
                        </button>
                        <button
                          onClick={() => setEditingCollection(null)}
                          className="px-3 py-2 bg-white text-monstera-600 font-black text-[9px] uppercase rounded-md border border-monstera-200"
                        >
                          Zrušit
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-black text-sm text-ink mb-1">{collection.name}</h3>
                          {collection.description && (
                            <p className="text-xs text-monstera-600">{collection.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {selectedImageIds.length > 0 && (
                            <button
                              onClick={() => handleAddImagesToCollection(collection.id)}
                              className="p-2 text-monstera-600 hover:text-ink hover:bg-monstera-100 rounded-md transition-all"
                              title="Přidat vybrané obrázky"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => setEditingCollection(collection)}
                            className="p-2 text-monstera-600 hover:text-ink hover:bg-monstera-100 rounded-md transition-all"
                            title="Upravit"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteCollection(collection.id)}
                            className="p-2 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-all"
                            title="Smazat"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-[10px] text-monstera-500">
                        <div className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>{collection.imageIds.length} obrázků</span>
                        </div>
                        <div className="text-[9px] text-monstera-400">
                          Vytvořeno {new Date(collection.createdAt).toLocaleDateString('cs-CZ')}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
