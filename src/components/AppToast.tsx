import React from 'react';
import Toast, { BaseToast, type BaseToastProps } from 'react-native-toast-message';

const baseStyle = {
  borderLeftWidth: 3,
  backgroundColor: '#18181b',
  borderLeftColor: '#ffffff',
};

const text1Style = {
  fontSize: 15,
  fontWeight: '600' as const,
  color: '#ffffff',
};

const text2Style = {
  fontSize: 13,
  color: '#a1a1aa',
};

function SuccessToast(props: BaseToastProps) {
  return (
    <BaseToast
      {...props}
      style={baseStyle}
      contentContainerStyle={{ paddingHorizontal: 4 }}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  );
}

function ErrorToast(props: BaseToastProps) {
  return (
    <BaseToast
      {...props}
      style={{ ...baseStyle, borderLeftColor: '#ef4444' }}
      contentContainerStyle={{ paddingHorizontal: 4 }}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  );
}

function InfoToast(props: BaseToastProps) {
  return (
    <BaseToast
      {...props}
      style={{ ...baseStyle, borderLeftColor: '#71717a' }}
      contentContainerStyle={{ paddingHorizontal: 4 }}
      text1Style={text1Style}
      text2Style={text2Style}
    />
  );
}

const toastConfig = {
  success: SuccessToast,
  error: ErrorToast,
  info: InfoToast,
};

export function AppToast() {
  return <Toast config={toastConfig} topOffset={56} />;
}
