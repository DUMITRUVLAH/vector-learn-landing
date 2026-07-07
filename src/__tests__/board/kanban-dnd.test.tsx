/**
 * TB-002: DnD nativ Kanban — regresie pentru bug-ul de closure stale.
 *
 * Bug-ul original (prins de verificarea browser înainte de PR): handleDrop citea
 * taskId din state-ul React (draggingTaskId); un drop procesat ÎNAINTEA
 * re-render-ului vedea closure-ul vechi (null) și mutarea se pierdea silențios.
 * Fix: id-ul călătorește prin dataTransfer (sursa de adevăr), state-ul e doar vizual.
 *
 * Testul dispecerizează dragstart + drop SINCRON (fără re-render între ele) —
 * exact scenariul care pica — și cere ca onMove să fie chemat corect.
 *
 * T-TB2-DND-1 [blocant] drop pe coloană imediat după dragstart → onMove(taskId, listă, poziție-finală)
 * T-TB2-DND-2 [blocant] drop PE un card → inserare înaintea lui (poziție fracționată)
 */
import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { BoardKanbanView } from "@/components/business/board/BoardKanbanView";
import type { BoardTask } from "@/lib/api/boardTasks";
import type { BoardList } from "@/lib/api/board";

/** jsdom nu are DataTransfer — mimică minimă get/setData (ce folosește componenta). */
function mockDataTransfer() {
  const data: Record<string, string> = {};
  return {
    effectAllowed: "",
    dropEffect: "",
    setData: (k: string, v: string) => {
      data[k] = v;
    },
    getData: (k: string) => data[k] ?? "",
  };
}

function mkTask(over: Partial<BoardTask>): BoardTask {
  return {
    id: "t-x",
    tenantId: "tn",
    boardId: "b-1",
    listId: null,
    productId: null,
    title: "Task",
    description: null,
    position: 1024,
    status: "todo",
    priority: "normal",
    assigneeUserId: null,
    assigneeRole: null,
    startDate: null,
    dueDate: null,
    completedAt: null,
    templateItemId: null,
    sourceTemplateId: null,
    archivedAt: null,
    createdAt: "",
    updatedAt: "",
    ...over,
  };
}

const LISTS: BoardList[] = [
  {
    id: "l-backlog",
    tenantId: "tn",
    boardId: "b-1",
    name: "Backlog",
    position: 1024,
    wipLimit: null,
    isDoneList: false,
    colorToken: null,
    createdAt: "",
    updatedAt: "",
  },
  {
    id: "l-gata",
    tenantId: "tn",
    boardId: "b-1",
    name: "Gata",
    position: 2048,
    wipLimit: null,
    isDoneList: true,
    colorToken: null,
    createdAt: "",
    updatedAt: "",
  },
];

describe("TB-002 Kanban native DnD (stale-closure regression)", () => {
  it("T-TB2-DND-1 [blocant] drop on column fires onMove even with NO re-render between events", () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    const tasks = [
      mkTask({ id: "t-a", listId: "l-backlog", title: "Cardul A", position: 1024 }),
      mkTask({ id: "t-b", listId: "l-gata", title: "Cardul B", position: 1024 }),
    ];
    const { getByLabelText } = render(
      <BoardKanbanView lists={LISTS} tasks={tasks} onMove={onMove} />
    );

    const card = getByLabelText("Task: Cardul A");
    const gataColumn = getByLabelText(/^Coloana Gata/);
    const dt = mockDataTransfer();

    // Sincron, fără a lăsa React să re-randeze — scenariul care pica cu state-ul.
    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.dragOver(gataColumn, { dataTransfer: dt });
    fireEvent.drop(gataColumn, { dataTransfer: dt });

    expect(onMove).toHaveBeenCalledTimes(1);
    // La finalul coloanei Gata: după cardul B (1024) → 1024 + 1024.
    expect(onMove).toHaveBeenCalledWith("t-a", "l-gata", 2048);
  });

  it("T-TB2-DND-2 [blocant] drop ON a card inserts before it (fractional position)", () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    const tasks = [
      mkTask({ id: "t-a", listId: "l-backlog", title: "Cardul A", position: 1024 }),
      mkTask({ id: "t-b", listId: "l-backlog", title: "Cardul B", position: 2048 }),
      mkTask({ id: "t-c", listId: "l-gata", title: "Cardul C", position: 1024 }),
    ];
    const { getByLabelText } = render(
      <BoardKanbanView lists={LISTS} tasks={tasks} onMove={onMove} />
    );

    const cardC = getByLabelText("Task: Cardul C");
    const cardB = getByLabelText("Task: Cardul B");
    const dt = mockDataTransfer();

    fireEvent.dragStart(cardC, { dataTransfer: dt });
    fireEvent.dragOver(cardB, { dataTransfer: dt });
    fireEvent.drop(cardB, { dataTransfer: dt });

    // Înaintea lui B(2048), după A(1024) → media 1536, în lista Backlog.
    expect(onMove).toHaveBeenCalledWith("t-c", "l-backlog", 1536);
  });

  it("T-TB2-DND-3 [normal] drop pe propriul card e ignorat (nu se auto-mută)", () => {
    const onMove = vi.fn().mockResolvedValue(undefined);
    const tasks = [mkTask({ id: "t-a", listId: "l-backlog", title: "Cardul A", position: 1024 })];
    const { getByLabelText } = render(
      <BoardKanbanView lists={LISTS} tasks={tasks} onMove={onMove} />
    );
    const card = getByLabelText("Task: Cardul A");
    const dt = mockDataTransfer();
    fireEvent.dragStart(card, { dataTransfer: dt });
    fireEvent.drop(card, { dataTransfer: dt });
    expect(onMove).not.toHaveBeenCalled();
  });
});
