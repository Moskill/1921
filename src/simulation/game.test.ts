import { describe, expect, it } from 'vitest';
import { BUILDING_ECONOMY, ParkSimulation } from './game';

describe('ParkSimulation', () => {
  it('defines a positive construction cost for every building type', () => {
    expect(
      Object.values(BUILDING_ECONOMY).every(
        ({ constructionCost }) => constructionCost > 0,
      ),
    ).toBe(true);
  });

  it('advances the clock and accrues hourly profit at game speed', () => {
    const simulation = new ParkSimulation();
    simulation.setMetric('incomePerHour', 300);
    simulation.setMetric('expensesPerHour', 60);

    simulation.advance(60_000);

    expect(simulation.getSnapshot()).toMatchObject({
      day: 1,
      time: '09:00',
      metrics: { balance: 10_240 },
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

    simulation.reset();

    expect(simulation.getSnapshot()).toMatchObject({
      day: 1,
      time: '08:00',
      metrics: { balance: 10_000, parkPrestige: 10 },
    });
  });

  it('restores the clock and metrics from a save state', () => {
    const simulation = new ParkSimulation();
    simulation.advance(60_000);
    const savedState = simulation.getSaveState();
    const restored = new ParkSimulation();

    restored.loadSaveState(savedState);

    expect(restored.getSnapshot()).toEqual(simulation.getSnapshot());
  });

  it('spends capital only when the balance can cover the cost', () => {
    const simulation = new ParkSimulation();

    expect(simulation.trySpend(1_500)).toBe(true);
    expect(simulation.getMetric('balance')).toBe(8_500);
    expect(simulation.trySpend(9_000)).toBe(false);
    expect(simulation.getMetric('balance')).toBe(8_500);
  });
});