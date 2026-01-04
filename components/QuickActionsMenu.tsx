import React, { useEffect, useRef } from 'react';

export interface QuickAction {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  className?: string;
  dangerous?: boolean;
}

interface QuickActionsMenuProps {
  isOpen: boolean;
  onClose: () => void;
  position: { x: number; y: number };
  actions: QuickAction[];
}

export const QuickActionsMenu: React.FC<QuickActionsMenuProps> = ({
  isOpen,
  onClose,
  position,
  actions,
}) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen && menuRef.current) {
      // Adjust position if menu goes outside viewport
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let adjustedX = position.x;
      let adjustedY = position.y;

      if (rect.right > viewportWidth) {
        adjustedX = position.x - rect.width;
      }

      if (rect.bottom > viewportHeight) {
        adjustedY = position.y - rect.height;
      }

      menuRef.current.style.left = `${adjustedX}px`;
      menuRef.current.style.top = `${adjustedY}px`;
    }
  }, [isOpen, position]);

  if (!isOpen) return null;

  return (
    <div
      ref={menuRef}
      className="fixed z-[100] bg-white border-2 border-monstera-300 rounded-lg shadow-2xl py-1 min-w-[180px] animate-fadeIn"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
      }}
    >
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={() => {
            action.onClick();
            onClose();
          }}
          className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-all ${
            action.dangerous
              ? 'text-red-600 hover:bg-red-50'
              : 'text-ink hover:bg-monstera-50'
          } ${action.className || ''}`}
        >
          <div className="flex-shrink-0 w-4 h-4">
            {action.icon}
          </div>
          <span className="text-[11px] font-bold">
            {action.label}
          </span>
        </button>
      ))}
    </div>
  );
};
