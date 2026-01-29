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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm animate-fadeIn">
      <div className="bg-[#0f1512] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-800">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-[#0f1512]/50">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-[#7ed957]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            <h2 className="text-base font-bold uppercase tracking-wider text-gray-200">Collections</h2>
            {selectedImageIds.length > 0 && (
              <span className="px-2 py-1 bg-[#7ed957]/10 border border-[#7ed957]/20 text-[#7ed957] text-[9px] font-bold uppercase rounded">
                {selectedImageIds.length} selected
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-white/5 rounded-lg transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-[#0f1512]/30">
          {/* Create New Collection */}
          <div className="mb-6">
            {!isCreating ? (
              <button
                onClick={() => setIsCreating(true)}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-[#7ed957] font-bold text-[10px] uppercase tracking-widest rounded-lg border border-gray-700 hover:border-[#7ed957]/50 transition-all border-dashed"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Create New Collection
              </button>
            ) : (
              <div className="bg-[#0f1512] border border-gray-800 rounded-lg p-4 space-y-3 shadow-lg">
                <input
                  type="text"
                  value={newCollectionName}
                  onChange={(e) => setNewCollectionName(e.target.value)}
                  placeholder="Collection Name"
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-gray-700 rounded-lg text-sm font-medium text-gray-200 outline-none focus:border-[#7ed957] focus:ring-1 focus:ring-[#7ed957]"
                  autoFocus
                />
                <textarea
                  value={newCollectionDescription}
                  onChange={(e) => setNewCollectionDescription(e.target.value)}
                  placeholder="Description (optional)"
                  className="w-full px-4 py-2 bg-[#0a0f0d] border border-gray-700 rounded-lg text-sm font-medium text-gray-200 outline-none focus:border-[#7ed957] focus:ring-1 focus:ring-[#7ed957] resize-none"
                  rows={2}
                />

                <div className="space-y-2">
                  <label className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">Color</label>
                  <div className="flex gap-2 flex-wrap">
                    {PRESET_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => setSelectedColor(color)}
                        className={`w-6 h-6 rounded-md transition-all border-2 ${selectedColor === color ? 'border-white scale-110 shadow-lg' : 'border-transparent opacity-70 hover:opacity-100 hover:scale-105'}`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex gap-2 pt-2">
                  <button
                    onClick={handleCreateCollection}
                    disabled={!newCollectionName.trim()}
                    className="flex-1 px-4 py-2 bg-[#7ed957] hover:bg-[#6bc547] text-[#0a0f0d] font-bold text-[9px] uppercase tracking-widest rounded-lg disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[#7ed957]/20"
                  >
                    Create
                  </button>
                  <button
                    onClick={() => {
                      setIsCreating(false);
                      setNewCollectionName('');
                      setNewCollectionDescription('');
                    }}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 font-bold text-[9px] uppercase tracking-widest rounded-lg border border-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Collections List */}
          {collections.length === 0 ? (
            <div className="py-12 text-center text-gray-600">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              <p className="text-sm font-medium">No collections yet</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {collections.map(collection => (
                <div
                  key={collection.id}
                  className="bg-[#0f1512] border border-gray-800 rounded-lg p-4 hover:border-gray-700 transition-all group"
                  style={{ borderLeftWidth: '4px', borderLeftColor: collection.color }}
                >
                  {editingCollection?.id === collection.id ? (
                    <div className="space-y-3">
                      <input
                        type="text"
                        value={editingCollection.name}
                        onChange={(e) => setEditingCollection({ ...editingCollection, name: e.target.value })}
                        className="w-full px-4 py-2 bg-[#0a0f0d] border border-gray-700 rounded-lg text-sm font-medium text-gray-200 outline-none focus:border-[#7ed957] focus:ring-1 focus:ring-[#7ed957]"
                      />
                      <textarea
                        value={editingCollection.description || ''}
                        onChange={(e) => setEditingCollection({ ...editingCollection, description: e.target.value })}
                        className="w-full px-4 py-2 bg-[#0a0f0d] border border-gray-700 rounded-lg text-sm font-medium text-gray-200 outline-none focus:border-[#7ed957] focus:ring-1 focus:ring-[#7ed957] resize-none"
                        rows={2}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={handleUpdateCollection}
                          className="flex-1 px-3 py-2 bg-[#7ed957] text-[#0a0f0d] font-bold text-[9px] uppercase tracking-widest rounded-lg hover:bg-[#6bc547]"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingCollection(null)}
                          className="px-3 py-2 bg-gray-800 text-gray-400 font-bold text-[9px] uppercase tracking-widest rounded-lg border border-gray-700 hover:bg-gray-700"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <h3 className="font-bold text-sm text-gray-200 mb-1">{collection.name}</h3>
                          {collection.description && (
                            <p className="text-xs text-gray-500">{collection.description}</p>
                          )}
                        </div>
                        <div className="flex gap-1 opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity">
                          {selectedImageIds.length > 0 && (
                            <button
                              onClick={() => handleAddImagesToCollection(collection.id)}
                              className="p-1.5 text-[#7ed957] hover:bg-[#7ed957]/10 rounded-md transition-all"
                              title="Add Selected Images"
                            >
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                              </svg>
                            </button>
                          )}
                          <button
                            onClick={() => setEditingCollection(collection)}
                            className="p-1.5 text-gray-500 hover:text-white hover:bg-white/5 rounded-md transition-all"
                            title="Edit"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                          </button>
                          <button
                            onClick={() => handleDeleteCollection(collection.id)}
                            className="p-1.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-md transition-all"
                            title="Delete"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-[10px] text-gray-500">
                        <div className="flex items-center gap-1">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span>{collection.imageIds.length} images</span>
                        </div>
                        <div className="text-[9px] text-gray-600">
                          {new Date(collection.createdAt).toLocaleDateString('cs-CZ')}
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
