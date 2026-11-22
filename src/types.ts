export type Status = 'geplant' | 'laufend' | 'pausiert' | 'abgeschlossen';

export interface Project {
  id: number;
  name: string;
  kunde: string;
  leiter: string;
  status: Status;
  start_soll: string;
  ende_soll: string;
  budget: number;
  beschreibung: string;
}

export interface Task {
  id: number;
  project_id: number;
  name: string;
  typ: 'phase' | 'meilenstein';
  start_soll: string;
  ende_soll: string;
  start_ist: string | null;
  ende_ist: string | null;
  fortschritt: number;
}

export interface Cost {
  id: number;
  project_id: number;
  datum: string;
  kategorie: string;
  bezeichnung: string;
  art: 'soll' | 'ist';
  betrag: number;
}

export interface Data {
  projects: Project[];
  tasks: Task[];
  costs: Cost[];
}

export type Ampel = 'gruen' | 'gelb' | 'rot' | 'neutral';
