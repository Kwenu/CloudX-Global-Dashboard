import React from 'react';
import { Toaster } from 'sonner';
import { useTheme } from '../../contexts/ThemeContext';

export function ThemedToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{ style: { fontFamily: 'Inter, system-ui, sans-serif' } }} />);


}