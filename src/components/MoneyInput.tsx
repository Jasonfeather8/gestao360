import React, { useRef, useEffect } from 'react';

interface MoneyInputProps {
  value: string;
  onChange: (value: string) => void;
  permitirNegativo?: boolean;
  className?: string;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
  disabled?: boolean;
  id?: string;
  'aria-label'?: string;
}

export default function MoneyInput({ value, onChange, permitirNegativo, className, placeholder, required, autoFocus, disabled, id, 'aria-label': ariaLabel }: MoneyInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const formatValue = (val: string) => {
    // O sinal só é preservado quando o campo permite negativo; sem a opção o
    // comportamento segue idêntico ao dos outros campos de dinheiro do sistema.
    const negativo = !!permitirNegativo && val.trim().startsWith('-');

    // Remove non-digits
    const digits = val.replace(/\D/g, '');
    if (!digits) return negativo ? '-' : '';

    // Convert to number and format
    const number = parseInt(digits, 10) / 100;
    const formatado = new Intl.NumberFormat('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(number);

    return negativo ? `-${formatado}` : formatado;
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawValue = e.target.value;
    const formatted = formatValue(rawValue);
    onChange(formatted);
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // If value is empty or 0,00, move cursor to end
    if (!value || value === '0,00') {
      const len = e.target.value.length;
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.setSelectionRange(len, len);
        }
      }, 0);
    }
  };

  return (
    <input
      ref={inputRef}
      id={id}
      aria-label={ariaLabel}
      type="text"
      value={value}
      onChange={handleChange}
      onFocus={handleFocus}
      className={className}
      placeholder={placeholder}
      required={required}
      autoFocus={autoFocus}
      disabled={disabled}
      inputMode={permitirNegativo ? 'decimal' : 'numeric'}
    />
  );

}
