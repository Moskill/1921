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
  selectedBuilding: BuildingKind | null;
  camera: { scrollX: number; scrollY: number; zoom: number };
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
  private selectedBuilding: BuildingKind | null = 'stall';
  private dragStart?: {
    x: number;
    y: number;
    cameraX: number;
    cameraY: number;
  };
  private moved = false;

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

  zoom(delta: number): void {
    this.cameras.main.setZoom(
      Phaser.Math.Clamp(this.cameras.main.zoom + delta, 0.55, 2),
    );
  }

  resetPark(): void {
    this.park = new Park();
    this.resetVisitor();
    this.dragStart = undefined;
    this.moved = false;
    this.cameras.main.setZoom(1);
    this.cameras.main.centerOn(MAP_WIDTH / 2, MAP_HEIGHT / 2);
    this.drawBuildings();
    window.dispatchEvent(new CustomEvent('park:placed', { detail: 0 }));
  }

  getSaveSnapshot(): ParkSaveSnapshot {
    return {
      version: 1,
      savedAt: new Date().toISOString(),
      buildings: this.park.getBuildings().map((building) => ({
        ...building,
        tile: { ...building.tile },
      })),
      selectedBuilding: this.selectedBuilding,
      camera: {
        scrollX: this.cameras.main.scrollX,
        scrollY: this.cameras.main.scrollY,
        zoom: this.cameras.main.zoom,
      },
    };
  }

  private place(tile: Tile): void {
    if (!this.selectedBuilding) return;
    if (!this.park.place(tile, this.selectedBuilding)) return;
    this.drawBuildings();
    const count = this.park
      .getBuildings()
      .filter(
        (building) => building.kind !== 'road' && building.kind !== 'road-plus',
      ).length;
    window.dispatchEvent(new CustomEvent('park:placed', { detail: count }));
  }

  private scheduleVisitorSpawn(): void {
    this.visitorRespawn = this.time.delayedCall(
      Phaser.Math.Between(500, 2500),
      () => this.spawnVisitor(),
    );
  }

  private spawnVisitor(): void {
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
    this.previousVisitorTile = undefined;
    this.scheduleVisitorSpawn();
  }

  private resetVisitor(): void {
    this.visitorTween?.stop();
    this.visitorRespawn?.remove(false);
    this.visitor?.setVisible(false);
    this.visitorShadow?.setVisible(false);
    this.visitorTile = undefined;
    this.previousVisitorTile = undefined;
    this.scheduleVisitorSpawn();
  }

  private drawGround(): void {
    const g = this.ground;
    if (!g) return;
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
        const path = isGroundPath({ column, row });
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
        details?.lineStyle(1, path ? 0xb2a783 : 0x79a25f, 0.25);
        details?.strokePoints(tileCorners, true);
        if (!path && (column * 13 + row * 7) % 11 === 0) {
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
    const canPlace = this.park.canPlace(tile, this.selectedBuilding);
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
    const ordered = [...this.park.getBuildings()].sort(
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
      g.fillStyle(0x3c5632, 0.28);
      g.fillEllipse(x + 9, y + 10, 76, 24);
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
      g.fillStyle(0xf0d5a5);
      g.fillPoints([base[0]!, base[1]!, roof[1]!, roof[0]!], true);
      g.fillStyle(0xd0a875);
      g.fillPoints([base[1]!, base[2]!, roof[2]!, roof[1]!], true);
      g.fillStyle(0xb94838);
      g.fillPoints(roof, true);
      g.lineStyle(2, 0x8b332c, 0.75);
      g.strokePoints(roof, true);
      g.fillStyle(0x704b37);
      g.fillRect(x - 5, y - 18, 10, 18);
      if (building.kind === 'stall') {
        g.fillStyle(0xf5d577);
        g.fillCircle(x - 8, y - 29, 3);
        g.fillCircle(x + 8, y - 29, 3);
      }
    }
  }
}
