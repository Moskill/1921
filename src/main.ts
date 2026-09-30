import Phaser from 'phaser';
import { ParkScene } from './game/ParkScene';
import type { BuildingKind } from './simulation/park';
import './style.css';

type BuildingCategory = 'gastro' | 'handel' | 'erlebnis' | 'sonstiges';

const catalog: Record<
  BuildingCategory,
  { kind: BuildingKind; label: string; icon: string; size: string }[]
> = {
  gastro: [{ kind: 'stall', label: 'Marktstand', icon: '🏪', size: '2 x 3' }],
  handel: [{ kind: 'pavilion', label: 'Pavillon', icon: '🏛️', size: '2 x 2' }],
  erlebnis: [
    { kind: 'coaster', label: 'Raupenbahn', icon: '🎢', size: '3 x 2' },
    {
      kind: 'shooting-gallery',
      label: 'Schießbude',
      icon: '🎯',
      size: '2 x 1',
    },
  ],
  sonstiges: [
    { kind: 'litter-bin', label: 'Mülleimer', icon: '🗑️', size: '1 x 1' },
    { kind: 'restroom', label: 'Toilettenhaus', icon: '🚻', size: '1 x 1' },
    { kind: 'road', label: 'Weg gerade', icon: '🛤️', size: '1 x 1' },
    { kind: 'road-plus', label: 'Befestigter Weg', icon: '🛤️', size: '1 x 1' },
  ],
};

document.querySelector<HTMLDivElement>('#app')!.innerHTML = `
  <main class="shell">
    <header class="topbar">
      <div><span class="eyebrow">PROTOTYP 0.1</span><h1>Mein Erlebnispark</h1></div>
      <div class="stats"><span>🏠 Gebäude: <strong id="count">0</strong></span><span>🎟️ Tag 1</span></div>
    </header>
    <section class="play-area" aria-label="Parkkarte">
      <div id="game"></div>
      <div class="hint">Tippen: Stand bauen · Ziehen: Karte bewegen</div>
      <div class="zoom"><button id="zoom-in" aria-label="Vergrößern">+</button><button id="zoom-out" aria-label="Verkleinern">−</button></div>
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
      <span class="build-hint">Karte antippen zum Platzieren</span>
    </footer>
    <div class="rotate" role="status">Bitte drehe dein Smartphone ins Querformat ↻</div>
    <section id="menu-overlay" class="menu-overlay" data-mode="welcome" role="dialog" aria-modal="true" aria-labelledby="menu-title">
      <div id="menu-panel" class="menu-panel">
        <span class="eyebrow">MEIN ERLEBNISDORF</span>
        <h2 id="menu-title">Willkommen</h2>
        <p id="menu-subtitle" class="menu-subtitle">Dein Park wartet auf den ersten Schritt.</p>
        <nav class="main-menu" aria-label="Hauptmenü">
          <button id="new-village" class="menu-button menu-button-primary" type="button">Neues Erlebnisdorf</button>
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

const buildingOptions =
  document.querySelector<HTMLDivElement>('#building-options')!;
let selectedBuilding: BuildingKind | null = 'stall';

function selectBuilding(kind: BuildingKind | null): void {
  selectedBuilding = kind;
  buildingOptions
    .querySelectorAll<HTMLButtonElement>('.building-option')
    .forEach((button) => {
      const selected = button.dataset.building === kind;
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
  if (!items.some((item) => item.kind === selectedBuilding)) {
    selectedBuilding = items[0]!.kind;
  }
  for (const item of items) {
    const button = document.createElement('button');
    button.className = 'building-option';
    button.type = 'button';
    button.dataset.building = item.kind;
    button.setAttribute('aria-label', `${item.label}, ${item.size} Felder`);
    button.setAttribute('aria-pressed', String(item.kind === selectedBuilding));
    button.title = `${item.label} · ${item.size} Felder`;
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
    button.append(icon, label, size);
    button.addEventListener('click', () => selectBuilding(item.kind));
    buildingOptions.append(button);
  }
  selectBuilding(selectedBuilding);
}

document
  .querySelectorAll<HTMLButtonElement>('.category-tab')
  .forEach((button) => {
    button.addEventListener('click', () =>
      showCategory(button.dataset.category as BuildingCategory),
    );
  });
showCategory('gastro');

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
const saveStatus =
  document.querySelector<HTMLParagraphElement>('#save-status')!;
let gameStarted = false;

function openPauseMenu(): void {
  menuOverlay.dataset.mode = 'pause';
  menuTitle.textContent = 'Spielmenü';
  menuSubtitle.textContent = 'Dein Erlebnisdorf ist pausiert.';
  menuHint.hidden = false;
  menuOverlay.hidden = false;
  newVillageButton.focus();
}

function startNewVillage(): void {
  (game.scene.getScene('ParkScene') as ParkScene).resetPark();
  showCategory('gastro');
  gameStarted = true;
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
  } catch {
    saveStatus.textContent =
      'Speichern nicht möglich. Prüfe den verfügbaren Browserspeicher.';
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
  if (menuOverlay.hidden) openPauseMenu();
  else {
    menuOverlay.hidden = true;
    menuHint.hidden = true;
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
