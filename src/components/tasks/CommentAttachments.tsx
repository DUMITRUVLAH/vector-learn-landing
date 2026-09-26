// Atașamentele unui comentariu.
//
// Fișierele stau într-un spațiu privat. De aceea linkurile trec mereu prin
// server (`attachmentUrl`), care verifică accesul la task la fiecare
// deschidere — nu se construiesc din URL public: un URL public ar scurge
// fișierul oricui îl primește, indiferent de workspace.

import { useState } from 'react';
import { Download, ExternalLink, FileText, Paperclip, X } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/tasks/ui';
import { cn } from '@/lib/utils';
import { useTasksT } from '@/lib/tasks/useTasksT';
import { toast } from '@/lib/tasks/toast';
import { attachmentUrl, type CommentAttachment } from '@/lib/tasks/api';

function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface CommentAttachmentsProps {
  /**
   * Task-ul comentariului. Adresa fișierului trece prin el: serverul deschide
   * atașamentul doar cui vede task-ul. Adresa e pe aceeași origine, deci o
   * miniatură o poate folosi direct ca `src`, fără să ceară întâi o semnătură.
   */
  taskId: string;
  attachments: CommentAttachment[];
}

/** Lista de atașamente salvate pe un comentariu. */
export function CommentAttachments({ taskId, attachments }: CommentAttachmentsProps) {
  const { t } = useTasksT();
  /* Imaginea deschisă ÎN aplicație. Un `window.open` scotea utilizatorul din task într-un
     tab nou, iar întoarcerea însemna reîncărcarea aplicației — pentru o poză. */
  const [preview, setPreview] = useState<{ url: string; name: string } | null>(null);

  if (!attachments || attachments.length === 0) return null;

  const images = attachments.filter((a) => a.type?.startsWith('image/'));
  const files = attachments.filter((a) => !a.type?.startsWith('image/'));

  return (
    <>
      {images.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {images.map((attachment) => {
            const url = attachmentUrl(taskId, attachment.path);
            return (
              <button
                key={attachment.path}
                type="button"
                onClick={() => setPreview({ url, name: attachment.name })}
                title={attachment.name}
                className="group relative h-24 w-24 overflow-hidden rounded-lg border bg-muted transition-shadow hover:shadow-md disabled:cursor-default"
              >
                <img
                  src={url}
                  alt={attachment.name}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              </button>
            );
          })}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {files.map((attachment) => (
            <a
              key={attachment.path}
              href={attachmentUrl(taskId, attachment.path)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] transition-colors hover:bg-accent"
            >
              <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{attachment.name}</span>
              <span className="shrink-0 text-muted-foreground">{humanSize(attachment.size)}</span>
            </a>
          ))}
        </div>
      )}

      <Dialog open={!!preview} onOpenChange={(open) => !open && setPreview(null)}>
        <DialogContent className="max-w-[min(96vw,1100px)] gap-0 p-0">
          <DialogTitle className="flex items-center gap-2 border-b px-4 py-2.5 pr-12 text-sm font-medium">
            <span className="min-w-0 truncate">{preview?.name}</span>
            {preview && (
              <span className="ml-auto flex shrink-0 items-center gap-1">
                {/* Descărcarea și tabul nou rămân disponibile — doar nu mai sunt OBLIGATORII. */}
                <a
                  href={preview.url}
                  download={preview.name}
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title={t('board.attachments.download')}
                  aria-label={t('board.attachments.download')}
                >
                  <Download className="h-4 w-4" />
                </a>
                <a
                  href={preview.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  title={t('board.attachments.openInTab')}
                  aria-label={t('board.attachments.openInTab')}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </span>
            )}
          </DialogTitle>
          {preview && (
            <div className="max-h-[80vh] overflow-auto bg-muted/30 p-2">
              <img src={preview.url} alt={preview.name} className="mx-auto max-w-full" />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

interface AttachmentPickerProps {
  files: File[];
  onChange: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

/** Selectorul de fișiere din compozitorul de comentarii. */
export function AttachmentPicker({ files, onChange, disabled, className }: AttachmentPickerProps) {
  const { t } = useTasksT();
  const MAX_MB = 10;

  return (
    <div className={cn('space-y-1', className)}>
      {files.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {files.map((file, index) => (
            <span
              key={`${file.name}-${index}`}
              className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px]"
            >
              <span className="max-w-[140px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => onChange(files.filter((_, i) => i !== index))}
                className="text-muted-foreground hover:text-destructive"
                aria-label={t('board.attachments.remove', { defaultValue: 'Elimină fișierul' })}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          ))}
        </div>
      )}

      <label
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground',
          disabled && 'pointer-events-none opacity-50',
        )}
      >
        <Paperclip className="h-3 w-3" />
        {t('board.attachments.attach')}
        <input
          type="file"
          multiple
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const picked = Array.from(e.target.files ?? []);
            // Limita e verificată aici pentru un mesaj clar; serverul are
            // oricum propriile limite, dar acolo eroarea e criptică.
            const tooBig = picked.filter((f) => f.size > MAX_MB * 1024 * 1024);
            if (tooBig.length > 0) {
              toast.error(t('board.attachments.tooBig', { mb: MAX_MB }));
            }
            onChange([...files, ...picked.filter((f) => f.size <= MAX_MB * 1024 * 1024)]);
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}
