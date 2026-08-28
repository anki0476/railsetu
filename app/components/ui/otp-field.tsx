'use client';

import { createContext, useContext, type InputHTMLAttributes, type ReactNode } from 'react';

type OTPContextValue = {
  length: number;
  value: string;
  onChange: (value: string) => void;
};

const OTPContext = createContext<OTPContextValue | null>(null);

type OTPFieldProps = {
  children: ReactNode;
  length: number;
  value: string;
  onChange: (value: string) => void;
  'aria-label'?: string;
};

export function OTPField({ children, length, value, onChange, 'aria-label': ariaLabel }: OTPFieldProps) {
  return (
    <div className="otp-field" role="group" aria-label={ariaLabel}>
      <OTPContext.Provider value={{ length, value, onChange }}>{children}</OTPContext.Provider>
    </div>
  );
}

type OTPFieldInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'maxLength'> & {
  index: number;
};

export function OTPFieldInput({ index, ...props }: OTPFieldInputProps) {
  const context = useContext(OTPContext);
  if (!context) throw new Error('OTPFieldInput must be used inside OTPField.');

  return (
    <input
      {...props}
      className="otp-field-input"
      inputMode="numeric"
      autoComplete={index === 0 ? 'one-time-code' : 'off'}
      maxLength={1}
      value={context.value[index] ?? ''}
      onChange={(event) => {
        const digit = event.target.value.replace(/\D/g, '').slice(-1);
        const digits = context.value.padEnd(context.length, ' ').split('');
        digits[index] = digit || ' ';
        context.onChange(digits.join('').trimEnd());
        if (digit) event.currentTarget.nextElementSibling instanceof HTMLInputElement && event.currentTarget.nextElementSibling.focus();
      }}
    />
  );
}
