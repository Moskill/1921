import Phaser from 'phaser';
import {
  BUILDING_FOOTPRINTS,
  getPathNeighbors,
  getRoadDirection,
  isGroundPath,
  isWalkablePath,
  Park,
  PARK_SIZE,
  type BuildingKind,
  type Tile,
} from '../simulation/park';
import {
  BUILDING_ECONOMY,
  isBuildingUnlocked,
  ParkSimulation,
  STRAWBERRY_FIELDS_LAND_COST,
  type ParkSimulationSave,
  type ParkSimulationSnapshot,
} from '../simulation/game';

// A tile is a 96 × 48 diamond, projected from the logical square grid.
const HALF_W = 48;
const HALF_H = 24;
const VISITOR_SHADOW_OFFSET_Y = 4;
const ORIGIN_X = (PARK_SIZE.rows + 1) * HALF_W;
const ORIGIN_Y = 125;
const MAP_WIDTH = (PARK_SIZE.columns + PARK_SIZE.rows + 2) * HALF_W;
const MAP_HEIGHT = ORIGIN_Y + (PARK_SIZE.columns + PARK_SIZE.rows + 2) * HALF_H;
type Point = { x: number; y: number };

export type ParkSaveSnapshot = {
  version: 1;
  savedAt: string;
  buildings: { id: number; tile: Tile; kind: BuildingKind }[];
  fieldBuildings?: { id: number; tile: Tile; kind: BuildingKind }[];
  selectedBuilding: BuildingKind | null;
  strawberryFieldsUnlocked?: boolean;
  camera: { scrollX: number; scrollY: number; zoom: number };
  simulation: ParkSimulationSave;
};

function center(tile: Tile): Point {
  return {
    x: ORIGIN_X + (tile.column - tile.row) * HALF_W,
    y: ORIGIN_Y + (tile.column + tile.row + 1) * HALF_H,
  };
}

function tileAt(point: Point): Tile {
  const x = (point.x - ORIGIN_X) / HALF_W;
  const y = (point.y - ORIGIN_Y) / HALF_H - 1;
  return {
    column: Math.floor((x + y + 1) / 2),
    row: Math.floor((y - x + 1) / 2),
  };
}

function visitorFrame(from: Tile, to: Tile): number {
  if (to.column > from.column) return 0;
  if (to.row > from.row) return 1;
  if (to.column < from.column) return 2;
  return 3;
}

export class ParkScene extends Phaser.Scene {
  private park = new Park();
  private strawberryFields = new Park();
  private currentMap: 'park' | 'strawberry-fields' = 'park';
  private strawberryFieldsUnlocked = false;
  private simulation = new ParkSimulation();
  private simulationEnabled = false;
  private hudUpdateElapsed = 0;
  private ground?: Phaser.GameObjects.Graphics;
  private groundDetails?: Phaser.GameObjects.Graphics;
  private grassTexture?: Phaser.GameObjects.TileSprite;
  private props?: Phaser.GameObjects.Graphics;
  private buildings?: Phaser.GameObjects.Graphics;
  private buildingImages?: Phaser.GameObjects.Container;
  private visitorShadow?: Phaser.GameObjects.Ellipse;
  private visitor?: Phaser.GameObjects.Sprite;
  private visitorTile?: Tile;
  private previousVisitorTile?: Tile;
  private visitorTween?: Phaser.Tweens.Tween;
  private visitorRespawn?: Phaser.Time.TimerEvent;
  private hover?: Phaser.GameObjects.Graphics;
  private selectedBuilding: BuildingKind | null = 'road';
  private dragStart?: {
    x: number;
    y: number;
    cameraX: number;
    cameraY: number;
  };
  private moved = false;

  private get activePark(): Park {
    return this.currentMap === 'park' ? this.park : this.strawberryFields;
  }

  constructor() {
    super('ParkScene');
  }

  preload(): void {
    this.load.image('grass-pattern', '/rasen-1.png');
    this.load.image('coaster', '/raupenbahn-1.webp');
    this.load.image('shooting-gallery', '/schiessbude-1.webp');
    this.load.image('restroom', '/toilette-1.webp');
    this.load.image('litter-bin', '/muelleimer-.1.webp');
    this.load.image('straight-road', '/weg-gerade-2.webp');
    this.load.image('straight-road-reverse', '/weg-gerade-3.webp');
    this.load.image('road-plus', '/weg-1.png');
    this.load.spritesheet('visitor', '/visitor-1.png', {
      frameWidth: 64,
      frameHeight: 96,
    });
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#b7cf9f');
    this.cameras.main.setBounds(0, 0, MAP_WIDTH, MAP_HEIGHT);
    this.cameras.main.centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.ground = this.add.graphics();
    this.grassTexture = this.add
      .tileSprite(0, 0, MAP_WIDTH, MAP_HEIGHT, 'grass-pattern')
      .setOrigin(0, 0)
      .setTileScale(0.125);
    this.groundDetails = this.add.graphics();
    this.props = this.add.graphics();
    this.buildings = this.add.graphics();
    this.buildingImages = this.add.container(0, 0);
    this.visitorShadow = this.add
      .ellipse(0, 0, 28, 9, 0x17251b, 0.32)
      .setVisible(false);
    this.visitor = this.add
      .sprite(0, 0, 'visitor', 0)
      .setOrigin(0.5, 0.9)
      .setScale(0.4)
      .setVisible(false);
    this.hover = this.add.graphics();
    this.drawGround();
    this.drawProps();
    this.scheduleVisitorSpawn();
    window.addEventListener('park:select-building', (event) => {
      this.selectedBuilding = (
        event as CustomEvent<BuildingKind | null>
      ).detail;
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragStart = {
        x: pointer.x,
        y: pointer.y,
        cameraX: this.cameras.main.scrollX,
        cameraY: this.cameras.main.scrollY,
      };
      this.moved = false;
    });
    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (pointer.isDown && this.dragStart) {
        const dx = pointer.x - this.dragStart.x;
        const dy = pointer.y - this.dragStart.y;
        if (Math.hypot(dx, dy) > 8) this.moved = true;
        if (this.moved) {
          this.cameras.main.scrollX =
            this.dragStart.cameraX - dx / this.cameras.main.zoom;
          this.cameras.main.scrollY =
            this.dragStart.cameraY - dy / this.cameras.main.zoom;
        }
      }
      this.drawHover(
        tileAt(this.cameras.main.getWorldPoint(pointer.x, pointer.y)),
      );
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.moved && this.dragStart) {
        this.place(
          tileAt(this.cameras.main.getWorldPoint(pointer.x, pointer.y)),
        );
      }
      this.dragStart = undefined;
    });
    this.input.on('pointerout', () => this.hover?.clear());
    this.input.on(
      'wheel',
      (
        _pointer: Phaser.Input.Pointer,
        _objects: unknown,
        _dx: number,
        dy: number,
      ) => {
        this.zoom(dy > 0 ? -0.1 : 0.1);
      },
    );
  }

  update(_time: number, delta: number): void {
    if (!this.simulationEnabled) return;
    this.simulation.advance(delta);
    this.hudUpdateElapsed += delta;
    if (this.hudUpdateElapsed >= 250) {
      this.hudUpdateElapsed %= 250;
      this.dispatchSimulationUpdate();
    }
  }

  startGame(): void {
    this.simulationEnabled = true;
    if (this.scene.isPaused()) this.scene.resume();
    this.dispatchSimulationUpdate();
  }

  pauseGame(): void {
    this.simulationEnabled = false;
    this.scene.pause();
  }

  resumeGame(): void {
    this.simulationEnabled = true;
    this.scene.resume();
  }

  zoom(delta: number): void {
    this.cameras.main.setZoom(
      Phaser.Math.Clamp(this.cameras.main.zoom + delta, 0.55, 2),
    );
  }

  setMap(map: 'park' | 'strawberry-fields'): void {
    if (map === 'strawberry-fields' && !this.strawberryFieldsUnlocked) return;
    if (map === this.currentMap) return;
    this.currentMap = map;
    this.dragStart = undefined;
    this.moved = false;
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.resetVisitor();
    this.drawGround();
    this.drawProps();
    this.drawBuildings();
    this.updateBuildingEconomy();
    window.dispatchEvent(
      new CustomEvent('park:placed', { detail: this.getBuildingCount() }),
    );
    this.dispatchSimulationUpdate();
  }

  resetPark(): void {
    this.park = new Park();
    this.strawberryFields = new Park();
    this.currentMap = 'park';
    this.strawberryFieldsUnlocked = false;
    this.simulation.reset();
    this.updateBuildingEconomy();
    this.resetVisitor();
    this.dragStart = undefined;
    this.moved = false;
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.drawGround();
    this.drawProps();
    this.drawBuildings();
    window.dispatchEvent(new CustomEvent('park:placed', { detail: 0 }));
    this.dispatchSimulationUpdate();
  }

  hasStrawberryFieldsUnlocked(): boolean {
    return this.strawberryFieldsUnlocked;
  }

  purchaseStrawberryFields(): 'purchased' | 'already-owned' | 'insufficient-funds' {
    if (this.strawberryFieldsUnlocked) return 'already-owned';
    if (!this.simulation.trySpend(STRAWBERRY_FIELDS_LAND_COST)) {
      return 'insufficient-funds';
    }
    this.strawberryFieldsUnlocked = true;
    this.dispatchSimulationUpdate();
    return 'purchased';
  }

  getSaveSnapshot(): ParkSaveSnapshot {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      buildings: this.park.getBuildings().map((building) => ({
        ...building,
        tile: { ...building.tile },
      })),
      fieldBuildings: this.strawberryFields.getBuildings().map((building) => ({
        ...building,
        tile: { ...building.tile },
      })),
      selectedBuilding: this.selectedBuilding,
      strawberryFieldsUnlocked: this.strawberryFieldsUnlocked,
      camera: {
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
        zoom: this.cameras.main.zoom,
      },
      simulation: this.simulation.getSaveState(),
    };
  }

  loadSaveSnapshot(snapshot: unknown): boolean {
    if (!snapshot || typeof snapshot !== 'object') return false;
    const save = snapshot as Partial<ParkSaveSnapshot>;
    if (
      save.version !== 1 ||
      typeof save.savedAt !== 'string' ||
      !Array.isArray(save.buildings) ||
      (save.selectedBuilding !== null &&
        typeof save.selectedBuilding !== 'string') ||
      (save.strawberryFieldsUnlocked !== undefined &&
        typeof save.strawberryFieldsUnlocked !== 'boolean') ||
      !save.camera ||
      !save.simulation
    ) {
      return false;
    }

    const validBuildingKinds = Object.keys(BUILDING_FOOTPRINTS);
    if (
      (save.selectedBuilding !== null &&
        !validBuildingKinds.includes(save.selectedBuilding)) ||
      !Number.isFinite(save.camera.scrollX) ||
      !Number.isFinite(save.camera.scrollY) ||
      !Number.isFinite(save.camera.zoom) ||
      save.camera.zoom < 0.55 ||
      save.camera.zoom > 2
    ) {
      return false;
    }

    const restoredPark = new Park();
    const restoredFields = new Park();
    const buildings = save.buildings;
    const fieldBuildings = save.fieldBuildings ?? [];
    const invalidBuilding = (building: (typeof buildings)[number]) =>
      !building ||
      !Number.isInteger(building.id) ||
      !Number.isInteger(building.tile?.column) ||
      !Number.isInteger(building.tile?.row) ||
      !validBuildingKinds.includes(building.kind);
    if (
      !Array.isArray(fieldBuildings) ||
      buildings.some(invalidBuilding) ||
      fieldBuildings.some(invalidBuilding) ||
      !restoredPark.loadBuildings(buildings) ||
      !restoredFields.loadBuildings(fieldBuildings)
    ) {
      return false;
    }

    try {
      const simulation = new ParkSimulation();
      simulation.loadSaveState(save.simulation);
    } catch {
      return false;
    }

    this.park = restoredPark;
    this.strawberryFields = restoredFields;
    this.currentMap = 'park';
    this.strawberryFieldsUnlocked =
      save.strawberryFieldsUnlocked ?? fieldBuildings.length > 0;
    this.simulation.loadSaveState(save.simulation);
    this.selectedBuilding = save.selectedBuilding as BuildingKind | null;
    this.cameras.main.setZoom(save.camera.zoom);
    this.cameras.main.setScroll(save.camera.scrollX, save.camera.scrollY);
    this.hudUpdateElapsed = 0;
    this.resetVisitor();
    this.drawGround();
    this.drawProps();
    this.drawBuildings();
    const count = [...buildings, ...fieldBuildings].filter(
      (building) => building.kind !== 'road' && building.kind !== 'road-plus',
    ).length;
    window.dispatchEvent(new CustomEvent('park:placed', { detail: count }));
    this.dispatchSimulationUpdate();
    return true;
  }

  private place(tile: Tile): void {
    const kind = this.selectedBuilding;
    if (!kind || !this.activePark.canPlace(tile, kind)) return;
    if (kind === 'strawberry-field' && this.currentMap !== 'strawberry-fields') {
      return;
    }
    if (!isBuildingUnlocked(kind, this.simulation.getYear())) return;
    const constructionCost = BUILDING_ECONOMY[kind].constructionCost;
    if (!this.simulation.trySpend(constructionCost)) {
      window.dispatchEvent(
        new CustomEvent('park:insufficient-capital', {
          detail: { cost: constructionCost },
        }),
      );
      return;
    }
    if (!this.activePark.place(tile, kind)) {
      this.simulation.adjustMetric('balance', constructionCost);
      return;
    }
    this.drawBuildings();
    this.updateBuildingEconomy();
    const count = [...this.park.getBuildings(), ...this.strawberryFields.getBuildings()]
      .filter(
        (building) => building.kind !== 'road' && building.kind !== 'road-plus',
      ).length;
    window.dispatchEvent(new CustomEvent('park:placed', { detail: count }));
    this.dispatchSimulationUpdate();
  }

  private updateBuildingEconomy(): void {
    const totals = [...this.park.getBuildings(), ...this.strawberryFields.getBuildings()].reduce(
      (result, building) => {
        const economy = BUILDING_ECONOMY[building.kind];
        result.incomePerHour += economy.incomePerHour;
        result.expensesPerHour += economy.expensesPerHour;
        return result;
      },
      { incomePerHour: 0, expensesPerHour: 0 },
    );
    this.simulation.setMetric('incomePerHour', totals.incomePerHour);
    this.simulation.setMetric('expensesPerHour', totals.expensesPerHour);
  }

  private getBuildingCount(): number {
    return [...this.park.getBuildings(), ...this.strawberryFields.getBuildings()].filter(
      (building) => building.kind !== 'road' && building.kind !== 'road-plus',
    ).length;
  }

  private dispatchSimulationUpdate(): void {
    const detail: ParkSimulationSnapshot = this.simulation.getSnapshot();
    window.dispatchEvent(new CustomEvent('park:simulation-updated', { detail }));
  }

  private scheduleVisitorSpawn(): void {
    if (this.currentMap !== 'park') return;
    this.visitorRespawn = this.time.delayedCall(
      Phaser.Math.Between(500, 2500),
      () => this.spawnVisitor(),
    );
  }

  private spawnVisitor(): void {
    if (this.currentMap !== 'park') return;
    const paths: Tile[] = [];
    const buildings = this.park.getBuildings();
    for (let row = 0; row < PARK_SIZE.rows; row++) {
      for (let column = 0; column < PARK_SIZE.columns; column++) {
        const tile = { column, row };
        if (
          isWalkablePath(tile, buildings) &&
          getPathNeighbors(tile, buildings).length > 0
        ) {
          paths.push(tile);
        }
      }
    }

    if (paths.length === 0 || !this.visitor) {
      this.scheduleVisitorSpawn();
      return;
    }

    this.visitorRespawn = undefined;
    this.visitorTile = paths[Phaser.Math.Between(0, paths.length - 1)]!;
    this.simulation.setMetric('visitors', 1);
    this.previousVisitorTile = undefined;
    const position = center(this.visitorTile);
    this.visitorShadow
      ?.setPosition(position.x, position.y + VISITOR_SHADOW_OFFSET_Y)
      .setVisible(true);
    this.visitor
      .setPosition(position.x, position.y)
      .setFrame(0)
      .setVisible(true);
    this.moveVisitor();
  }

  private moveVisitor(): void {
    const current = this.visitorTile;
    const visitor = this.visitor;
    if (!current || !visitor) return;

    const neighbors = getPathNeighbors(current, this.park.getBuildings());
    if (neighbors.length === 0) {
      this.removeVisitor();
      return;
    }

    const atDeadEnd =
      neighbors.length === 1 &&
      this.previousVisitorTile !== undefined &&
      neighbors[0]!.column === this.previousVisitorTile.column &&
      neighbors[0]!.row === this.previousVisitorTile.row;
    if (atDeadEnd && Math.random() < 0.45) {
      this.removeVisitor();
      return;
    }

    const forward = neighbors.filter(
      (tile) =>
        tile.column !== this.previousVisitorTile?.column ||
        tile.row !== this.previousVisitorTile?.row,
    );
    const choices = forward.length > 0 ? forward : neighbors;
    const next = choices[Phaser.Math.Between(0, choices.length - 1)]!;
    const position = center(next);
    visitor.setFrame(visitorFrame(current, next));
    this.previousVisitorTile = current;
    this.visitorTile = next;
    this.visitorTween = this.tweens.add({
      targets: visitor,
      x: position.x,
      y: position.y,
      duration: 2200,
      ease: 'Linear',
      onUpdate: () =>
        this.visitorShadow?.setPosition(
          visitor.x,
          visitor.y + VISITOR_SHADOW_OFFSET_Y,
        ),
      onComplete: () => this.moveVisitor(),
    });
  }

  private removeVisitor(): void {
    this.visitorTween?.stop();
    this.visitor?.setVisible(false);
    this.visitorShadow?.setVisible(false);
    this.visitorTile = undefined;
    this.simulation.setMetric('visitors', 0);
    this.previousVisitorTile = undefined;
    this.scheduleVisitorSpawn();
  }

  private resetVisitor(): void {
    this.visitorTween?.stop();
    this.visitorRespawn?.remove(false);
    this.visitor?.setVisible(false);
    this.visitorShadow?.setVisible(false);
    this.visitorTile = undefined;
    this.simulation.setMetric('visitors', 0);
    this.previousVisitorTile = undefined;
    this.scheduleVisitorSpawn();
  }

  private drawGround(): void {
    const g = this.ground;
    if (!g) return;
    g.clear();
    this.groundDetails?.clear();
    this.grassTexture?.clearMask(true);
    const fieldMap = this.currentMap === 'strawberry-fields';
    const corners = [
      { x: ORIGIN_X, y: ORIGIN_Y },
      {
        x: ORIGIN_X + PARK_SIZE.columns * HALF_W,
        y: ORIGIN_Y + PARK_SIZE.columns * HALF_H,
      },
      {
        x: ORIGIN_X + (PARK_SIZE.columns - PARK_SIZE.rows) * HALF_W,
        y: ORIGIN_Y + (PARK_SIZE.columns + PARK_SIZE.rows) * HALF_H,
      },
      {
        x: ORIGIN_X - PARK_SIZE.rows * HALF_W,
        y: ORIGIN_Y + PARK_SIZE.rows * HALF_H,
      },
    ];
    g.fillStyle(0x6e8760);
    g.fillPoints(
      corners.map(({ x, y }) => ({ x, y: y + 18 })),
      true,
    );
    g.fillStyle(0x83a66c);
    g.fillPoints(corners, true);
    const details = this.groundDetails;
    const grassMask = this.make.graphics({ x: 0, y: 0 });
    const grass = [0x91ba70, 0x97be76, 0x9fc57b, 0x94b973, 0xa0c47d];
    for (let row = 0; row < PARK_SIZE.rows; row++) {
      for (let column = 0; column < PARK_SIZE.columns; column++) {
        const { x, y } = center({ column, row });
        const path = !fieldMap && isGroundPath({ column, row });
        const shade = (column * 17 + row * 31) % grass.length;
        const tileCorners = [
          { x, y: y - HALF_H },
          { x: x + HALF_W, y },
          { x, y: y + HALF_H },
          { x: x - HALF_W, y },
        ];
        if (path) {
          g.fillStyle(shade % 2 ? 0xd7c6a1 : 0xddcca9);
          g.fillPoints(tileCorners, true);
        } else {
          grassMask.fillStyle(0xffffff);
          grassMask.fillPoints(tileCorners, true);
        }
        details?.lineStyle(
          1,
          path ? 0xb2a783 : fieldMap ? 0xa6c77f : 0x79a25f,
          fieldMap ? 0.55 : 0.25,
        );
        details?.strokePoints(tileCorners, true);
        if (!fieldMap && !path && (column * 13 + row * 7) % 11 === 0) {
          details?.fillStyle(0xf5e7ad, 0.85);
          details?.fillCircle(x - 12, y + 3, 2);
          details?.fillCircle(x + 3, y + 10, 2);
        }
      }
    }
    this.grassTexture?.setMask(grassMask.createGeometryMask());
  }

  private drawProps(): void {
    const g = this.props;
    if (!g) return;
    g.clear();
    if (this.currentMap === 'strawberry-fields') return;
    const trees: Tile[] = [
      { column: 2, row: 2 },
      { column: 4, row: 1 },
      { column: 11, row: 2 },
      { column: 15, row: 3 },
      { column: 3, row: 9 },
      { column: 12, row: 10 },
    ];
    for (const tile of trees.sort(
      (a, b) => a.column + a.row - b.column - b.row,
    )) {
      const { x, y } = center(tile);
      g.fillStyle(0x456b3e, 0.22);
      g.fillEllipse(x + 9, y + 12, 48, 15);
      g.fillStyle(0x775235);
      g.fillRect(x - 4, y - 34, 8, 40);
      g.fillStyle(0x3c804c);
      g.fillCircle(x + 8, y - 42, 19);
      g.fillStyle(0x55a05a);
      g.fillCircle(x - 9, y - 43, 22);
      g.fillStyle(0x73b46a);
      g.fillCircle(x, y - 61, 19);
    }
  }

  private drawHover(tile: Tile): void {
    const g = this.hover;
    if (!g) return;
    g.clear();
    if (!this.selectedBuilding) return;
    const footprint = BUILDING_FOOTPRINTS[this.selectedBuilding];
    const canPlace = this.activePark.canPlace(tile, this.selectedBuilding);
    g.fillStyle(canPlace ? 0xf9eac2 : 0xe98266, 0.42);
    g.lineStyle(2, canPlace ? 0xfff3ce : 0xffad91, 0.95);
    for (let row = 0; row < footprint.rows; row++) {
      for (let column = 0; column < footprint.columns; column++) {
        const cell = { column: tile.column + column, row: tile.row + row };
        if (
          cell.column < 0 ||
          cell.row < 0 ||
          cell.column >= PARK_SIZE.columns ||
          cell.row >= PARK_SIZE.rows
        )
          continue;
        const { x, y } = center(cell);
        const corners = [
          { x, y: y - HALF_H },
          { x: x + HALF_W, y },
          { x, y: y + HALF_H },
          { x: x - HALF_W, y },
        ];
        g.fillPoints(corners, true);
        g.strokePoints(corners, true);
      }
    }
  }

  private drawBuildings(): void {
    const g = this.buildings;
    if (!g) return;
    g.clear();
    this.buildingImages?.removeAll(true);
    const ordered = [...this.activePark.getBuildings()].sort(
      (a, b) => a.tile.column + a.tile.row - b.tile.column - b.tile.row,
    );
    for (const building of ordered) {
      const { columns, rows } = BUILDING_FOOTPRINTS[building.kind];
      const x =
        ORIGIN_X +
        (building.tile.column - building.tile.row + (columns - rows) / 2) *
          HALF_W;
      const y =
        ORIGIN_Y +
        (building.tile.column + building.tile.row + (columns + rows) / 2) *
          HALF_H;
      if (building.kind === 'coaster') {
        const image = this.add.image(x, y - 18, 'coaster');
        const footprintScale = ((columns + rows) * HALF_W) / image.width;
        image.setScale(footprintScale * (2 / 3));
        this.buildingImages?.add(image);
        continue;
      }
      if (building.kind === 'shooting-gallery') {
        const image = this.add.image(x - 10, y - 30, 'shooting-gallery');
        const footprintWidth = (columns + rows) * HALF_W;
        image.setScale(footprintWidth / image.width);
        image.y -= image.displayHeight / 2 - (columns + rows) * HALF_H;
        this.buildingImages?.add(image);
        continue;
      }
      if (building.kind === 'restroom' || building.kind === 'litter-bin') {
        const image = this.add.image(x, y, building.kind);
        const width = building.kind === 'restroom' ? HALF_W * 1.8 : HALF_W;
        image.setScale(width / image.width);
        image.y -= image.displayHeight / 2 - HALF_H;
        this.buildingImages?.add(image);
        continue;
      }
      if (building.kind === 'road-plus') {
        this.buildingImages?.add(
          this.add
            .image(x, y, 'road-plus')
            .setDisplaySize(HALF_W * 2, HALF_H * 2),
        );
        continue;
      }
      if (building.kind === 'road') {
        const roadTexture =
          getRoadDirection(building.tile, ordered) === 'southwest-northeast'
            ? 'straight-road-reverse'
            : 'straight-road';
        this.buildingImages?.add(
          this.add
            .image(x, y, roadTexture)
            .setDisplaySize(HALF_W * 2, HALF_H * 2),
        );
        continue;
      }
      const base = [
        {
          x: ORIGIN_X + (building.tile.column - building.tile.row) * HALF_W,
          y: ORIGIN_Y + (building.tile.column + building.tile.row) * HALF_H,
        },
        {
          x:
            ORIGIN_X +
            (building.tile.column + columns - building.tile.row) * HALF_W,
          y:
            ORIGIN_Y +
            (building.tile.column + columns + building.tile.row) * HALF_H,
        },
        {
          x:
            ORIGIN_X +
            (building.tile.column + columns - building.tile.row - rows) *
              HALF_W,
          y:
            ORIGIN_Y +
            (building.tile.column + columns + building.tile.row + rows) *
              HALF_H,
        },
        {
          x:
            ORIGIN_X +
            (building.tile.column - building.tile.row - rows) * HALF_W,
          y:
            ORIGIN_Y +
            (building.tile.column + building.tile.row + rows) * HALF_H,
        },
      ];
      if (building.kind === 'strawberry-field') {
        g.fillStyle(0x8b6842);
        g.fillPoints(base, true);
        g.lineStyle(3, 0x604b35, 0.9);
        for (let row = 1; row < rows; row++) {
          const start = {
            x: base[0]!.x + ((base[3]!.x - base[0]!.x) * row) / rows,
            y: base[0]!.y + ((base[3]!.y - base[0]!.y) * row) / rows,
          };
          const end = {
            x: base[1]!.x + ((base[2]!.x - base[1]!.x) * row) / rows,
            y: base[1]!.y + ((base[2]!.y - base[1]!.y) * row) / rows,
          };
          g.lineBetween(start.x, start.y, end.x, end.y);
          for (let column = 1; column < columns; column++) {
            const fraction = column / columns;
            g.fillStyle(0x3f7540);
            g.fillCircle(
              start.x + (end.x - start.x) * fraction,
              start.y + (end.y - start.y) * fraction - 3,
              5,
            );
            g.fillStyle(0xc9473e);
            g.fillCircle(
              start.x + (end.x - start.x) * fraction + 2,
              start.y + (end.y - start.y) * fraction - 6,
              2.5,
            );
          }
        }
        continue;
      }
      g.fillStyle(0x3c5632, 0.28);
      g.fillEllipse(x + 9, y + 10, 76, 24);
      const roof = base.map((point) => ({ x: point.x, y: point.y - 49 }));
      if (building.kind === 'pavilion') {
        g.fillStyle(0xf0d8ad);
        for (const point of roof) g.fillRect(point.x - 2, point.y, 5, 38);
        g.fillStyle(0x6a8e58);
        g.fillPoints(roof, true);
        g.lineStyle(2, 0xe9d5a7, 0.85);
        g.strokePoints(roof, true);
        continue;
      }
      g.fillStyle(building.kind === 'barn' ? 0xd67d62 : 0xf0d5a5);
      g.fillPoints([base[0]!, base[1]!, roof[1]!, roof[0]!], true);
      g.fillStyle(building.kind === 'barn' ? 0xb95242 : 0xd0a875);
      g.fillPoints([base[1]!, base[2]!, roof[2]!, roof[1]!], true);
      g.fillStyle(
        building.kind === 'barn'
          ? 0x8e302d
          : building.kind === 'tool-shed'
            ? 0x795235
            : 0xb94838,
      );
      g.fillPoints(roof, true);
      g.lineStyle(2, building.kind === 'tool-shed' ? 0x513c2d : 0x8b332c, 0.75);
      g.strokePoints(roof, true);
      g.fillStyle(building.kind === 'barn' ? 0x71382f : 0x704b37);
      g.fillRect(x - (building.kind === 'barn' ? 12 : 7), y - 25, building.kind === 'barn' ? 24 : 14, 25);
      if (building.kind === 'tool-shed') {
        g.lineStyle(2, 0xe1c18d, 0.9);
        g.lineBetween(x - 7, y - 25, x + 7, y);
        g.lineBetween(x + 7, y - 25, x - 7, y);
      }
      if (building.kind === 'barn') {
        g.lineStyle(3, 0xf0d0a0, 0.9);
        g.lineBetween(x - 12, y - 25, x, y - 6);
        g.lineBetween(x, y - 6, x + 12, y - 25);
      }
      if (building.kind === 'stall') {
        g.fillStyle(0xf5d577);
        g.fillCircle(x - 8, y - 29, 3);
        g.fillCircle(x + 8, y - 29, 3);
      }
    }
  }
}
