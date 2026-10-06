import { describe, expect, it } from 'vitest';
import {
  BUILDING_ECONOMY,
  BUILDING_UNLOCK_YEARS,
  isBuildingUnlocked,
  ParkSimulation,
  STARTING_YEAR,
} from './game';

describe('ParkSimulation', () => {
  it('defines a positive construction cost for every building type', () => {
    expect(
      Object.values(BUILDING_ECONOMY).every(
        ({ constructionCost }) => constructionCost > 0,
      ),
    ).toBe(true);
  });

  it('starts with 1,000 Reichsmark and no employees', () => {
    const simulation = new ParkSimulation();

    expect(simulation.getMetric('balance')).toBe(1_000);
    expect(simulation.getMetric('employees')).toBe(0);
  });

  it('starts in 1921 and gates buildings by their configured unlock year', () => {
    const simulation = new ParkSimulation();

    expect(simulation.getSnapshot().year).toBe(1921);
    expect(BUILDING_UNLOCK_YEARS.road).toBe(STARTING_YEAR);
    expect(
      Object.entries(BUILDING_UNLOCK_YEARS)
        .filter(
          ([kind]) =>
            !['road', 'tool-shed', 'barn', 'strawberry-field'].includes(kind),
        )
        .every(([, year]) => year > STARTING_YEAR),
    ).toBe(true);
    expect(isBuildingUnlocked('road', STARTING_YEAR)).toBe(true);
    expect(isBuildingUnlocked('tool-shed', STARTING_YEAR)).toBe(true);
    expect(isBuildingUnlocked('barn', STARTING_YEAR)).toBe(true);
    expect(isBuildingUnlocked('strawberry-field', STARTING_YEAR)).toBe(true);
    expect(isBuildingUnlocked('stall', STARTING_YEAR)).toBe(false);
    expect(isBuildingUnlocked('stall', BUILDING_UNLOCK_YEARS.stall)).toBe(true);
  });

  it('advances the clock and accrues hourly profit at game speed', () => {
    const simulation = new ParkSimulation();
    simulation.setMetric('incomePerHour', 300);
    simulation.setMetric('expensesPerHour', 60);

    simulation.advance(60_000);

    expect(simulation.getSnapshot()).toMatchObject({
      day: 1,
      time: '09:00',
      metrics: { balance: 1_240 },
    });
  });

  it('rolls the clock over to the next day', () => {
    const simulation = new ParkSimulation();
    simulation.advance(16 * 60 * 1000);

    expect(simulation.getSnapshot()).toMatchObject({ day: 2, time: '00:00' });
  });

  it('supports registered metrics and systems that influence game flow', () => {
    const simulation = new ParkSimulation();
    simulation.registerMetric('parkPrestige', 10);
    simulation.registerSystem((state, elapsedHours) => {
      state.adjustMetric('parkPrestige', elapsedHours * 2);
    });

    simulation.advance(30_000);

    expect(simulation.getMetric('parkPrestige')).toBe(11);
  });

  it('resets registered metrics and the clock to their starting state', () => {
    const simulation = new ParkSimulation();
    simulation.registerMetric('parkPrestige', 10);
    simulation.setMetric('parkPrestige', 20);
    simulation.advance(60_000);
    simulation.setYear(1922);

    simulation.reset();

    expect(simulation.getSnapshot()).toMatchObject({
      day: 1,
      time: '08:00',
      year: STARTING_YEAR,
      metrics: { balance: 1_000, parkPrestige: 10, employees: 0 },
    });
  });

  it('restores the clock and metrics from a save state', () => {
    const simulation = new ParkSimulation();
    simulation.advance(60_000);
    simulation.setYear(1923);
    const savedState = simulation.getSaveState();
    const restored = new ParkSimulation();

    restored.loadSaveState(savedState);

    expect(restored.getSnapshot()).toEqual(simulation.getSnapshot());
  });

  it('loads older save states without a year as 1921', () => {
    const simulation = new ParkSimulation();
    const legacySave = { ...simulation.getSaveState() };
    delete legacySave.year;

    simulation.setYear(1922);
    simulation.loadSaveState(legacySave);

    expect(simulation.getYear()).toBe(STARTING_YEAR);
  });

  it('loads older save states without the employee metric', () => {
    const simulation = new ParkSimulation();
    const legacySave = { ...simulation.getSaveState() };
    delete legacySave.metrics.employees;

    simulation.setMetric('employees', 3);
    simulation.loadSaveState(legacySave);

    expect(simulation.getMetric('employees')).toBe(0);
  });

  it('rejects years before the starting year or non-integer years', () => {
    const simulation = new ParkSimulation();

    expect(() => simulation.setYear(1920)).toThrow();
    expect(() => simulation.setYear(1921.5)).toThrow();
  });

  it('spends capital only when the balance can cover the cost', () => {
    const simulation = new ParkSimulation();

    expect(simulation.trySpend(500)).toBe(true);
    expect(simulation.getMetric('balance')).toBe(500);
    expect(simulation.trySpend(501)).toBe(false);
    expect(simulation.getMetric('balance')).toBe(500);
  });
});