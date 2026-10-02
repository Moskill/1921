export const PARK_SIZE = { columns: 36, rows: 24 } as const;

export type Tile = { column: number; row: number };
export type BuildingKind =
  | 'stall'
  | 'restroom'
  | 'litter-bin'
  | 'pavilion'
  | 'coaster'
  | 'shooting-gallery'
  | 'road'
  | 'road-plus';
export type Building = { id: number; tile: Tile; kind: BuildingKind };
export type Footprint = { columns: number; rows: number };
export type RoadDirection = 'northwest-southeast' | 'southwest-northeast';

export const BUILDING_FOOTPRINTS: Record<BuildingKind, Footprint> = {
  stall: { columns: 2, rows: 3 },
  pavilion: { columns: 2, rows: 2 },
  restroom: { columns: 1, rows: 1 },
  'litter-bin': { columns: 1, rows: 1 },
  coaster: { columns: 3, rows: 2 },
  'shooting-gallery': { columns: 2, rows: 1 },
  road: { columns: 1, rows: 1 },
  'road-plus': { columns: 1, rows: 1 },
};

export function isGroundPath(tile: Tile): boolean {
  return tile.row === 5 || tile.column === 7 || (tile.row === 6 && tile.column < 12);
}

export function isWalkablePath(
  tile: Tile,
  buildings: readonly Building[],
): boolean {
  if (
    tile.column < 0 ||
    tile.row < 0 ||
    tile.column >= PARK_SIZE.columns ||
    tile.row >= PARK_SIZE.rows
  ) {
    return false;
  }

  const road = buildings.some(
    (building) =>
      (building.kind === 'road' || building.kind === 'road-plus') &&
      building.tile.column === tile.column &&
      building.tile.row === tile.row,
  );
  const blockedByBuilding = buildings.some((building) => {
    if (building.kind === 'road' || building.kind === 'road-plus') return false;
    const footprint = BUILDING_FOOTPRINTS[building.kind];
    return (
      tile.column >= building.tile.column &&
      tile.column < building.tile.column + footprint.columns &&
      tile.row >= building.tile.row &&
      tile.row < building.tile.row + footprint.rows
    );
  });

  return !blockedByBuilding && (road || isGroundPath(tile));
}

export function getPathNeighbors(
  tile: Tile,
  buildings: readonly Building[],
): Tile[] {
  const candidates = [
    { column: tile.column + 1, row: tile.row },
    { column: tile.column, row: tile.row + 1 },
    { column: tile.column - 1, row: tile.row },
    { column: tile.column, row: tile.row - 1 },
  ];
  return candidates.filter((candidate) => isWalkablePath(candidate, buildings));
}

export function getRoadDirection(
  tile: Tile,
  buildings: readonly Building[],
): RoadDirection {
  const roads = buildings.filter(
    (building) => building.kind === 'road' || building.kind === 'road-plus',
  );
  const columnNeighbors = roads.filter(
    (road) =>
      road.tile.row === tile.row &&
      Math.abs(road.tile.column - tile.column) === 1,
  ).length;
  const rowNeighbors = roads.filter(
    (road) =>
      road.tile.column === tile.column &&
      Math.abs(road.tile.row - tile.row) === 1,
  ).length;

  return rowNeighbors > columnNeighbors
    ? 'southwest-northeast'
    : 'northwest-southeast';
}

export class Park {
  private buildings: Building[] = [];
  private nextId = 1;

  getBuildings(): readonly Building[] {
    return this.buildings;
  }

  canPlace(tile: Tile, kind: BuildingKind): boolean {
    const footprint = BUILDING_FOOTPRINTS[kind];
    if (
      !Number.isInteger(tile.column) ||
      !Number.isInteger(tile.row) ||
      tile.column < 0 ||
      tile.row < 0 ||
      tile.column + footprint.columns > PARK_SIZE.columns ||
      tile.row + footprint.rows > PARK_SIZE.rows
    ) {
      return false;
    }

    return !this.buildings.some((building) => {
      const occupied = BUILDING_FOOTPRINTS[building.kind];
      return (
        tile.column < building.tile.column + occupied.columns &&
        tile.column + footprint.columns > building.tile.column &&
        tile.row < building.tile.row + occupied.rows &&
        tile.row + footprint.rows > building.tile.row
      );
    });
  }

  place(tile: Tile, kind: BuildingKind = 'stall'): Building | null {
    if (!this.canPlace(tile, kind)) return null;
    const building: Building = { id: this.nextId++, tile: { ...tile }, kind };
    this.buildings.push(building);
    return building;
  }

  loadBuildings(buildings: readonly Building[]): boolean {
    const restored = new Park();
    for (const building of buildings) {
      if (
        !Number.isInteger(building.id) ||
        building.id < 1 ||
        !(building.kind in BUILDING_FOOTPRINTS) ||
        !restored.canPlace(building.tile, building.kind) ||
        restored.buildings.some((existing) => existing.id === building.id)
      ) {
        return false;
      }
      restored.buildings.push({
        id: building.id,
        kind: building.kind,
        tile: { ...building.tile },
      });
    }
    restored.nextId = Math.max(0, ...restored.buildings.map(({ id }) => id)) + 1;
    this.buildings = restored.buildings;
    this.nextId = restored.nextId;
    return true;
  }
}
