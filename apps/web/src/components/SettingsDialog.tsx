import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { OpenRouterKeyHelp } from '@/components/OpenRouterKeyHelp';
import { PlayerProfile } from '@/components/PlayerProfile';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { pl } from '@/i18n/pl';
import { testOpenRouterKey } from '@/providers/openrouter';
import { useSettings } from '@/store/settings';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const openRouterKey = useSettings((s) => s.openRouterKey);
  const setOpenRouterKey = useSettings((s) => s.setOpenRouterKey);
  const clearOpenRouterKey = useSettings((s) => s.clearOpenRouterKey);
  const soundEnabled = useSettings((s) => s.soundEnabled);
  const setSoundEnabled = useSettings((s) => s.setSoundEnabled);

  const [draftKey, setDraftKey] = useState(openRouterKey ?? '');
  const [testing, setTesting] = useState(false);

  useEffect(() => {
    if (open) setDraftKey(openRouterKey ?? '');
  }, [open, openRouterKey]);

  const save = () => {
    setOpenRouterKey(draftKey);
    toast.success(pl.settings.keySaved);
  };

  const remove = () => {
    clearOpenRouterKey();
    setDraftKey('');
    toast.success(pl.settings.keyRemoved);
  };

  const test = async () => {
    setTesting(true);
    const ok = await testOpenRouterKey(draftKey.trim());
    setTesting(false);
    if (ok) toast.success(pl.settings.keyValid);
    else toast.error(pl.settings.keyInvalid);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pl.settings.title}</DialogTitle>
          <DialogDescription>{pl.settings.keyLocalOnly}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <Label htmlFor="or-key">{pl.settings.openRouterKey}</Label>
            <Input
              id="or-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              placeholder={pl.settings.keyPlaceholder}
              className="font-mono"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" onClick={save} disabled={!draftKey.trim()}>
                {pl.settings.save}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={test}
                disabled={!draftKey.trim() || testing}
              >
                {pl.settings.test}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={remove}
                disabled={!openRouterKey}
              >
                {pl.settings.remove}
              </Button>
            </div>
            <OpenRouterKeyHelp className="mt-1" />
          </div>

          <PlayerProfile />

          <div className="flex items-center justify-between">
            <Label htmlFor="sound">{pl.settings.sound}</Label>
            <Switch id="sound" checked={soundEnabled} onCheckedChange={setSoundEnabled} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
