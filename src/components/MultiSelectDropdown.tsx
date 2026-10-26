import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';

export interface MultiSelectOption {
  id: string;
  label: string;
}

interface MultiSelectDropdownProps {
  value: string[];
  options: MultiSelectOption[];
  onChange: (value: string[]) => void;
  allLabel: string;
  placeholder?: string;
}

export default function MultiSelectDropdown({
  value,
  options,
  onChange,
  allLabel,
  placeholder = 'Selecionar'
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen]);

  const toggleOption = (id: string) => {
    if (id === 'all') {
      onChange([]);
      return;
    }

    onChange(value.includes(id) ? value.filter(item => item !== id) : [...value, id]);
  };

  const selectedLabels = options.filter(option => value.includes(option.id)).map(option => option.label);
  const summary = selectedLabels.length === 0
    ? allLabel
    : selectedLabels.length === 1
      ? selectedLabels[0]
      : `${selectedLabels.length} selecionados`;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
        className="w-full h-11 bg-neutral-50 border border-surface-border text-xs font-bold rounded-lg px-3 outline-none focus:border-primary flex items-center justify-between gap-2 text-left"
      >
        <span className="truncate">{summary || placeholder}</span>
        <ChevronDown className={`w-4 h-4 shrink-0 text-neutral-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute z-30 top-[calc(100%+4px)] left-0 right-0 max-h-64 overflow-y-auto rounded-xl border border-neutral-200 bg-white p-1.5 shadow-xl">
          <button
            type="button"
            role="option"
            aria-selected={value.length === 0}
            onClick={() => toggleOption('all')}
            className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold flex items-center gap-2 hover:bg-neutral-50 ${value.length === 0 ? 'text-primary' : 'text-neutral-600'}`}
          >
            <span className={`w-4 h-4 rounded border flex items-center justify-center ${value.length === 0 ? 'border-primary bg-primary text-white' : 'border-neutral-300'}`}>
              {value.length === 0 && <Check className="w-3 h-3" />}
            </span>
            {allLabel}
          </button>
          {options.map(option => {
            const isSelected = value.includes(option.id);
            return (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => toggleOption(option.id)}
                className={`w-full rounded-lg px-3 py-2 text-left text-xs font-bold flex items-center gap-2 hover:bg-neutral-50 ${isSelected ? 'text-primary' : 'text-neutral-600'}`}
              >
                <span className={`w-4 h-4 rounded border flex items-center justify-center ${isSelected ? 'border-primary bg-primary text-white' : 'border-neutral-300'}`}>
                  {isSelected && <Check className="w-3 h-3" />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
