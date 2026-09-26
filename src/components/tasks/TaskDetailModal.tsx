import { useEffect } from 'react';
import { Dialog, DialogContent, DialogTitle } from '@/components/tasks/ui';
import { useTasksT } from '@/lib/tasks/useTasksT';
import { TaskDetailPanel } from '@/components/tasks/TaskDetailPanel';
import type { BoardTask, TaskList } from '@/lib/tasks/types';

interface TaskDetailModalProps {
  task: BoardTask;
  lists: TaskList[];
  boardId: string | null;
  onClose: () => void;
  onOpenTask?: (taskId: string) => void;
  /** Are voie să scrie. Fals ⇒ panoul e read-only (vezi TaskDetailPanel). */
  canEdit?: boolean;
}

/**
 * Ține pagina lipită de zero cât timp cartonașul e deschis.
 *
 * Dialogul e `position: fixed`, deci se raportează la viewportul de LAYOUT. Pe
 * iOS, focalizarea unui câmp (titlu, comentariu, căutarea din selectorul de
 * colegi) face Safari să deruleze PAGINA ca să ridice câmpul deasupra
 * tastaturii — iar la închiderea tastaturii derularea rămâne. De-aici cele două
 * reclamații de pe 10-09-2026, care sunt același defect văzut din două părți:
 * capul cartonașului (titlul) tăiat sus și o bandă albă rămasă jos.
 *
 * `visualViewport` spune exact când s-a închis tastatura: înălțimea vizibilă
 * revine la cea a ferestrei. Atunci — și numai atunci — readucem pagina la zero.
 */
function usePinnedViewport() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const pin = () => {
      // Tastatura deschisă ⇒ derularea e a browserului, nu o atingem.
      if (vv.height < window.innerHeight - 4) return;
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
    vv.addEventListener('resize', pin);
    vv.addEventListener('scroll', pin);
    return () => {
      vv.removeEventListener('resize', pin);
      vv.removeEventListener('scroll', pin);
      // Și la închiderea cartonașului: dacă tastatura tocmai a dispărut, ecranul
      // de dedesubt ar rămâne derulat degeaba.
      if (window.scrollY !== 0) window.scrollTo(0, 0);
    };
  }, []);
}

/** Modalul unic de detaliu; Dialog asigură focus trap, Escape și overlay. */
export function TaskDetailModal(props: TaskDetailModalProps) {
  const { t } = useTasksT();
  usePinnedViewport();
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      {/*
        `DialogContent` e un `grid`, iar pistele lui implicite sunt `auto`, deci
        se dimensionează după CONȚINUT, nu după dialog. Amândouă axele trebuie
        plafonate explicit cu `minmax(0,1fr)`:
        - fără rânduri: `h-full` de pe panou dădea 1274px într-un dialog de
          513px, iar zona derulabilă nu se plafona niciodată (09-09-2026);
        - fără coloane: un subtask cu titlu lung lățea pista la 972px într-un
          dialog de 720px. Tot ce e înăuntru se întindea cu ea — de aici titlul
          și câmpul de responsabili „fără margine în dreapta" — iar `truncate`
          de pe rândul de subtask n-avea ce tăia, fiindcă îi ajungea lățimea
          (10-09-2026).
      */}
      {/*
        Pe TELEFON dialogul e ecran întreg, iar înălțimea e `dvh`, nu `vh`.
        Cu `92vh`: `vh` se măsoară pe viewportul mare, care NU se schimbă când apare
        tastatura (iOS). Deci la scrierea unui comentariu browserul derula el pagina ca
        să vadă câmpul, iar la închiderea tastaturii rămânea derulat — sub dialog apărea
        o bandă albă și nu te mai întorceai la task (raportat 10-09-2026).
        Ecran întreg + `dvh` scoate din ecuație și pagina de dedesubt, și bara browserului.
      */}
      {/*
        Pe telefon cartonașul e ANCORAT în colțul din stânga-sus, nu centrat.
        `DialogContent` vine centrat cu `top/left: 50%` + `translate(-50%,-50%)`,
        iar procentele alea se raportează la viewportul de LAYOUT, în timp ce
        `100dvh` măsoară viewportul VIZIBIL — două referințe diferite, deci pe
        iOS cartonașul ieșea cu capul (titlul) deasupra ecranului. Ancorat, nu
        mai există niciun calcul de centrare: colț la colț, înălțime `dvh`.
        `max-h-none` scoate din joc plafonul de `100dvh-2rem` moștenit de la
        primitivă, care lăsa oricum două dungi de overlay sus și jos.
        Centrarea se întoarce de la `sm` în sus, unde e o fereastră, nu un ecran.
      */}
      <DialogContent className="grid left-0 top-0 h-[100dvh] max-h-none w-screen max-w-none translate-x-0 translate-y-0 grid-cols-[minmax(0,1fr)] grid-rows-[minmax(0,1fr)] gap-0 overflow-hidden rounded-none p-0 data-[state=closed]:slide-out-to-left-0 data-[state=closed]:slide-out-to-top-0 data-[state=open]:slide-in-from-left-0 data-[state=open]:slide-in-from-top-0 sm:left-[50%] sm:top-[50%] sm:h-[min(92dvh,860px)] sm:max-h-[calc(100dvh-2rem)] sm:w-[calc(100vw-1rem)] sm:max-w-[720px] sm:translate-x-[-50%] sm:translate-y-[-50%] sm:rounded-2xl sm:data-[state=closed]:slide-out-to-left-1/2 sm:data-[state=closed]:slide-out-to-top-[48%] sm:data-[state=open]:slide-in-from-left-1/2 sm:data-[state=open]:slide-in-from-top-[48%] [&>button]:hidden">
        <DialogTitle className="sr-only">{t('board.detail.dialogTitle')}</DialogTitle>
        <TaskDetailPanel {...props} asModal />
      </DialogContent>
    </Dialog>
  );
}
