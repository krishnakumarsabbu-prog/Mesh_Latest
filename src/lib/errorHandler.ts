import { AxiosError } from 'axios';
import { notify } from '@/store/notificationStore';

export function handleApiError(error: unknown, fallbackMessage = 'An error occurred'): string {
  if (error instanceof Error) {
    const axiosError = error as AxiosError<{ detail?: string; errors?: Array<{ field: string; message: string }> }>;

    if (axiosError.response) {
      const data = axiosError.response.data;

      if (axiosError.response.status === 401) {
        return 'Authentication required. Please sign in.';
      }
      if (axiosError.response.status === 403) {
        return 'You do not have permission to perform this action.';
      }
      if (axiosError.response.status === 404) {
        return data?.detail || 'Resource not found.';
      }
      if (axiosError.response.status === 409) {
        return data?.detail || 'This resource already exists.';
      }
      if (axiosError.response.status === 422) {
        if (data?.errors?.length) {
          return data.errors.map((e) => `${e.field}: ${e.message}`).join(', ');
        }
        return data?.detail || 'Validation failed.';
      }
      if (axiosError.response.status >= 500) {
        return 'Server error. Please try again later.';
      }
      return data?.detail || fallbackMessage;
    }

    if (axiosError.code === 'ECONNABORTED' || axiosError.message?.includes('timeout')) {
      return 'Request timed out. Please check your connection.';
    }

    if (!axiosError.response && axiosError.request) {
      return 'Unable to connect to the server. Please check your network.';
    }
  }

  return fallbackMessage;
}

export function notifyError(error: unknown, title = 'Error'): void {
  const message = handleApiError(error);
  notify.error(title, message);
}
