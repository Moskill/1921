import Phaser from 'phaser';
import { ParkScene } from './game/ParkScene';
import {
  BUILDING_ECONOMY,
  BUILDING_UNLOCK_YEARS,
  isBuildingUnlocked,
  STRAWBERRY_FIELDS_LAND_COST,
  STARTING_YEAR,
} from './simulation/game';
import type { BuildingKind } from './simulation/park';
import './style.css';

type BuildingCategory = 'gastro' | 'handel' | 'erlebnis' | 'sonstiges';
type CatalogItem = {
  id: string;
  kind: BuildingKind | null;
  label: string;
  icon: string;
  size: string;
  availableFromYear: number;
  implemented: boolean;
};

const catalog: Record<
  BuildingCategory,
  CatalogItem[]
> = {
  gastro: [
    {
      id: 'farm-shop',
      kind: null,
      label: 'Hofladen',
      icon: '🏡',
      size: '2 x 3',
      availableFromYear: STARTING_YEAR,
      implemented: false,
    },
    {
      id: 'stall',
      kind: 'stall',
      label: 'Marktstand',
      icon: '🏪',
      size: '2 x 3',
      availableFromYear: BUILDING_UNLOCK_YEARS.stall,
      implemented: true,
    },
  ],
  handel: [
    {
      id: 'pavilion',
      kind: 'pavilion',
      label: 'Pavillon',
      icon: '🏛️',
      size: '2 x 2',
      availableFromYear: BUILDING_UNLOCK_YEARS.pavilion,
      implemented: true,
    },
  ],
  erlebnis: [
    {
      id: 'coaster',
      kind: 'coaster',
      label: 'Raupenbahn',
      icon: '🎢',
      size: '3 x 2',
      availableFromYear: BUILDING_UNLOCK_YEARS.coaster,
      implemented: true,
    },
    {
      id: 'shooting-gallery',
      kind: 'shooting-gallery',
      label: 'Schießbude',
      icon: '🎯',
      size: '2 x 1',
      availableFromYear: BUILDING_UNLOCK_YEARS['shooting-gallery'],
      implemented: true,
    },
  ],
  sonstiges: [
    {
      id: 'strawberry-field',
      kind: 'strawberry-field',
      label: 'Erdbeerfeld',
      icon: '🍓',
      size: '3 x 3',
      availableFromYear: STARTING_YEAR,
      implemented: true,
    },
    {
      id: 'tool-shed',
      kind: 'tool-shed',
      label: 'Geräteschuppen',
      icon: '🛖',
      size: '2 x 2',
      availableFromYear: BUILDING_UNLOCK_YEARS['tool-shed'],
      implemented: true,
    },
    {
      id: 'barn',
      kind: 'barn',
      label: 'Scheune',
      icon: '🛖',
      size: '3 x 2',
      availableFromYear: BUILDING_UNLOCK_YEARS.barn,
      implemented: true,
    },
    {
      id: 'litter-bin',
      kind: 'litter-bin',
      label: 'Mülleimer',
      icon: '🗑️',
      size: '1 x 1',
      availableFromYear: BUILDING_UNLOCK_YEARS['litter-bin'],
      implemented: true,
    },
    {
      id: 'restroom',
      kind: 'restroom',
      label: 'Toilettenhaus',
      icon: '🚻',
      size: '1 x 1',
      availableFromYear: BUILDING_UNLOCK_YEARS.restroom,
      implemented: true,
    },
    {
      id: 'road',
      kind: 'road',
      label: 'Weg gerade',
      icon: '🛤️',
      size: '1 x 1',
      availableFromYear: BUILDING_UNLOCK_YEARS.road,
      implemented: true,
    },
    {
      id: 'road-plus',
      kind: 'road-plus',
      label: 'Befestigter Weg',
      icon: '🛤️',
      size: '1 x 1',
      availableFromYear: BUILDING_UNLOCK_YEARS['road-plus'],
      implemented: true,
    },
  ],
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div><span class="eyebrow">PROTOTYP 0.1</span><h1>Mein Erlebnispark</h1></div>
      <div class="header-status">
        <span id="game-clock">1921 · Tag 1 · 08:00</span>
        <div class="stats" aria-live="polite">
          <span><small>Vermögen</small><strong id="balance">1.000 RM</strong></span>
          <span><small>Einnahmen / h</small><strong id="income-per-hour">0 RM</strong></span>
          <span><small>Ausgaben / h</small><strong id="expenses-per-hour">0 RM</strong></span>
          <span><small>Mitarbeiter</small><strong id="employees">0</strong></span>
        </div>
      </div>
    </header>
    <section class="play-area" aria-label="Parkkarte">
      <div id="game"></div>
      <div class="hint">Tippen: Stand bauen · Ziehen: Karte bewegen</div>
      <button id="land-arrow" class="land-arrow" type="button" aria-label="Land kaufen öffnen" aria-haspopup="dialog" disabled>↓</button>
      <div class="zoom"><button id="zoom-in" aria-label="Vergrößern">+</button><button id="zoom-out" aria-label="Verkleinern">−</button></div>
      <section id="land-overlay" class="land-overlay" role="dialog" aria-modal="true" aria-labelledby="land-title" hidden>
        <div class="land-panel">
          <button id="land-close" class="land-close" type="button" aria-label="Schließen">×</button>
          <h2 id="land-title">Land kaufen</h2>
          <p id="land-description">Kaufe das angrenzende Gelände, um die Erdbeerfelder freizuschalten.</p>
          <p id="land-message" class="land-message" role="status" aria-live="polite"></p>
          <button id="land-purchase" class="land-purchase" type="button">Land kaufen · 500 RM</button>
          <button id="land-open-fields" class="land-purchase" type="button" hidden>Erdbeerfelder öffnen</button>
        </div>
      </section>
    </section>
    <footer class="build-hud" aria-label="Parkverwaltung und Bauen">
      <section class="player-profile" aria-label="Spielerbild">
        <button id="player-image-button" class="player-avatar" type="button" aria-label="Spielerbild hochladen">
          <span class="avatar-placeholder" aria-hidden="true">👤</span>
          <img id="player-image" alt="" hidden>
          <span class="avatar-edit" aria-hidden="true">+</span>
        </button>
        <span class="player-name">Spieler</span>
        <input id="player-image-input" type="file" accept="image/*" hidden>
        <span id="player-image-status" class="visually-hidden" role="status" aria-live="polite"></span>
      </section>
      <section class="build-catalog" aria-label="Baukatalog">
        <div class="category-tabs" role="group" aria-label="Kategorien">
          <button class="category-tab is-selected" type="button" data-category="gastro" aria-pressed="true">Gastro</button>
          <button class="category-tab" type="button" data-category="handel" aria-pressed="false">Handel</button>
          <button class="category-tab" type="button" data-category="erlebnis" aria-pressed="false">Erlebnis</button>
          <button class="category-tab" type="button" data-category="sonstiges" aria-pressed="false">Sonstiges</button>
        </div>
        <div id="building-options" class="building-options" role="group" aria-label="Gebäude in Gastro"></div>
      </section>
      <button id="map-switcher" class="map-switcher" type="button" aria-label="Erdbeerfelder öffnen" aria-pressed="false" disabled>🍓 Erdbeerfelder</button>
      <span id="build-hint" class="build-hint" role="status" aria-live="polite">Karte antippen zum Platzieren</span>
    </footer>
    <div class="rotate" role="status">Bitte drehe dein Smartphone ins Querformat ↻</div>
    <section id="menu-overlay" class="menu-overlay" data-mode="welcome" role="dialog" aria-modal="true" aria-labelledby="menu-title">
      <div id="menu-panel" class="menu-panel">
        <span class="eyebrow">MEIN ERLEBNISDORF</span>
        <h2 id="menu-title">Willkommen</h2>
        <p id="menu-subtitle" class="menu-subtitle">Dein Park wartet auf den ersten Schritt.</p>
        <nav class="main-menu" aria-label="Hauptmenü">
          <button id="new-village" class="menu-button menu-button-primary" type="button">Neues Erlebnisdorf</button>
          <button id="load-game" class="menu-button" type="button" disabled>Laden</button>
          <button id="save-game" class="menu-button" type="button" disabled>Speichern</button>
          <button class="menu-button" type="button" disabled>Erlebnisdörfer</button>
          <button class="menu-button" type="button" disabled>Einstellungen</button>
          <button class="menu-button" type="button" disabled>Credits</button>
          <button id="quit-game" class="menu-button menu-button-quit" type="button">Beenden</button>
        </nav>
        <p id="save-status" class="save-status" role="status" aria-live="polite"></p>
        <p id="menu-hint" class="menu-hint" hidden>Escape schließt das Menü.</p>
      </div>
      <div id="exit-panel" class="exit-panel" hidden>
        <span class="eyebrow">BIS BALD</span>
        <h2>Erlebnisdorf beendet</h2>
        <p>Du kannst dieses Fenster jetzt schließen.</p>
      </div>
    </section>
  </main>
`;

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: '#c9dfac',
  scale: {
    mode: Phaser.Scale.RESIZE,
    width: 960,
    height: 540,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [ParkScene],
  input: { activePointers: 2 },
});

document.querySelector('#zoom-in')?.addEventListener('click', () => {
  (game.scene.getScene('ParkScene') as ParkScene).zoom(0.1);
});
document.querySelector('#zoom-out')?.addEventListener('click', () => {
  (game.scene.getScene('ParkScene') as ParkScene).zoom(-0.1);
});
window.addEventListener('park:placed', (event) => {
  const count = document.querySelector('#count');
  if (count) count.textContent = String((event as CustomEvent<number>).detail);
});
function formatMoney(amount: number): string {
  return `${Math.round(amount).toLocaleString('de-DE')} RM`;
}

window.addEventListener('park:simulation-updated', (event) => {
  const { day, time, year, metrics } = (
    event as CustomEvent<{
      day: number;
      time: string;
      year: number;
      metrics: Record<string, number>;
    }>
  ).detail;
  document.querySelector('#game-clock')!.textContent =
    `${year} · Tag ${day} · ${time}`;
  updateBuildingAvailability(year);
  document.querySelector('#income-per-hour')!.textContent = formatMoney(metrics.incomePerHour!);
  document.querySelector('#balance')!.textContent = formatMoney(metrics.balance!);
  document.querySelector('#expenses-per-hour')!.textContent = formatMoney(metrics.expensesPerHour!);
  document.querySelector('#employees')!.textContent = String(metrics.employees);
});

const buildingOptions =
  document.querySelector<HTMLDivElement>('#building-options')!;
const mapSwitcher = document.querySelector<HTMLButtonElement>('#map-switcher')!;
const landArrow = document.querySelector<HTMLButtonElement>('#land-arrow')!;
const landOverlay = document.querySelector<HTMLElement>('#land-overlay')!;
const landMessage = document.querySelector<HTMLParagraphElement>('#land-message')!;
const landPurchase = document.querySelector<HTMLButtonElement>('#land-purchase')!;
const landOpenFields = document.querySelector<HTMLButtonElement>('#land-open-fields')!;
const playArea = document.querySelector<HTMLElement>('.play-area')!;
let selectedBuilding: BuildingKind | null = 'road';
let currentMap: 'park' | 'strawberry-fields' = 'park';
let displayedYear = STARTING_YEAR;
let landUnlocked = false;

function switchMap(map: 'park' | 'strawberry-fields'): void {
  if (map === 'strawberry-fields' && !landUnlocked) return;
  currentMap = map;
  (game.scene.getScene('ParkScene') as ParkScene).setMap(map);
  const onFields = map === 'strawberry-fields';
  mapSwitcher.textContent = onFields ? 'Zurück zum Park' : '🍓 Erdbeerfelder';
  mapSwitcher.setAttribute('aria-label', onFields ? 'Zurück zum Park' : 'Erdbeerfelder öffnen');
  mapSwitcher.setAttribute('aria-pressed', String(onFields));
  playArea.setAttribute('aria-label', onFields ? 'Erdbeerfelder' : 'Parkkarte');
}

function updateLandAccess(unlocked: boolean): void {
  landUnlocked = unlocked;
  mapSwitcher.disabled = !unlocked;
  landPurchase.hidden = unlocked;
  landOpenFields.hidden = !unlocked;
  landMessage.textContent = unlocked
    ? 'Das Gelände gehört jetzt zu deinem Erlebnisdorf.'
    : '';
  landArrow.setAttribute(
    'aria-label',
    unlocked ? 'Erdbeerfelder öffnen' : 'Land kaufen öffnen',
  );
  const selectedCategory = document
    .querySelector<HTMLButtonElement>('.category-tab.is-selected')
    ?.dataset.category as BuildingCategory | undefined;
  if (selectedCategory) showCategory(selectedCategory);
}

mapSwitcher.addEventListener('click', () => {
  switchMap(currentMap === 'park' ? 'strawberry-fields' : 'park');
});
landArrow.addEventListener('click', () => {
  landMessage.textContent = landUnlocked
    ? 'Das Gelände gehört jetzt zu deinem Erlebnisdorf.'
    : '';
  landOverlay.hidden = false;
  if (landUnlocked) landOpenFields.focus();
  else landPurchase.focus();
});
document.querySelector<HTMLButtonElement>('#land-close')!.addEventListener('click', () => {
  landOverlay.hidden = true;
  landArrow.focus();
});
landOverlay.addEventListener('click', (event) => {
  if (event.target === landOverlay) landOverlay.hidden = true;
});
landPurchase.addEventListener('click', () => {
  const scene = game.scene.getScene('ParkScene') as ParkScene;
  const result = scene.purchaseStrawberryFields();
  if (result === 'insufficient-funds') {
    landMessage.textContent =
      `Nicht genug Vermögen. Benötigt werden ${formatMoney(STRAWBERRY_FIELDS_LAND_COST)}.`;
    return;
  }
  updateLandAccess(scene.hasStrawberryFieldsUnlocked());
  landOverlay.hidden = true;
});
landOpenFields.addEventListener('click', () => {
  switchMap('strawberry-fields');
  landOverlay.hidden = true;
});

function selectBuilding(kind: BuildingKind | null): void {
  selectedBuilding = kind;
  buildingOptions
    .querySelectorAll<HTMLButtonElement>('.building-option')
    .forEach((button) => {
      const selected = kind !== null && button.dataset.building === kind;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  window.dispatchEvent(
    new CustomEvent('park:select-building', { detail: kind }),
  );
}

function showCategory(category: BuildingCategory): void {
  document
    .querySelectorAll<HTMLButtonElement>('.category-tab')
    .forEach((button) => {
      const selected = button.dataset.category === category;
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  buildingOptions.replaceChildren();
  buildingOptions.setAttribute('aria-label', `Gebäude in ${category}`);
  const items = catalog[category];
  if (
    !items.some(
      (item) =>
        item.kind === selectedBuilding &&
        item.implemented &&
        item.kind !== null &&
        isBuildingUnlocked(item.kind, displayedYear) &&
        (item.kind !== 'strawberry-field' || landUnlocked),
    )
  ) {
    selectedBuilding =
      items.find(
        (item) =>
          item.kind !== null &&
          item.implemented &&
          isBuildingUnlocked(item.kind, displayedYear) &&
          (item.kind !== 'strawberry-field' || landUnlocked),
      )?.kind ?? null;
  }
  for (const item of items) {
    const button = document.createElement('button');
    button.className = 'building-option';
    button.type = 'button';
    button.dataset.catalogItem = item.id;
    if (item.kind) button.dataset.building = item.kind;
    const constructionCost = item.kind
      ? BUILDING_ECONOMY[item.kind].constructionCost
      : null;
    const unlocked = item.kind
      ? isBuildingUnlocked(item.kind, displayedYear)
      : item.availableFromYear <= displayedYear;
    button.disabled = !item.implemented || !unlocked;
    const availabilityText = !item.implemented
      ? `In Planung · ab ${item.availableFromYear}`
      : unlocked
        ? formatMoney(constructionCost!)
        : `Ab ${item.availableFromYear}`;
    const landRequired =
      item.kind === 'strawberry-field' && !landUnlocked;
    if (landRequired) {
      button.disabled = true;
    }
    button.setAttribute(
      'aria-label',
      `${item.label}, ${item.size} Felder, ${
        landRequired ? 'Landkauf erforderlich' : availabilityText
      }`,
    );
    button.setAttribute(
      'aria-pressed',
      String(item.kind !== null && item.kind === selectedBuilding),
    );
    button.title = `${item.label} · ${item.size} Felder · ${
      landRequired ? 'Landkauf erforderlich' : availabilityText
    }`;
    if (item.kind === selectedBuilding) button.classList.add('is-selected');

    const icon = document.createElement('span');
    icon.className = 'building-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = item.icon;
    const label = document.createElement('span');
    label.className = 'building-label';
    label.textContent = item.label;
    const size = document.createElement('span');
    size.className = 'building-size';
    size.textContent = item.size;
    const cost = document.createElement('span');
    cost.className = 'building-cost';
    cost.textContent = landRequired ? 'Land kaufen' : availabilityText;
    button.append(icon, label, size, cost);
    if (item.kind && item.implemented && !landRequired) {
      button.addEventListener('click', () => selectBuilding(item.kind));
    }
    buildingOptions.append(button);
  }
  selectBuilding(selectedBuilding);
}

function updateBuildingAvailability(year: number): void {
  if (displayedYear === year) return;
  displayedYear = year;
  const category = document
    .querySelector<HTMLButtonElement>('.category-tab.is-selected')
    ?.dataset.category as BuildingCategory | undefined;
  if (category) showCategory(category);
}

document
  .querySelectorAll<HTMLButtonElement>('.category-tab')
  .forEach((button) => {
    button.addEventListener('click', () =>
      showCategory(button.dataset.category as BuildingCategory),
    );
  });
showCategory('sonstiges');

window.addEventListener('park:insufficient-capital', (event) => {
  const { cost } = (event as CustomEvent<{ cost: number }>).detail;
  const buildHint = document.querySelector<HTMLSpanElement>('#build-hint')!;
  buildHint.textContent = `Nicht genug Vermögen · benötigt ${formatMoney(cost)}`;
  window.setTimeout(() => {
    buildHint.textContent = 'Karte antippen zum Platzieren';
  }, 2500);
});

const menuOverlay = document.querySelector<HTMLElement>('#menu-overlay')!;
const menuPanel = document.querySelector<HTMLDivElement>('#menu-panel')!;
const menuTitle = document.querySelector<HTMLHeadingElement>('#menu-title')!;
const menuSubtitle =
  document.querySelector<HTMLParagraphElement>('#menu-subtitle')!;
const menuHint = document.querySelector<HTMLParagraphElement>('#menu-hint')!;
const exitPanel = document.querySelector<HTMLDivElement>('#exit-panel')!;
const newVillageButton =
  document.querySelector<HTMLButtonElement>('#new-village')!;
const saveGameButton = document.querySelector<HTMLButtonElement>('#save-game')!;
const loadGameButton = document.querySelector<HTMLButtonElement>('#load-game')!;
const saveStatus =
  document.querySelector<HTMLParagraphElement>('#save-status')!;
let gameStarted = false;

try {
  loadGameButton.disabled = !localStorage.getItem('erlebnisdorf.manual-save.v1');
} catch {
  loadGameButton.disabled = true;
}

function openPauseMenu(): void {
  (game.scene.getScene('ParkScene') as ParkScene).pauseGame();
  menuOverlay.dataset.mode = 'pause';
  menuTitle.textContent = 'Spielmenü';
  menuSubtitle.textContent = 'Dein Erlebnisdorf ist pausiert.';
  menuHint.hidden = false;
  menuOverlay.hidden = false;
  newVillageButton.focus();
}

function startNewVillage(): void {
  switchMap('park');
  const scene = game.scene.getScene('ParkScene') as ParkScene;
  scene.resetPark();
  updateLandAccess(false);
  scene.startGame();
  showCategory('sonstiges');
  gameStarted = true;
  landArrow.disabled = false;
  saveGameButton.disabled = false;
  saveStatus.textContent = '';
  menuOverlay.hidden = true;
  menuHint.hidden = true;
}

newVillageButton.addEventListener('click', startNewVillage);
saveGameButton.addEventListener('click', () => {
  if (!gameStarted) return;
  const snapshot = (
    game.scene.getScene('ParkScene') as ParkScene
  ).getSaveSnapshot();
  try {
    localStorage.setItem(
      'erlebnisdorf.manual-save.v1',
      JSON.stringify(snapshot),
    );
    const savedTime = new Date(snapshot.savedAt).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    });
    saveStatus.textContent = `Spielstand gespeichert · ${savedTime}`;
    loadGameButton.disabled = false;
  } catch {
    saveStatus.textContent =
      'Speichern nicht möglich. Prüfe den verfügbaren Browserspeicher.';
  }
});
loadGameButton.addEventListener('click', () => {
  let rawSave: string | null;
  try {
    rawSave = localStorage.getItem('erlebnisdorf.manual-save.v1');
  } catch {
    saveStatus.textContent = 'Der Spielstand kann nicht gelesen werden.';
    return;
  }
  if (!rawSave) {
    loadGameButton.disabled = true;
    saveStatus.textContent = 'Es wurde kein gespeicherter Spielstand gefunden.';
    return;
  }

  try {
    const snapshot: unknown = JSON.parse(rawSave);
    const scene = game.scene.getScene('ParkScene') as ParkScene;
    if (!scene.loadSaveSnapshot(snapshot)) {
      saveStatus.textContent =
        'Der Spielstand ist beschädigt oder stammt aus einer inkompatiblen Version.';
      return;
    }
    switchMap('park');
    updateLandAccess(scene.hasStrawberryFieldsUnlocked());
    const selectedBuilding = scene.getSaveSnapshot().selectedBuilding;
    const category = Object.entries(catalog).find(([, items]) =>
      items.some((item) => item.kind === selectedBuilding),
    )?.[0] as BuildingCategory | undefined;
    if (selectedBuilding) {
      selectBuilding(selectedBuilding);
      showCategory(category ?? 'gastro');
    } else {
      showCategory('gastro');
      selectBuilding(null);
    }
    scene.startGame();
    gameStarted = true;
    landArrow.disabled = false;
    saveGameButton.disabled = false;
    saveStatus.textContent = 'Spielstand geladen.';
    menuOverlay.hidden = true;
    menuHint.hidden = true;
  } catch {
    saveStatus.textContent = 'Der Spielstand konnte nicht geladen werden.';
  }
});
document
  .querySelector<HTMLButtonElement>('#quit-game')!
  .addEventListener('click', () => {
    if (!window.confirm('Möchtest du das Erlebnisdorf wirklich beenden?'))
      return;
    menuPanel.hidden = true;
    exitPanel.hidden = false;
    document.title = 'Erlebnisdorf beendet';
    window.close();
  });

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !gameStarted) return;
  event.preventDefault();
  if (!landOverlay.hidden) {
    landOverlay.hidden = true;
    landArrow.focus();
    return;
  }
  if (menuOverlay.hidden) openPauseMenu();
  else {
    menuOverlay.hidden = true;
    menuHint.hidden = true;
    (game.scene.getScene('ParkScene') as ParkScene).resumeGame();
  }
});

const avatarButton = document.querySelector<HTMLButtonElement>(
  '#player-image-button',
)!;
const avatarInput = document.querySelector<HTMLInputElement>(
  '#player-image-input',
)!;
const avatarImage = document.querySelector<HTMLImageElement>('#player-image')!;
const avatarStatus = document.querySelector<HTMLSpanElement>(
  '#player-image-status',
)!;

function showPlayerImage(source: string): void {
  avatarImage.src = source;
  avatarImage.hidden = false;
  avatarButton.classList.add('has-image');
}

try {
  const savedImage = localStorage.getItem('park-player-image');
  if (savedImage) showPlayerImage(savedImage);
} catch {
  avatarStatus.textContent = 'Spielerbild konnte nicht geladen werden.';
}

avatarButton.addEventListener('click', () => avatarInput.click());
avatarInput.addEventListener('change', () => {
  const file = avatarInput.files?.[0];
  if (!file) return;
  if (file.size > 1_500_000) {
    avatarStatus.textContent = 'Das Bild darf maximal 1,5 MB groß sein.';
    avatarInput.value = '';
    return;
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    if (typeof reader.result !== 'string') return;
    showPlayerImage(reader.result);
    avatarStatus.textContent = 'Spielerbild aktualisiert.';
    try {
      localStorage.setItem('park-player-image', reader.result);
    } catch {
      avatarStatus.textContent = 'Spielerbild für diese Sitzung aktualisiert.';
    }
  });
  reader.readAsDataURL(file);
});
