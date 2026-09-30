import { describe, expect, it } from 'vitest';
import {
  getPathNeighbors,
  getRoadDirection,
  isWalkablePath,
  Park,
} from './park';

describe('Park', () => {
  it('places one building per tile and rejects positions outside the map', () => {
    const park = new Park();
    expect(park.place({ column: 2, row: 3 })).toMatchObject({ id: 1 });
    expect(park.place({ column: 2, row: 3 })).toBeNull();
    expect(park.place({ column: -1, row: 0 })).toBeNull();
    expect(park.place({ column: 36, row: 0 })).toBeNull();
    expect(park.place({ column: 1.5, row: 0 })).toBeNull();
    expect(park.getBuildings()).toHaveLength(1);
  });

  it('stores the selected building type', () => {
    const park = new Park();
    expect(park.place({ column: 3, row: 4 }, 'pavilion')).toMatchObject({
      id: 1,
      kind: 'pavilion',
      tile: { column: 3, row: 4 },
    });
  });

  it('places a litter bin and restroom on one tile each', () => {
    const park = new Park();
    expect(park.place({ column: 3, row: 4 }, 'litter-bin')).toMatchObject({
      id: 1,
      kind: 'litter-bin',
      tile: { column: 3, row: 4 },
    });
    expect(park.place({ column: 4, row: 4 }, 'restroom')).not.toBeNull();
    expect(park.place({ column: 3, row: 4 }, 'restroom')).toBeNull();
  });

  it('reserves the coaster 3x2 and shooting gallery 2x1 footprints', () => {
    const park = new Park();
    expect(park.place({ column: 2, row: 2 }, 'coaster')).not.toBeNull();
    expect(park.place({ column: 4, row: 3 }, 'restroom')).toBeNull();
    expect(park.place({ column: 5, row: 2 }, 'shooting-gallery')).not.toBeNull();
    expect(park.place({ column: 6, row: 2 }, 'restroom')).toBeNull();
    expect(park.place({ column: 7, row: 2 }, 'restroom')).not.toBeNull();
    expect(park.place({ column: 35, row: 0 }, 'shooting-gallery')).toBeNull();
  });

  it('allows visitors only on open built-in and placed paths', () => {
    const road = { id: 1, tile: { column: 20, row: 20 }, kind: 'road-plus' as const };
    expect(isWalkablePath({ column: 0, row: 5 }, [])).toBe(true);
    expect(isWalkablePath({ column: 0, row: 4 }, [])).toBe(false);
    expect(isWalkablePath(road.tile, [road])).toBe(true);
    expect(getPathNeighbors(road.tile, [road])).toEqual([]);
    expect(
      isWalkablePath(
        { column: 7, row: 5 },
        [{ id: 2, tile: { column: 7, row: 5 }, kind: 'stall' }],
      ),
    ).toBe(false);
  });

  it('selects a straight-road image based on adjacent road tiles', () => {
    const park = new Park();
    const firstRoad = park.place({ column: 4, row: 5 }, 'road')!;
    expect(getRoadDirection(firstRoad.tile, park.getBuildings())).toBe('northwest-southeast');
    park.place({ column: 4, row: 6 }, 'road');
    expect(getRoadDirection(firstRoad.tile, park.getBuildings())).toBe('southwest-northeast');
  });
});
