import Toast from 'react-native-toast-message';

type ToastType = 'success' | 'error' | 'info';

export function showToast(type: ToastType, title: string, message?: string) {
  Toast.show({
    type,
    text1: title,
    text2: message,
    position: 'top',
    visibilityTime: 3500,
  });
}

export function showErrorToast(title: string, message?: string) {
  showToast('error', title, message);
}

export function showSuccessToast(title: string, message?: string) {
  showToast('success', title, message);
}

export function showInfoToast(title: string, message?: string) {
  showToast('info', title, message);
}
