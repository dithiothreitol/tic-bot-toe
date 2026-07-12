import { useEffect, useRef } from 'react';
import { toast } from 'sonner';

import { apiPost } from '@/api/client';
import { TURNSTILE_SITE_KEY, loadTurnstile } from '@/auth/turnstile';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { pl } from '@/i18n/pl';
import { cancelSession, resolveSession, useSession } from '@/store/session';

export function TurnstileDialog() {
  const open = useSession((s) => s.promptOpen);
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let api: Awaited<ReturnType<typeof loadTurnstile>> | null = null;

    loadTurnstile()
      .then((t) => {
        if (cancelled || !containerRef.current) return;
        api = t;
        widgetIdRef.current = t.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme: 'dark',
          callback: (token) => {
            apiPost<{ token: string; expiresIn: number }>('/api/verify', { token })
              .then(({ token: jwt, expiresIn }) => resolveSession(jwt, expiresIn))
              .catch(() => {
                toast.error(pl.session.verifyFailed);
                cancelSession();
              });
          },
          'error-callback': () => toast.error(pl.session.verifyFailed),
        });
      })
      .catch(() => {
        toast.error(pl.session.turnstileLoadFailed);
        cancelSession();
      });

    return () => {
      cancelled = true;
      if (api && widgetIdRef.current) {
        try {
          api.remove(widgetIdRef.current);
        } catch {
          // widget already gone
        }
        widgetIdRef.current = null;
      }
    };
  }, [open]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) cancelSession();
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{pl.session.verifyTitle}</DialogTitle>
          <DialogDescription>{pl.session.verifyDesc}</DialogDescription>
        </DialogHeader>
        <div ref={containerRef} className="flex min-h-[70px] justify-center py-2" />
      </DialogContent>
    </Dialog>
  );
}
