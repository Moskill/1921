import type { BuildingKind } from './park';

export const INITIAL_PARK_METRICS = {
  visitors: 0,
  incomePerHour: 0,
  balance: 10_000,
  expensesPerHour: 0,
  satisfaction: 75,
} as const;

export const BUILDING_ECONOMY: Record<
  BuildingKind,
  { constructionCost: number; incomePerHour: number; expensesPerHour: number }
> = {
  stall: { constructionCost: 1_500, incomePerHour: 250, expensesPerHour: 80 },
  pavilion: { constructionCost: 3_000, incomePerHour: 120, expensesPerHour: 35 },
  restroom: { constructionCost: 900, incomePerHour: 0, expensesPerHour: 25 },
  'litter-bin': { constructionCost: 150, incomePerHour: 0, expensesPerHour: 5 },
  coaster: { constructionCost: 4_500, incomePerHour: 450, expensesPerHour: 150 },
  'shooting-gallery': {
    constructionCost: 1_800,
    incomePerHour: 220,
    expensesPerHour: 80,
  },
  road: { constructionCost: 100, incomePerHour: 0, expensesPerHour: 0 },
  'road-plus': { constructionCost: 250, incomePerHour: 0, expensesPerHour: 0 },
};

export type ParkSimulationSnapshot = {
  day: number;
  time: string;
  metrics: Readonly<Record<string, number>>;
};

export type ParkSimulationSave = {
  elapsedGameSeconds: number;
  metrics: Record<string, number>;
};

export type ParkSimulationSystem = (
  simulation: ParkSimulation,
  elapsedGameHours: number,
) => void;

const GAME_SECONDS_PER_REAL_SECOND = 60;
const START_TIME_SECONDS = 8 * 60 * 60;

export class ParkSimulation {
  private readonly initialMetrics = new Map<string, number>();
  private readonly metrics = new Map<string, number>();
  private readonly systems: ParkSimulationSystem[] = [];
  private elapsedGameSeconds = 0;

  constructor() {
    for (const [id, value] of Object.entries(INITIAL_PARK_METRICS)) {
      this.registerMetric(id, value);
    }
    this.registerSystem((simulation, elapsedGameHours) => {
      const income = simulation.getMetric('incomePerHour');
      const expenses = simulation.getMetric('expensesPerHour');
      simulation.adjustMetric(
        'balance',
        (income - expenses) * elapsedGameHours,
      );
    });
  }

  registerMetric(id: string, initialValue = 0): void {
    if (this.metrics.has(id)) {
      throw new Error(`Park metric "${id}" is already registered.`);
    }
    this.assertFiniteValue(initialValue);
    this.initialMetrics.set(id, initialValue);
    this.metrics.set(id, initialValue);
  }

  getMetric(id: string): number {
    const value = this.metrics.get(id);
    if (value === undefined) {
      throw new Error(`Park metric "${id}" is not registered.`);
    }
    return value;
  }

  setMetric(id: string, value: number): void {
    if (!this.metrics.has(id)) {
      throw new Error(`Park metric "${id}" is not registered.`);
    }
    this.assertFiniteValue(value);
    this.metrics.set(id, value);
  }

  adjustMetric(id: string, amount: number): void {
    this.setMetric(id, this.getMetric(id) + amount);
  }

  trySpend(amount: number): boolean {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new Error('Spending must be a non-negative finite number.');
    }
    if (this.getMetric('balance') < amount) return false;
    this.adjustMetric('balance', -amount);
    return true;
  }

  registerSystem(system: ParkSimulationSystem): () => void {
    this.systems.push(system);
    return () => {
      const index = this.systems.indexOf(system);
      if (index !== -1) this.systems.splice(index, 1);
    };
  }

  advance(realDeltaMilliseconds: number): void {
    if (!Number.isFinite(realDeltaMilliseconds) || realDeltaMilliseconds < 0) {
      throw new Error('Elapsed time must be a non-negative finite number.');
    }

    const elapsedGameHours =
      (realDeltaMilliseconds / 1000 / 3600) * GAME_SECONDS_PER_REAL_SECOND;
    this.elapsedGameSeconds +=
      (realDeltaMilliseconds / 1000) * GAME_SECONDS_PER_REAL_SECOND;
    for (const system of this.systems) system(this, elapsedGameHours);
  }

  reset(): void {
    this.elapsedGameSeconds = 0;
    for (const [id, value] of this.initialMetrics) this.metrics.set(id, value);
  }

  getSaveState(): ParkSimulationSave {
    return {
      elapsedGameSeconds: this.elapsedGameSeconds,
      metrics: Object.fromEntries(this.metrics),
    };
  }

  loadSaveState(save: ParkSimulationSave): void {
    if (!Number.isFinite(save.elapsedGameSeconds) || save.elapsedGameSeconds < 0) {
      throw new Error('Saved game time must be a non-negative finite number.');
    }
    for (const [id, value] of Object.entries(save.metrics)) {
      if (!this.metrics.has(id)) {
        throw new Error(`Park metric "${id}" is not registered.`);
      }
      this.assertFiniteValue(value);
    }
    if (Object.keys(save.metrics).length !== this.metrics.size) {
      throw new Error('Saved park metrics do not match the registered metrics.');
    }

    this.elapsedGameSeconds = save.elapsedGameSeconds;
    for (const [id, value] of Object.entries(save.metrics)) {
      this.metrics.set(id, value);
    }
  }

  getSnapshot(): ParkSimulationSnapshot {
    const totalSeconds = START_TIME_SECONDS + this.elapsedGameSeconds;
    const day = Math.floor(totalSeconds / 86_400) + 1;
    const secondsInDay = Math.floor(totalSeconds % 86_400);
    const hours = Math.floor(secondsInDay / 3600);
    const minutes = Math.floor((secondsInDay % 3600) / 60);

    return {
      day,
      time: `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`,
      metrics: Object.fromEntries(this.metrics),
    };
  }

  private assertFiniteValue(value: number): void {
    if (!Number.isFinite(value)) {
      throw new Error('Park metric values must be finite numbers.');
    }
  }
}