import toast from 'react-hot-toast';
import type { ToastOptions } from 'react-hot-toast';
import { ToastrCard } from '@/components/ui/toastr-card';
import type { ToastType } from '@/components/ui/toastr-card';

const DEFAULT_DURATION = 4000;

function show(type: ToastType, message: string, opts?: ToastOptions): string {
  const duration = opts?.duration ?? DEFAULT_DURATION;
  let id = '';
  id = toast.custom(
    <ToastrCard
      type={type}
      message={message}
      duration={duration}
      createdAt={Date.now()}
      onClose={() => toast.dismiss(id)}
    />,
    { ...opts, duration }
  );
  return id;
}

const toastr = {
  success: (message: string, opts?: ToastOptions) => show('success', message, opts),
  error: (message: string, opts?: ToastOptions) => show('error', message, opts),
  warning: (message: string, opts?: ToastOptions) => show('warning', message, opts),
  info: (message: string, opts?: ToastOptions) => show('info', message, opts),
  // Passthroughs for API parity (kept so any future direct usage still works
  // and gets the token-styled default DOM from <Toaster> in main.tsx).
  loading: toast.loading.bind(toast),
  promise: toast.promise.bind(toast),
  custom: toast.custom.bind(toast),
  dismiss: toast.dismiss.bind(toast),
  remove: toast.remove.bind(toast),
};

export default toastr;
