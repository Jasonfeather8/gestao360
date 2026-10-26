import React, { ButtonHTMLAttributes, ReactNode } from 'react';
import styled from 'styled-components';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children?: ReactNode;
}

export const Button: React.FC<ButtonProps> = ({ children, className, ...props }) => {
  return (
    <StyledWrapper className={className}>
      <button className="Btn" {...props}>
        {children}
      </button>
    </StyledWrapper>
  );
}

const StyledWrapper = styled.div`
  display: inline-flex;
  
  .Btn {
    min-width: 130px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background-color: rgb(15, 15, 15);
    border: none;
    color: white;
    font-weight: 700;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    gap: 8px;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    position: relative;
    overflow: hidden;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    padding: 0 24px;
    border-radius: 12px;
  }

  /* Support for Tailwind background overrides */
  &.bg-neutral-900 .Btn { background-color: #171717; }
  &.bg-primary .Btn { background-color: var(--primary); }

  .Btn svg {
    width: 16px;
    fill: currentColor;
  }

  .Btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
    filter: grayscale(1);
  }

  .Btn::before {
    width: 100%;
    height: 130px;
    position: absolute;
    content: "";
    background-color: rgba(255, 255, 255, 0.1);
    border-radius: 50%;
    left: -100%;
    top: 0;
    transition-duration: .4s;
  }

  .Btn:hover:not(:disabled)::before {
    transform: translate(100%,-50%);
    border-radius: 0;
  }

  .Btn:active:not(:disabled) {
    transform: scale(0.96);
  }
`;

export default Button;